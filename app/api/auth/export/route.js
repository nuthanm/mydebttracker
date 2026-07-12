import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { logSecurityEvent } from '@/lib/security';

function sheetFromRows(rows, emptyLabel) {
  if (!rows.length) return XLSX.utils.json_to_sheet([{ info: emptyLabel }]);
  return XLSX.utils.json_to_sheet(rows);
}

export async function GET(req) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  try {
    const [profile, debts, payments, rateChanges] = await Promise.all([
      sql`SELECT id, mobile, name, created_at, mfa_enabled, last_login_at FROM users WHERE id = ${me.id} LIMIT 1`,
      sql`SELECT * FROM debts WHERE user_id = ${me.id} ORDER BY created_at`,
      sql`
        SELECT dp.*
        FROM debt_payments dp
        JOIN debts d ON d.id = dp.debt_id
        WHERE d.user_id = ${me.id}
        ORDER BY dp.payment_date, dp.created_at
      `,
      sql`
        SELECT rc.*
        FROM debt_rate_changes rc
        JOIN debts d ON d.id = rc.debt_id
        WHERE d.user_id = ${me.id}
        ORDER BY rc.effective_month, rc.created_at
      `,
    ]);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheetFromRows(profile, 'No profile'), 'Profile');
    XLSX.utils.book_append_sheet(workbook, sheetFromRows(debts, 'No debts'), 'Debts');
    XLSX.utils.book_append_sheet(workbook, sheetFromRows(payments, 'No payments'), 'Payments');
    XLSX.utils.book_append_sheet(workbook, sheetFromRows(rateChanges, 'No rate changes'), 'Rate Changes');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    await logSecurityEvent({ req, userId: me.id, eventType: 'data_export', status: 'success' });

    const filename = `mydebttracker-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('data export error', err);
    return NextResponse.json({ error: 'Could not export data.' }, { status: 500 });
  }
}
