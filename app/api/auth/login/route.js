import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verifyPin, createSession, normalizeMobile, validatePin } from '@/lib/auth';

export async function POST(req) {
  try {
    const { mobile, pin } = await req.json();
    if (!mobile || !pin) {
      return NextResponse.json({ error: 'Mobile and PIN are required.' }, { status: 400 });
    }
    if (!validatePin(pin)) {
      return NextResponse.json({ error: 'PIN must be exactly 6 digits.' }, { status: 400 });
    }
    const normalized = normalizeMobile(mobile);
    const rows = await sql`SELECT id, mobile, name, pin_hash FROM users WHERE mobile = ${normalized} LIMIT 1`;
    if (rows.length === 0) {
      return NextResponse.json({ error: 'No account found for this mobile. Please sign up first.' }, { status: 404 });
    }
    const user = rows[0];
    const ok = await verifyPin(pin, user.pin_hash);
    if (!ok) {
      return NextResponse.json({ error: 'Wrong PIN. Try again.' }, { status: 401 });
    }
    await createSession(user.id);
    return NextResponse.json({ user: { id: user.id, mobile: user.mobile, name: user.name } });
  } catch (err) {
    console.error('login error', err);
    return NextResponse.json({ error: 'Could not log in.' }, { status: 500 });
  }
}
