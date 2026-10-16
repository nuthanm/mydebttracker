import { NextResponse } from 'next/server';
import { destroyViewSession } from '@/lib/view-access';

export const dynamic = 'force-dynamic';

export async function DELETE() {
  await destroyViewSession();
  const response = NextResponse.json({ ok: true });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
