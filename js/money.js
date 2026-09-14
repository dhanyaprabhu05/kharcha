/* Money is stored as integer PAISE, never as floating-point rupees.
   0.1 + 0.2 !== 0.3 in binary floating point, and a tracker that quietly loses
   a rupee every few hundred payments is worse than no tracker. Rupees exist
   only at the edges: parsed in, formatted out. */

/** Parse "1,234.50", "Rs.240", "INR 1,29,999" into paise. null if unusable. */
export function parsePaise(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return Math.round(raw * 100);
  }
  const text = String(raw).trim().replace(/,/g, '');
  // The cleaner below strips every non-digit, minus sign included, so "-5"
  // would otherwise come back as a positive ₹5. Catch the sign first.
  if (text.startsWith('-')) return null;

  const match = text.match(/\d+(?:\.\d{1,2})?/);
  if (!match) return null;
  const [whole, fraction = ''] = match[0].split('.');
  const paise = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  return paise > 0 ? paise : null;
}

/** 12345600 -> "₹1,23,456" (Indian digit grouping).
    decimals: 'auto' (default) shows paise only when there are some, so
    ₹264.88 is never displayed as ₹264. true/false force it on or off. */
export function formatInr(paise, { decimals = 'auto' } = {}) {
  if (paise === null || paise === undefined) return '—';
  const negative = paise < 0;
  const value = Math.abs(Math.round(paise));
  const rupees = Math.floor(value / 100);
  const rest = value % 100;

  let text = String(rupees);
  if (text.length > 3) {
    const tail = text.slice(-3);
    let head = text.slice(0, -3);
    const groups = [];
    while (head.length > 2) {
      groups.unshift(head.slice(-2));
      head = head.slice(0, -2);
    }
    if (head) groups.unshift(head);
    text = groups.concat(tail).join(',');
  }
  if (decimals === true || (decimals === 'auto' && rest !== 0)) text += '.' + String(rest).padStart(2, '0');
  return (negative ? '-' : '') + '₹' + text;
}
