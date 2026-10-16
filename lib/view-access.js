import crypto from 'crypto';
import { cookies } from 'next/headers';
import { unstable_noStore as noStore } from 'next/cache';
import { sql } from './db';
import { hashRecoveryKey, verifyRecoveryKey } from './auth';
import { hashToken, generateRawToken } from './security';
import { calculateDebtInterestSummary, ensureDebtRateChangesTable } from './debtInterest';
import {
  enrichDebtWithDashboardMetrics,
  ensureDebtMetadataColumns,
  listDebtCategories,
  listDebtInstrumentTags,
  normalizeDebtInstrumentTag,
  normalizeDebtPriority,
} from './debtDashboard';

const VIEW_COOKIE = 'debt_view';
const VIEW_HOURS = 24;
const MAX_ATTEMPTS = 5;
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

let tablesReady = null;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

export function normalizeViewToken(value) {
  const token = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export function generateViewPassword() {
  const chars = [];
  while (chars.length < 16) {
    const bytes = crypto.randomBytes(32);
    for (const byte of bytes) {
      if (byte >= 256 - (256 % PASSWORD_ALPHABET.length)) continue;
      chars.push(PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]);
      if (chars.length === 16) break;
    }
  }
  return [0, 4, 8, 12].map((start) => chars.slice(start, start + 4).join('')).join('-');
}

export async function ensureViewTables() {
  if (!tablesReady) {
    tablesReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS portfolio_view_links (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          failed_attempts INT NOT NULL DEFAULT 0,
          locked_until TIMESTAMPTZ,
          revoked_at TIMESTAMPTZ,
          last_viewed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT now()
        )
      `;
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolio_view_links_active_user
        ON portfolio_view_links (user_id)
        WHERE revoked_at IS NULL
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS portfolio_view_sessions (
          token_hash TEXT PRIMARY KEY,
          link_id UUID NOT NULL REFERENCES portfolio_view_links(id) ON DELETE CASCADE,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ DEFAULT now()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_portfolio_view_sessions_link
        ON portfolio_view_sessions(link_id)
      `;
    })().catch((err) => {
      tablesReady = null;
      throw err;
    });
  }
  await tablesReady;
}

async function findActiveLink(rawToken) {
  const token = normalizeViewToken(rawToken);
  if (!token) return null;
  const rows = await sql`
    SELECT id, user_id, password_hash, failed_attempts, locked_until
    FROM portfolio_view_links
    WHERE token_hash = ${hashToken(token)} AND revoked_at IS NULL
    LIMIT 1
  `;
  return rows[0] || null;
}

function viewCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: VIEW_HOURS * 60 * 60,
  };
}

async function createViewSession(linkId) {
  const raw = generateRawToken();
  await sql`
    INSERT INTO portfolio_view_sessions (token_hash, link_id, expires_at)
    VALUES (${hashToken(raw)}, ${linkId}, now() + interval '24 hours')
  `;
  cookies().set(VIEW_COOKIE, raw, viewCookieOptions());
}

