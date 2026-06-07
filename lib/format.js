const inrFmt = new Intl.NumberFormat('en-IN');

export const inr = (n) => '₹' + inrFmt.format(Math.round(Number(n) || 0));

/** Same as inr() but without the ₹ symbol — for use in placeholder text */
export const inrRaw = (n) => inrFmt.format(Math.round(Number(n) || 0));

export const inrShort = (n) => {
  n = Math.round(Number(n) || 0);
  if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2) + ' Cr';
  if (n >= 100000) return '₹' + (n / 100000).toFixed(2) + ' L';
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'K';
  return '₹' + n;
};

export const fmtDate = (d) => {
  if (!d) return '—';
  let dt;
  if (typeof d === 'string') {
    const trimmed = d.trim();
    const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (ymd) {
      dt = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    }
  }
  if (!dt) dt = new Date(d);
  if (isNaN(dt)) return '—';
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return dt.getDate() + ' ' + mo[dt.getMonth()] + ' ' + dt.getFullYear();
};

/** Format a date as "Jan 2024" (month + year only) */
export const fmtMonthYear = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return mo[dt.getMonth()] + ' ' + dt.getFullYear();
};

export const fmtDateInput = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  return dt.toISOString().slice(0, 10);
};

/** Monthly interest amount on current principal */
export const monthlyInterest = (principal, rateMonthly) =>
  Number(principal) * (Number(rateMonthly) / 100);

/** Accumulated interest for N months (simple monthly, no compounding) */
export const accumulatedInterest = (principal, rateMonthly, months) =>
  Number(principal) * (Number(rateMonthly) / 100) * months;

/** Months elapsed from startDate to today */
export const monthsElapsed = (startDate) => {
  const start = new Date(startDate);
  if (isNaN(start.getTime())) return 0;
  const now = new Date();
  const firstInterestMonth = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  const lastCompletedMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  lastCompletedMonth.setMonth(lastCompletedMonth.getMonth() - 1);
  const totalMonths =
    (lastCompletedMonth.getFullYear() - firstInterestMonth.getFullYear()) * 12 +
    (lastCompletedMonth.getMonth() - firstInterestMonth.getMonth()) +
    1;
  return Math.max(0, totalMonths);
};

/** Status label */
export const statusLabel = (status) =>
  status === 'cleared' ? 'Cleared' : 'Active';

export const statusColor = (status) =>
  status === 'cleared' ? 'text-mint-600 bg-mint-50' : 'text-honey-600 bg-honey-50';
