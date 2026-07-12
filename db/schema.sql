-- =====================================================================
-- My Debt Tracker · Postgres schema for Neon
-- Run this once in your Neon SQL editor (https://console.neon.tech).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- Users ----------
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  recovery_key_hash TEXT,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_secret TEXT,
  mfa_pending_secret TEXT,
  mfa_skip_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_mobile ON users(mobile);

-- ---------- Sessions ----------
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ---------- Login challenges (MFA step) ----------
CREATE TABLE IF NOT EXISTS login_challenges (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_challenges_user ON login_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_login_challenges_expires ON login_challenges(expires_at);

-- ---------- Security events ----------
CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  meta JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);

-- ---------- Backup recovery codes ----------
CREATE TABLE IF NOT EXISTS backup_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_backup_codes_user ON backup_recovery_codes(user_id);

-- ---------- Debts ----------
-- Tracks each debt: from whom borrowed, how much, at what monthly interest rate.
CREATE TABLE IF NOT EXISTS debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lender_name TEXT NOT NULL,
  principal NUMERIC(14,2) NOT NULL,          -- original borrowed amount
  current_principal NUMERIC(14,2) NOT NULL,  -- reduces as principal is repaid
  interest_rate NUMERIC(6,3) NOT NULL,       -- monthly interest rate in %
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT,                             -- optional category label (bank/family/etc.)
  instrument_tag TEXT,                       -- optional tag (temp | short_term | long_term)
  priority INTEGER,                          -- optional payoff priority (1 = highest)
  target_date DATE,                          -- optional target clearance date
  status TEXT NOT NULL DEFAULT 'active',     -- active | cleared
  emi_amount NUMERIC(14,2),                  -- optional fixed monthly EMI (loan instalment)
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debts_user ON debts(user_id);

-- ---------- Debt Payments ----------
-- Every debt transaction (interest payment, principal repayment, full clearance, or extra borrowing) is logged here.
CREATE TABLE IF NOT EXISTS debt_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL,
  payment_type TEXT NOT NULL,   -- 'interest' | 'principal' | 'clearance' | 'topup'
  amount NUMERIC(14,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_debt ON debt_payments(debt_id);

-- ---------- Debt Rate Changes ----------
-- Preserves historical interest rate changes month by month.
CREATE TABLE IF NOT EXISTS debt_rate_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  effective_month DATE NOT NULL,
  interest_rate NUMERIC(6,3) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debt_rate_changes_debt
  ON debt_rate_changes(debt_id, effective_month);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_debt_rate_changes_month
  ON debt_rate_changes(debt_id, effective_month);