export async function getViewLinkStatus(userId) {
  await ensureViewTables();
  const rows = await sql`
    SELECT created_at, last_viewed_at, locked_until
    FROM portfolio_view_links
    WHERE user_id = ${userId} AND revoked_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (!rows[0]) return { active: false };
  return {
    active: true,
    createdAt: rows[0].created_at,
    lastViewedAt: rows[0].last_viewed_at,
    lockedUntil: rows[0].locked_until,
  };
}

export async function issueViewLink(userId) {
  await ensureViewTables();
  const rawToken = generateRawToken();
  const password = generateViewPassword();
  const passwordHash = await hashRecoveryKey(password);

  const existing = await sql`
    SELECT id
    FROM portfolio_view_links
    WHERE user_id = ${userId} AND revoked_at IS NULL
  `;
  if (existing.length) {
    const ids = existing.map((row) => row.id);
    await sql`DELETE FROM portfolio_view_sessions WHERE link_id = ANY(${ids})`;
    await sql`
      UPDATE portfolio_view_links
      SET revoked_at = now()
      WHERE user_id = ${userId} AND revoked_at IS NULL
    `;
  }

  const created = await sql`
    INSERT INTO portfolio_view_links (user_id, token_hash, password_hash)
    VALUES (${userId}, ${hashToken(rawToken)}, ${passwordHash})
    RETURNING created_at
  `;

  return {
    path: `/view/${rawToken}`,
    password,
    createdAt: created[0]?.created_at || new Date().toISOString(),
  };
}

export async function revokeViewLink(userId) {
  await ensureViewTables();
  const rows = await sql`
    UPDATE portfolio_view_links
    SET revoked_at = now()
    WHERE user_id = ${userId} AND revoked_at IS NULL
    RETURNING id
  `;
  if (!rows.length) return false;
  await sql`DELETE FROM portfolio_view_sessions WHERE link_id = ANY(${rows.map((row) => row.id)})`;
  return true;
}

export async function unlockViewLink(rawToken, password) {
  await ensureViewTables();
  const link = await findActiveLink(rawToken);
  if (!link) {
    return { ok: false, status: 404, error: 'This view link is not active.' };
  }

  if (link.locked_until && new Date(link.locked_until).getTime() > Date.now()) {
    return {
      ok: false,
      status: 429,
      error: 'Too many attempts. This link is paused for 15 minutes.',
      userId: link.user_id,
    };
  }

  const matches = await verifyRecoveryKey(String(password || ''), link.password_hash);
  if (!matches) {
    const attempts = Number(link.failed_attempts || 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await sql`
        UPDATE portfolio_view_links
        SET failed_attempts = 0, locked_until = now() + interval '15 minutes'
        WHERE id = ${link.id} AND revoked_at IS NULL
      `;
      return {
        ok: false,
        status: 429,
        error: 'Too many attempts. This link is paused for 15 minutes.',
        userId: link.user_id,
      };
    }
    await sql`
      UPDATE portfolio_view_links
      SET failed_attempts = ${attempts}
      WHERE id = ${link.id} AND revoked_at IS NULL
    `;
    return { ok: false, status: 401, error: 'Incorrect password.', userId: link.user_id };
  }

  await sql`
    UPDATE portfolio_view_links
    SET failed_attempts = 0, locked_until = NULL, last_viewed_at = now()
    WHERE id = ${link.id} AND revoked_at IS NULL
  `;
  await createViewSession(link.id);
  return { ok: true, userId: link.user_id };
}

export async function getViewAccess(rawToken) {
  noStore();
  await ensureViewTables();
  const token = normalizeViewToken(rawToken);
  const sessionToken = cookies().get(VIEW_COOKIE)?.value;
  if (!token || !sessionToken || sessionToken.length > 128) return null;

  const rows = await sql`
    SELECT l.user_id, u.name AS owner_name, s.expires_at
    FROM portfolio_view_sessions s
    JOIN portfolio_view_links l ON l.id = s.link_id
    JOIN users u ON u.id = l.user_id
    WHERE s.token_hash = ${hashToken(sessionToken)}
      AND l.token_hash = ${hashToken(token)}
      AND l.revoked_at IS NULL
      AND s.expires_at > now()
    LIMIT 1
  `;
  if (!rows[0]) return null;
  return {
    userId: rows[0].user_id,
    ownerName: rows[0].owner_name,
    expiresAt: rows[0].expires_at,
  };
}

export async function destroyViewSession() {
  const sessionToken = cookies().get(VIEW_COOKIE)?.value;
  if (sessionToken) {
    try {
      await sql`DELETE FROM portfolio_view_sessions WHERE token_hash = ${hashToken(sessionToken)}`;
    } catch {
      // The table may not exist yet. Clearing the cookie is still the right outcome.
    }
  }
  cookies().set(VIEW_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function viewLinkIsActive(rawToken) {
  noStore();
  await ensureViewTables();
  const link = await findActiveLink(rawToken);
  return !!link;
}

function sortDebtsForList(left, right) {
  if (left.status !== right.status) return left.status === 'active' ? -1 : 1;
  if (left.status === 'active' && right.status === 'active') {
    const interestDiff = Number(right.interest_rate || 0) - Number(left.interest_rate || 0);
    if (interestDiff !== 0) return interestDiff;
  }
  if (left.priority == null && right.priority != null) return 1;
  if (left.priority != null && right.priority == null) return -1;
  if (left.priority != null && right.priority != null && left.priority !== right.priority) {
    return left.priority - right.priority;
  }
  return Number(right.outstanding_total || 0) - Number(left.outstanding_total || 0);
}

function sanitizeDebt(debt) {
  const normalizedTag = normalizeDebtInstrumentTag(debt.instrument_tag);
  return {
    ...debt,
    priority: debt.priority == null ? null : normalizeDebtPriority(debt.priority),
    instrument_tag: Number.isNaN(normalizedTag) ? null : normalizedTag,
  };
}

async function prepareDebtTables() {
  await Promise.all([
    ensureDebtRateChangesTable(sql),
    ensureDebtMetadataColumns(sql),
  ]);
}

async function loadEnrichedDebts(userId) {
  const debts = await sql`
    SELECT
      d.*,
      COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'interest'), 0) AS total_interest_paid,
      COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'principal'), 0) AS total_principal_paid,
      COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'clearance'), 0) AS total_clearance_paid,
      COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'topup'), 0) AS total_topup_amount,
      COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type IN ('interest', 'principal', 'clearance')), 0) AS total_paid,
      MAX(p.payment_date) FILTER (WHERE p.payment_type IN ('interest', 'principal', 'clearance')) AS last_payment_date,
      MAX(p.payment_date) FILTER (WHERE p.payment_type = 'topup') AS last_topup_date
    FROM debts d
    LEFT JOIN debt_payments p ON p.debt_id = d.id
    WHERE d.user_id = ${userId}
    GROUP BY d.id
    ORDER BY d.created_at DESC
  `;

  if (!debts.length) return [];

  const [principalPayments, rateChanges] = await Promise.all([
    sql`
      SELECT p.debt_id, p.payment_date, p.payment_type, p.amount, p.created_at
      FROM debt_payments p
      INNER JOIN debts d ON d.id = p.debt_id
      WHERE d.user_id = ${userId}
        AND p.payment_type IN ('principal', 'clearance', 'topup')
      ORDER BY p.payment_date ASC, p.created_at ASC
    `,
    sql`
      SELECT rc.debt_id, rc.effective_month, rc.interest_rate, rc.created_at
      FROM debt_rate_changes rc
      INNER JOIN debts d ON d.id = rc.debt_id
      WHERE d.user_id = ${userId}
      ORDER BY rc.effective_month ASC, rc.created_at ASC
    `,
  ]);

  const paymentsByDebt = principalPayments.reduce((map, payment) => {
    if (!map[payment.debt_id]) map[payment.debt_id] = [];
    map[payment.debt_id].push(payment);
    return map;
  }, {});
  const rateChangesByDebt = rateChanges.reduce((map, change) => {
    if (!map[change.debt_id]) map[change.debt_id] = [];
    map[change.debt_id].push(change);
    return map;
  }, {});

  return debts
    .map((debt) => ({
      ...debt,
      ...calculateDebtInterestSummary({
        debt,
        payments: paymentsByDebt[debt.id] || [],
        rateChanges: rateChangesByDebt[debt.id] || [],
      }),
    }))
    .map((debt) => enrichDebtWithDashboardMetrics(debt))
    .map(sanitizeDebt)
    .sort(sortDebtsForList);
}

export async function loadViewDebts(userId) {
  await prepareDebtTables();
  const [ownerRows, debts] = await Promise.all([
    sql`SELECT name FROM users WHERE id = ${userId} LIMIT 1`,
    loadEnrichedDebts(userId),
  ]);

  return plain({
    ownerName: ownerRows[0]?.name || 'Debts',
    debts,
    categories: listDebtCategories(debts),
    instrumentTags: listDebtInstrumentTags(debts),
    priorities: Array.from(new Set(debts.map((debt) => debt.priority).filter((value) => value != null))).sort((a, b) => a - b),
  });
}

export async function loadViewDebt(userId, debtId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(debtId || ''))) return null;
  await prepareDebtTables();

  const rows = await sql`
    SELECT
      d.*,
      COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'interest'), 0) AS total_interest_paid,
      COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'principal'), 0) AS total_principal_paid,
      COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'clearance'), 0) AS total_clearance_paid,
      COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'topup'), 0) AS total_topup_amount,
      COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type IN ('interest', 'principal', 'clearance')), 0) AS total_paid
    FROM debts d
    LEFT JOIN debt_payments p ON p.debt_id = d.id
    WHERE d.id = ${debtId} AND d.user_id = ${userId}
    GROUP BY d.id
    LIMIT 1
  `;
  if (!rows[0]) return null;

  const [payments, rateChanges] = await Promise.all([
    sql`
      SELECT p.id, p.debt_id, p.payment_date, p.payment_type, p.amount, p.notes, p.created_at
      FROM debt_payments p
      INNER JOIN debts d ON d.id = p.debt_id
      WHERE p.debt_id = ${debtId} AND d.user_id = ${userId}
      ORDER BY p.payment_date DESC, p.created_at DESC
    `,
    sql`
      SELECT rc.effective_month, rc.interest_rate, rc.created_at
      FROM debt_rate_changes rc
      INNER JOIN debts d ON d.id = rc.debt_id
      WHERE rc.debt_id = ${debtId} AND d.user_id = ${userId}
      ORDER BY rc.effective_month ASC, rc.created_at ASC
    `,
  ]);

  const debt = enrichDebtWithDashboardMetrics({
    ...rows[0],
    ...calculateDebtInterestSummary({
      debt: rows[0],
      payments,
      rateChanges,
    }),
    rate_changes: rateChanges,
  });

  return plain({
    debt: sanitizeDebt(debt),
    payments,
  });
}
