/* The app's data layer. Same shape as the original server API, so the screens
   did not have to change -- but it runs entirely on the phone. */

import * as store from './store.js';
import { parseSms, splitMessages, containsCredential } from './parser.js';
import { resolveMerchant } from './merchants.js';
import { CATEGORIES, categoryInfo, categorise, isCategory, isGuess, UNCATEGORISED } from './categories.js';
import { formatInr, parsePaise } from './money.js';
import { readSmsBackup } from './smsbackup.js';

/* ----------------------------------------------------------- dates */

const pad = (n) => String(n).padStart(2, '0');
export const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayToDate = (day) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d; };

function weekBounds(today = new Date()) {
  const offset = (today.getDay() + 6) % 7;   // Monday = 0
  const start = addDays(today, -offset);
  return [isoDay(start), isoDay(addDays(start, 6))];
}

function monthBounds(today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return [isoDay(start), isoDay(end)];
}

function rangeFor(period) {
  const today = new Date();
  switch (period) {
    case 'today': return [isoDay(today), isoDay(today)];
    case 'yesterday': { const y = addDays(today, -1); return [isoDay(y), isoDay(y)]; }
    case 'week': return weekBounds(today);
    case 'all': return ['2000-01-01', isoDay(today)];
    default: return monthBounds(today);
  }
}

/* ---------------------------------------------------- fingerprints */

/** cyrb53: a fast 53-bit string hash (public domain, by bryc).
    Used instead of crypto.subtle because that only exists on https pages, and
    the app should still work when opened from a laptop over plain Wi-Fi. */
