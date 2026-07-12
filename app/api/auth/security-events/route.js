import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  try {
    const params = new URL(req.url).searchParams;
    const page = Math.max(1, Number(params.get('page') || 1));
    const pageSize = Math.min(50, Math.max(5, Number(params.get('pageSize') || 10)));
    const offset = (page - 1) * pageSize;
    const q = String(params.get('q') || '').trim();
    const statusRaw = String(params.get('status') || '').trim().toLowerCase();
    const status = statusRaw === 'success' || statusRaw === 'failed' ? statusRaw : '';
    const like = `%${q}%`;

    let rows = [];
    let totalRows = [];

    if (q && status) {
      rows = await sql`
        SELECT event_type, status, meta, ip_address, user_agent, created_at
        FROM security_events
        WHERE user_id = ${me.id}
          AND status = ${status}
          AND (
            event_type ILIKE ${like}
            OR COALESCE(meta::text, '') ILIKE ${like}
            OR COALESCE(ip_address, '') ILIKE ${like}
            OR COALESCE(user_agent, '') ILIKE ${like}
          )
        ORDER BY created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `;
      totalRows = await sql`
        SELECT COUNT(*)::int AS total
        FROM security_events
        WHERE user_id = ${me.id}
          AND status = ${status}
          AND (
            event_type ILIKE ${like}
            OR COALESCE(meta::text, '') ILIKE ${like}
            OR COALESCE(ip_address, '') ILIKE ${like}
            OR COALESCE(user_agent, '') ILIKE ${like}
          )
      `;
    } else if (q) {
      rows = await sql`
        SELECT event_type, status, meta, ip_address, user_agent, created_at
        FROM security_events
        WHERE user_id = ${me.id}
          AND (
            event_type ILIKE ${like}
            OR COALESCE(meta::text, '') ILIKE ${like}
            OR COALESCE(ip_address, '') ILIKE ${like}
            OR COALESCE(user_agent, '') ILIKE ${like}
          )
        ORDER BY created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `;
      totalRows = await sql`
        SELECT COUNT(*)::int AS total
        FROM security_events
        WHERE user_id = ${me.id}
          AND (
            event_type ILIKE ${like}
            OR COALESCE(meta::text, '') ILIKE ${like}
            OR COALESCE(ip_address, '') ILIKE ${like}
            OR COALESCE(user_agent, '') ILIKE ${like}
          )
      `;
    } else if (status) {
      rows = await sql`
        SELECT event_type, status, meta, ip_address, user_agent, created_at
        FROM security_events
        WHERE user_id = ${me.id} AND status = ${status}
        ORDER BY created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `;
      totalRows = await sql`
        SELECT COUNT(*)::int AS total
        FROM security_events
        WHERE user_id = ${me.id} AND status = ${status}
      `;
    } else {
      rows = await sql`
        SELECT event_type, status, meta, ip_address, user_agent, created_at
        FROM security_events
        WHERE user_id = ${me.id}
        ORDER BY created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `;
      totalRows = await sql`
        SELECT COUNT(*)::int AS total
        FROM security_events
        WHERE user_id = ${me.id}
      `;
    }

    return NextResponse.json({ events: rows, total: totalRows[0]?.total || 0, page, pageSize });
  } catch (err) {
    console.error('security events error', err);
    return NextResponse.json({ error: 'Could not load security events.' }, { status: 500 });
  }
}
