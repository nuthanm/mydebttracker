import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { logSecurityEvent } from '@/lib/security';

export async function POST(req) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const parsedDays = Number(body?.days || 7);
    const clampedDays = Number.isFinite(parsedDays) ? Math.min(Math.max(parsedDays, 1), 30) : 7;

    await sql`
      UPDATE users
      SET mfa_skip_until = now() + (${clampedDays} * interval '1 day')
      WHERE id = ${me.id}
    `;

    await logSecurityEvent({ req, userId: me.id, eventType: 'mfa_skip', status: 'success', meta: { days: clampedDays } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('mfa skip error', err);
    return NextResponse.json({ error: 'Could not skip MFA for now.' }, { status: 500 });
  }
}