function cyrb53(text, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** The same SMS always yields the same fingerprint, however it was pasted.
    Every ICICI alert carries its own UPI reference number, so two genuinely
    separate payments of the same amount never collide. */
const fingerprintOf = (body) => 'sms:' + cyrb53(body.toLowerCase().replace(/\s+/g, ' ').trim());

/* ------------------------------------------------ building a record */

//: Older than this and a date read from an SMS is more likely a misread.
const MAX_AGE_DAYS = 400;

function resolveDay(parsedDay) {
  const today = new Date();
  if (!parsedDay) return { day: isoDay(today), hasTime: true };
  const date = dayToDate(parsedDay);
  const age = (today - date) / 86400000;
  if (age < -1 || age > MAX_AGE_DAYS) return { day: isoDay(today), hasTime: true };
  return { day: parsedDay, hasTime: parsedDay === isoDay(today) };
}

/** `receivedAt` is when the phone received the SMS, known exactly for
    messages read from a backup file. When present it is the best date there
    is, and it also gives the time of day, which a pasted SMS lacks. */
function buildRecord(parsed, source = 'sms', receivedAt = null) {
  let merchant = resolveMerchant(parsed.counterparty);
  if (parsed.instrument === 'atm') merchant = { key: 'atm', name: 'ATM withdrawal', isPerson: false };

  const decision = categorise({
    merchantKey: merchant.key,
    merchantText: merchant.name,
    direction: parsed.direction,
    instrument: parsed.instrument,
    isPerson: merchant.isPerson,
    rules: store.rules(),
  });

  const now = new Date();
  let day;
  let occurredAt;
  let hasTime;
  if (receivedAt instanceof Date && !Number.isNaN(receivedAt.getTime())) {
    day = isoDay(receivedAt);
    occurredAt = receivedAt.toISOString();
    hasTime = true;
  } else {
    ({ day, hasTime } = resolveDay(parsed.day));
    occurredAt = hasTime ? now.toISOString() : `${day}T12:00:00`;
  }
  return {
    fingerprint: fingerprintOf(parsed.body),
    day,
    occurred_at: occurredAt,
    has_time: hasTime,
    amount_paise: parsed.amountPaise,
    direction: parsed.direction,
    account_tail: parsed.accountTail,
    instrument: parsed.instrument,
    bank: parsed.bank,
    counterparty_raw: parsed.counterparty,
    merchant_key: merchant.key,
    merchant_name: merchant.name,
    is_person: merchant.isPerson,
    category: decision.category,
    category_source: decision.source,
    reference: parsed.reference,
    refund: Boolean(parsed.refund),
    note: null,
    excluded: false,
    source,
    raw_body: parsed.body,
    created_at: now.toISOString(),
  };
}

/** Shape a stored row for the screens. */
function present(t) {
  const info = categoryInfo(t.category);
  return {
    ...t,
    amount_display: formatInr(t.amount_paise),
    category_label: info.label,
    category_emoji: info.emoji,
    is_guess: isGuess(t.category_source),
  };
}

const isSpend = (t) => t.direction === 'debit' && !t.excluded;
const inRange = (t, start, end) => t.day >= start && t.day <= end;
const newestFirst = (a, b) => (a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : b.id - a.id);

/* ------------------------------------------------------------ reads */

function totalSpent(start, end) {
  return store.allTransactions().filter((t) => isSpend(t) && inRange(t, start, end))
    .reduce((sum, t) => sum + t.amount_paise, 0);
}

function byCategory(start, end) {
  const totals = new Map();
  store.allTransactions().filter((t) => isSpend(t) && inRange(t, start, end)).forEach((t) => {
    const entry = totals.get(t.category) || { total: 0, count: 0 };
    entry.total += t.amount_paise;
    entry.count += 1;
    totals.set(t.category, entry);
  });
  const grand = [...totals.values()].reduce((s, e) => s + e.total, 0) || 1;
  return [...totals.entries()]
    .map(([category, e]) => ({
      category,
      label: categoryInfo(category).label,
      emoji: categoryInfo(category).emoji,
      total_paise: e.total,
      total_display: formatInr(e.total),
      count: e.count,
      share_pct: Math.round((e.total / grand) * 1000) / 10,
    }))
    .sort((a, b) => b.total_paise - a.total_paise);
}

function byMerchant(start, end, limit = 12) {
  const totals = new Map();
  store.allTransactions().filter((t) => isSpend(t) && inRange(t, start, end)).forEach((t) => {
    const key = t.merchant_key || `?${t.merchant_name}`;
    const entry = totals.get(key) || { name: t.merchant_name, category: t.category, total: 0, count: 0 };
    entry.total += t.amount_paise;
    entry.count += 1;
    totals.set(key, entry);
  });
  return [...totals.entries()]
    .map(([key, e]) => ({
      merchant_key: key, name: e.name, category: e.category, emoji: categoryInfo(e.category).emoji,
      total_paise: e.total, total_display: formatInr(e.total), count: e.count,
    }))
    .sort((a, b) => b.total_paise - a.total_paise)
    .slice(0, limit);
}

/** Every day in the range, including empty ones -- a chart that skips quiet
    days makes a calm week look busy. */
function dailySeries(start, end) {
  const totals = new Map();
  store.allTransactions().filter((t) => isSpend(t) && inRange(t, start, end))
    .forEach((t) => totals.set(t.day, (totals.get(t.day) || 0) + t.amount_paise));

  // "All time" starts at the first payment, not in the year 2000.
  let first = start;
  if (start === '2000-01-01') {
    const days = store.allTransactions().map((t) => t.day).sort();
    first = days[0] || end;
  }
  const series = [];
  for (let d = dayToDate(first); isoDay(d) <= end; d = addDays(d, 1)) {
    const key = isoDay(d);
    const total = totals.get(key) || 0;
    series.push({ date: key, total_paise: total, total_display: formatInr(total) });
    if (series.length > 800) break;
  }
  return series;
}

function summaryData() {
  const today = new Date();
  const todayKey = isoDay(today);
  const yesterdayKey = isoDay(addDays(today, -1));
  const [weekStart, weekEnd] = weekBounds(today);
  const [monthStart, monthEnd] = monthBounds(today);

  const spentToday = totalSpent(todayKey, todayKey);
  const spentYesterday = totalSpent(yesterdayKey, yesterdayKey);
  const spentWeek = totalSpent(weekStart, weekEnd);
  const spentMonth = totalSpent(monthStart, monthEnd);

  const daysElapsed = today.getDate();
  const daysInMonth = dayToDate(monthEnd).getDate();
  const dailyAverage = Math.floor(spentMonth / Math.max(daysElapsed, 1));
  const projected = dailyAverage * daysInMonth;

  const guesses = store.allTransactions().filter(
    (t) => isSpend(t) && inRange(t, monthStart, monthEnd) && isGuess(t.category_source),
  ).length;

  return {
    today: {
      date: todayKey,
      total_paise: spentToday,
      total_display: formatInr(spentToday),
      vs_yesterday_paise: spentToday - spentYesterday,
      yesterday_display: formatInr(spentYesterday),
    },
    week: { start: weekStart, end: weekEnd, total_paise: spentWeek, total_display: formatInr(spentWeek) },
    month: {
      start: monthStart, end: monthEnd,
      total_paise: spentMonth, total_display: formatInr(spentMonth),
      daily_average_paise: dailyAverage, daily_average_display: formatInr(dailyAverage),
      projected_paise: projected, projected_display: formatInr(projected),
      days_elapsed: daysElapsed, days_in_month: daysInMonth,
    },
    uncategorised_count: guesses,
  };
}

/** Merchants that charge on a steady rhythm: same place, similar amount,
    regular gap. Detected from spacing, never assumed from a category. */
function recurringData(minOccurrences = 3, lookbackDays = 150) {
  const since = isoDay(addDays(new Date(), -lookbackDays));
  const groups = new Map();
  store.allTransactions()
    .filter((t) => isSpend(t) && t.day >= since && t.merchant_key && !t.is_person && t.merchant_key !== 'atm')
    .forEach((t) => {
      if (!groups.has(t.merchant_key)) groups.set(t.merchant_key, []);
      groups.get(t.merchant_key).push(t);
    });

  const found = [];
  for (const [key, items] of groups) {
    if (items.length < minOccurrences) continue;
    items.sort((a, b) => (a.day < b.day ? -1 : 1));
    const days = [...new Set(items.map((t) => t.day))].map(dayToDate);
    if (days.length < minOccurrences) continue;

    const gaps = days.slice(1).map((d, i) => Math.round((d - days[i]) / 86400000)).filter((g) => g > 0);
    if (gaps.length < minOccurrences - 1) continue;
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    if (avg < 5 || avg > 45) continue;
    if (Math.max(...gaps.map((g) => Math.abs(g - avg))) > Math.max(avg * 0.5, 5)) continue;

    const amounts = items.map((t) => t.amount_paise).sort((a, b) => a - b);
    const typical = amounts[Math.floor(amounts.length / 2)];
    if (typical && Math.max(...amounts.map((a) => Math.abs(a - typical))) > typical * 0.25) continue;

    const last = days[days.length - 1];
    found.push({
      merchant_key: key,
      name: items[items.length - 1].merchant_name,
      category: items[items.length - 1].category,
      emoji: categoryInfo(items[items.length - 1].category).emoji,
      typical_paise: typical,
      typical_display: formatInr(typical),
      count: days.length,
      cadence: avg < 12 ? 'weekly' : avg < 40 ? 'monthly' : 'periodic',
      average_gap_days: Math.round(avg),
      last_charged: isoDay(last),
      next_expected: isoDay(addDays(last, Math.round(avg))),
    });
  }
  return found.sort((a, b) => b.typical_paise - a.typical_paise);
}

/* ----------------------------------------------- adding from SMS */

function explainRejection(reason) {
  return {
    credential: "This is an OTP or password message. Kharcha never stores those.",
    not_a_transaction: "This doesn't look like a completed payment — it may be a reminder, offer, request, or a failed payment.",
    no_amount: "Couldn't find an amount in this message.",
    empty: 'Nothing to read.',
  }[reason] || "Couldn't read this message.";
}

/** Parse pasted text without saving anything, for the preview. */
function preview(text) {
  const knownFingerprints = new Set(store.allTransactions().map((t) => t.fingerprint));
  return splitMessages(text).map((body) => {
    const parsed = parseSms(body);
    if (!parsed.ok) {
      return { ok: false, body, reason: parsed.reason, message: explainRejection(parsed.reason) };
    }
    const record = buildRecord(parsed);
    return { ok: true, body, duplicate: knownFingerprints.has(record.fingerprint), record: present(record) };
  });
}

/** When a refund or reversal arrives, cancel out the payment it reverses.

    A failed UPI payment often produces a debit SMS and, days later, a
    reversal credit. Counting the debit as spending would overstate what you
    actually spent, so the matching debit is left out of totals and both rows
    are annotated. Nothing is deleted. */
async function linkRefund(refund) {
  const refundDay = dayToDate(refund.day);
  const candidates = store.allTransactions()
    .filter((t) => t.direction === 'debit' && !t.excluded && t.amount_paise === refund.amount_paise)
    .filter((t) => {
      const age = (refundDay - dayToDate(t.day)) / 86400000;
      return age >= 0 && age <= 10;
    })
    .sort(newestFirst);
  const match = candidates.find((t) => refund.merchant_key && t.merchant_key === refund.merchant_key) || candidates[0];
  if (!match) return false;

  await store.updateTransactions([
    { ...match, excluded: true, note: `Refunded on ${refund.day}` },
    { ...refund, excluded: true, note: `Refund of ${match.merchant_name} payment` },
  ]);
  return true;
}

/** Save every readable payment among `messages` ({ body, receivedAt? }).

    Shared by pasting, sharing and backup import, so all three apply exactly
    the same rules: credentials refused, duplicates skipped, refunds matched. */
async function importMessages(messages, { recordUnreadable = true } = {}) {
  const report = { added: [], duplicates: 0, credentials: 0, unreadable: [], refundsLinked: 0 };
  const known = new Set(store.allTransactions().map((t) => t.fingerprint));
  const records = [];

  for (const { body, receivedAt = null } of messages) {
    // Checked here as well as in the parser: nothing credential-shaped is
    // ever written anywhere, not even to the "couldn't read" list.
    if (containsCredential(body)) { report.credentials += 1; continue; }

    const parsed = parseSms(body);
    if (!parsed.ok) {
      report.unreadable.push({ body, reason: parsed.reason, message: explainRejection(parsed.reason) });
      if (recordUnreadable && parsed.reason === 'no_amount') {
        await store.addUnparsed({ fingerprint: fingerprintOf(body), body, reason: parsed.reason, at: new Date().toISOString() });
      }
      continue;
    }
    const record = buildRecord(parsed, 'sms', receivedAt);
    if (known.has(record.fingerprint)) { report.duplicates += 1; continue; }
    known.add(record.fingerprint);
    records.push(record);
  }

  const saved = await store.addTransactions(records);
  for (const row of saved) {
    if (row.refund && (await linkRefund(row))) report.refundsLinked += 1;
  }
  report.added = saved.map((row) => present(store.getTransaction(row.id) || row));
  if (saved.length) await store.requestPersistence();
  return report;
}

/** Save every readable payment in pasted or shared text. */
const importText = (text) => importMessages(splitMessages(text).map((body) => ({ body })));

/** Import a whole "SMS Backup & Restore" file.

    Only received messages from bank-style sender IDs are considered, so
    personal chats in the backup are never parsed. The file is read here, on
    the phone; nothing in it is sent anywhere, and only payments are kept. */
async function importSmsBackup(xml) {
  const { messages, total, sent, personal } = readSmsBackup(xml);
  if (total === 0) {
    throw new Error("That file doesn't look like an SMS Backup & Restore backup (no messages found).");
  }
  // Oldest first, so a reversal is always processed after the payment it undoes.
  messages.sort((a, b) => a.receivedAt - b.receivedAt);
  const report = await importMessages(messages, { recordUnreadable: false });

  const days = report.added.map((t) => t.day).sort();
  return {
    ...report,
    scanned: total,
    bankMessages: messages.length,
    skippedSent: sent,
    skippedPersonal: personal,
    from: days[0] || null,
    to: days[days.length - 1] || null,
  };
}

/* ------------------------------------------------------------ backup */

function exportData() {
  return JSON.stringify({
    app: 'kharcha',
    version: 1,
    exported_at: new Date().toISOString(),
    transactions: store.allTransactions().filter((t) => t.source !== 'demo'),
    rules: store.rules(),
  }, null, 1);
}

async function importBackup(json) {
  let data;
  try { data = JSON.parse(json); } catch { throw new Error("That file isn't a Kharcha backup."); }
  if (!data || data.app !== 'kharcha' || !Array.isArray(data.transactions)) {
    throw new Error("That file isn't a Kharcha backup.");
  }
  for (const [key, category] of Object.entries(data.rules || {})) {
    if (isCategory(category)) await store.setRule(key, category);
  }
  const rows = data.transactions
    .filter((t) => t && t.fingerprint && Number.isInteger(t.amount_paise) && t.day)
    .map(({ id, ...rest }) => rest);   // fresh ids; fingerprints prevent doubles
  const saved = await store.addTransactions(rows);
  return { restored: saved.length, skipped: rows.length - saved.length };
}

/* --------------------------------------------------------------- api */

export const api = {
  init: () => store.open(),

  async overview(period = 'month') {
    const [start, end] = rangeFor(period);
    const total = totalSpent(start, end);
    return {
      period, start, end,
      summary: summaryData(),
      total_paise: total,
      total_display: formatInr(total),
      categories: byCategory(start, end),
      merchants: byMerchant(start, end),
      series: dailySeries(start, end),
      transactions: store.allTransactions().filter((t) => inRange(t, start, end))
        .sort(newestFirst).slice(0, 300).map(present),
    };
  },

  async summary() { return summaryData(); },

  async transactions({ period = 'all', category, merchant, limit = 500 } = {}) {
    const [start, end] = rangeFor(period);
    return {
      transactions: store.allTransactions()
        .filter((t) => inRange(t, start, end))
        .filter((t) => !category || t.category === category)
        .filter((t) => !merchant || t.merchant_key === merchant)
        .sort(newestFirst).slice(0, Number(limit)).map(present),
    };
  },

  async categories() { return { categories: CATEGORIES }; },
  async recurring() { return { recurring: recurringData() }; },

  async stats() {
    const days = store.allTransactions().map((t) => t.day).sort();
    return {
      transactions: store.allTransactions().length,
      unparsed: store.unparsed().length,
      tracking_since: days[0] || null,
      merchant_rules: Object.keys(store.rules()).length,
      has_demo: store.allTransactions().some((t) => t.source === 'demo'),
      persistent: await store.persistenceStatus(),
      last_backup_import: store.meta('last_backup_import'),
    };
  },

  /** Recategorise, and by default teach the merchant -- which fixes its past
      payments too, not just future ones. */
  async setCategory(id, category, applyToMerchant = true) {
    if (!isCategory(category)) throw new Error('Unknown category.');
    const txn = store.getTransaction(id);
    if (!txn) throw new Error('That payment no longer exists.');

    if (applyToMerchant && txn.merchant_key && txn.merchant_key !== 'person_upi') {
      await store.setRule(txn.merchant_key, category);
      const affected = store.allTransactions()
        .filter((t) => t.merchant_key === txn.merchant_key && t.direction === 'debit')
        .map((t) => ({ ...t, category, category_source: 'user' }));
      await store.updateTransactions(affected);
      return { ok: true, updated: affected.length, category };
    }
    await store.updateTransactions([{ ...txn, category, category_source: 'user' }]);
    return { ok: true, updated: 1, category };
  },

  async setExcluded(id, excluded) {
    const txn = store.getTransaction(id);
    if (!txn) throw new Error('That payment no longer exists.');
    await store.updateTransactions([{ ...txn, excluded: Boolean(excluded) }]);
    return { ok: true, excluded: Boolean(excluded) };
  },

  async deleteTransactions(ids) { await store.deleteTransactions(ids); return { ok: true }; },

  async addManual({ amount, merchant, category }) {
    const paise = parsePaise(amount);
    if (!paise) throw new Error('Enter an amount above zero.');
    const chosen = isCategory(category) ? category : UNCATEGORISED;
    const resolved = resolveMerchant(merchant || 'Cash');
    const now = new Date();
    const [saved] = await store.addTransactions([{
      fingerprint: `manual:${now.getTime()}:${Math.random().toString(36).slice(2)}`,
      day: isoDay(now), occurred_at: now.toISOString(), has_time: true,
      amount_paise: paise, direction: 'debit', account_tail: null, instrument: 'cash',
      bank: null, counterparty_raw: merchant || 'Cash',
      merchant_key: resolved.key, merchant_name: resolved.name, is_person: false,
      category: chosen, category_source: 'user', reference: null, refund: false,
      note: null, excluded: false, source: 'manual', raw_body: null, created_at: now.toISOString(),
    }]);
    await store.requestPersistence();
    return { ok: true, id: saved.id };
  },

  preview: async (text) => preview(text),
  importText,
  importSmsBackup,
  exportData: async () => exportData(),
  importBackup,

  async clearDemo() {
    const ids = store.allTransactions().filter((t) => t.source === 'demo').map((t) => t.id);
    await store.deleteTransactions(ids);
    return { removed: ids.length };
  },
  async clearAll() { await store.clearAll(); return { ok: true }; },
  async markBackupImported() { await store.setMeta('last_backup_import', new Date().toISOString()); },
  async addDemo(rows) { return store.addTransactions(rows); },

  buildDemoRecord(body, source = 'demo') {
    const parsed = parseSms(body);
    return parsed.ok ? { ...buildRecord(parsed, source) } : null;
  },
};
