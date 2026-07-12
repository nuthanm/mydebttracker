import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
  hashPin,
  hashRecoveryKey,
  createSession,
  normalizeMobile,
  validatePin,
  validateRecoveryKey,
} from '@/lib/auth';
import { generateBackupCodes, saveBackupCodes, logSecurityEvent } from '@/lib/security';

export async function POST(req) {
  try {
    const { name, mobile, pin, recoveryKey } = await req.json();
    if (!name || !mobile || !pin) {
      return NextResponse.json({ error: 'Name, mobile and PIN are required.' }, { status: 400 });
    }
    if (!validatePin(pin)) {
      return NextResponse.json({ error: 'PIN must be exactly 6 digits.' }, { status: 400 });
    }
    if (!validateRecoveryKey(recoveryKey)) {
      return NextResponse.json({ error: 'Recovery key must be at least 8 characters.' }, { status: 400 });
    }

    const normalized = normalizeMobile(mobile);
    const existing = await sql`SELECT id FROM users WHERE mobile = ${normalized} LIMIT 1`;
    if (existing.length > 0) {
      return NextResponse.json({ error: 'An account with this mobile already exists.' }, { status: 409 });
    }

    const pinHash = await hashPin(pin);
    const recoveryHash = await hashRecoveryKey(recoveryKey.trim());
    const rows = await sql`
      INSERT INTO users (mobile, name, pin_hash, recovery_key_hash)
      VALUES (${normalized}, ${name.trim()}, ${pinHash}, ${recoveryHash})
      RETURNING id, mobile, name
    `;
    const user = rows[0];
    const backupCodes = generateBackupCodes(10);
    await saveBackupCodes(user.id, backupCodes);
    await createSession(user.id);
    await logSecurityEvent({ req, userId: user.id, eventType: 'signup', status: 'success' });

    return NextResponse.json({
      user: { id: user.id, mobile: user.mobile, name: user.name },
      backupCodes,
    }, { status: 201 });
  } catch (err) {
    console.error('signup error', err);
    return NextResponse.json({ error: 'Could not create account.' }, { status: 500 });
  }
}
