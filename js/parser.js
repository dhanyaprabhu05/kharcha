/* Turning a bank SMS into a transaction.

   Not one exact regex per bank: banks change templates without notice and run
   several formats at once. Each field is extracted independently by the
   strongest available signal, so a message where the amount parses but the
   merchant does not still becomes a usable transaction. */

import { parsePaise } from './money.js';

export const DEBIT = 'debit';
export const CREDIT = 'credit';

/* ------------------------------------------------------------------ gates */

//: Credential words. A message that still contains one AFTER safety footers
//: are removed is rejected before parsing, so an OTP can never reach storage.
const OTP_PATTERNS = [
  /\botp\b/i, /one[\s-]?time\s+password/i, /\bverification\s+code\b/i,
  /\bsecurity\s+code\b/i, /\blogin\s+code\b/i, /\bpassword\s+is\b/i,
  /\bpin\s+is\b/i, /\bmpin\b/i, /\bcvv\b/i,
];

//: A code sitting right next to a credential word: "483920 is your OTP",
//: "code: 9921", "MPIN 4321". Checked on the full, unstripped text as a
//: second net, so an OTP message can't hide behind a footer.
const CODE_PATTERNS = [
  /\b\d{4,8}\s+is\s+(?:your|the)\b/i,
  /\b(?:otp|code|pin|mpin|password)\b\s*(?:is|:|-|=)?\s*\d{4,8}\b/i,
];

//: Safety footers that banks append to ordinary payment alerts:
//:   Union Bank: "Never Share OTP/PIN/CVV-Union Bank of India"
//:   others:     "Do not share your OTP with anyone", "Bank never asks for PIN"
//: They name credentials without containing one. Rejecting on them would throw
//: away every payment from those banks, which the first version of this app did.
const CREDENTIAL_WORD = String.raw`(?:otp|pin|mpin|cvv|password|card\s+details|credentials)`;
const CREDENTIAL_LIST = String.raw`(?:(?:your|the|this|any)\s+)?${CREDENTIAL_WORD}(?:\s*[\/,&]\s*(?:or\s+)?${CREDENTIAL_WORD}|\s+(?:or|and)\s+${CREDENTIAL_WORD})*`;
const DISCLAIMER_PATTERNS = [
  new RegExp(String.raw`\b(?:never|do\s*not|don'?t|pls\s+do\s+not|please\s+do\s+not|not\s+to)\s+(?:share|disclose|reveal|tell)\s+${CREDENTIAL_LIST}(?:\s+with\s+(?:anyone|anybody|any\s*one))?`, 'gi'),
  new RegExp(String.raw`\b(?:bank\s+)?(?:will\s+never|never|does\s+not|doesn'?t|won'?t)\s+(?:ask|asks|call|calls|request|requests)\s+(?:you\s+)?(?:for\s+)?${CREDENTIAL_LIST}`, 'gi'),
];

function withoutDisclaimers(text) {
  return DISCLAIMER_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, ' '), text);
}

const TRANSACTION_MARKERS = /\b(debited|credited|spent|sent|paid|received|withdrawn|purchase|transferred|trf|deducted|debit|credit|thank you for using)\b/i;

//: Mentions money but moves none.
const NOISE_MARKERS = [
  'will be debited', 'will be credited', 'will be reversed', 'will be refunded',
  'is due', 'due on', 'due date', 'amount due', 'minimum due',
  'reminder', 'offer', 'apply now', 'pre-approved', 'preapproved',
  'eligible for', 'click here', 'unsubscribe',
  'e-statement', 'statement is ready', 'statement is generated',
  'failed', 'declined', 'unsuccessful',
  'payment request', 'request of', 'requested money', 'collect request',
  'has requested', 'requesting', 'approve in your', 'will expire',
  'successfully created', 'mandate created', 'has been created',
];

export function containsCredential(body) {
  const text = body || '';
  if (CODE_PATTERNS.some((pattern) => pattern.test(text))) return true;
  const stripped = withoutDisclaimers(text);
  return OTP_PATTERNS.some((pattern) => pattern.test(stripped));
}

export function looksLikeTransaction(body) {
  const lowered = (body || '').toLowerCase();
  if (!TRANSACTION_MARKERS.test(lowered)) return false;
  return !NOISE_MARKERS.some((marker) => lowered.includes(marker));
}

/* ------------------------------------------------------------------- bank */

const BANKS = [
  ['icici', 'ICICI Bank'], ['hdfc', 'HDFC Bank'], ['sbi', 'State Bank of India'],
  ['state bank', 'State Bank of India'], ['axis', 'Axis Bank'],
  ['kotak', 'Kotak Mahindra Bank'], ['federal', 'Federal Bank'],
  ['canara', 'Canara Bank'], ['pnb', 'Punjab National Bank'],
  ['bank of baroda', 'Bank of Baroda'], ['idfc', 'IDFC First Bank'],
  ['indusind', 'IndusInd Bank'], ['yes bank', 'Yes Bank'],
  ['south indian bank', 'South Indian Bank'], ['union bank', 'Union Bank of India'],
  ['paytm', 'Paytm Payments Bank'], ['au bank', 'AU Small Finance Bank'],
];

export function identifyBank(body, sender = '') {
  const haystack = `${sender || ''} ${body || ''}`.toLowerCase();
  for (const [needle, name] of BANKS) {
    if (new RegExp(`\\b${needle}\\b`).test(haystack)) return name;
  }
  return null;
}

/* ----------------------------------------------------------------- amount */

//: "Rs.240", "Rs 240", "Rs:30.00" (Union Bank), "INR 1,234", "₹240".
//: The trailing-currency form must not fire on a masked card number: in
//: "Card no. XX2211 INR 3200", "2211 INR" is the card, not the amount.
const AMOUNT_RE = /(?:(?:rs|inr)\s*[.:]?\s*|₹\s*)([\d,]+(?:\.\d{1,2})?)|(?<![xX*\d])([\d,]+(?:\.\d{1,2})?)\s*(?:rs\b|inr\b|₹)/gi;

//: Some banks omit the currency: "debited by 150.0".
const BARE_AMOUNT_RE = /\b(?:debited|credited|spent|sent|paid|withdrawn|deducted)\s+(?:by|for|with|of)?\s*([\d,]+(?:\.\d{1,2})?)\b/i;

//: Balances and limits come after the real amount and must not be read as it.
const BALANCE_RE = /\b(?:avl|available|avbl|clear|closing)?\s*(?:bal|balance|limit|lmt)\b/i;

function stripBalanceClause(body) {
  const match = body.match(BALANCE_RE);
  return match && match.index > 20 ? body.slice(0, match.index) : body;
}

export function extractAmount(body) {
  const trimmed = stripBalanceClause(body);
  for (const source of [trimmed, body]) {
    for (const match of source.matchAll(AMOUNT_RE)) {
      const paise = parsePaise(match[1] || match[2]);
      if (paise) return paise;
    }
  }
  const bare = trimmed.match(BARE_AMOUNT_RE) || body.match(BARE_AMOUNT_RE);
  return bare ? parsePaise(bare[1]) : null;
}

/* -------------------------------------------------------------- direction */

const DEBIT_WORDS = ['debited', 'debit', 'spent', 'sent', 'paid', 'withdrawn',
  'withdrawal', 'purchase', 'deducted', 'trf to', 'transferred to', 'payment of',
  'thank you for using'];
const CREDIT_WORDS = ['credited', 'credit', 'received', 'refund', 'reversal',
  'deposited', 'trf from', 'transferred from'];

function firstIndex(text, words) {
  let best = -1;
  for (const word of words) {
    const at = text.indexOf(word);
    if (at >= 0 && (best < 0 || at < best)) best = at;
  }
  return best;
}

export function extractDirection(body) {
  // "Credit Card" and "credit limit" are not credits. Without this every card
  // purchase is filed as income and your spending disappears.
  const lowered = body.toLowerCase().replace(/\bcredit\s*(card|limit|lmt)\b/g, '$1');
  const debitAt = firstIndex(lowered, DEBIT_WORDS);
  const creditAt = firstIndex(lowered, CREDIT_WORDS);
  if (creditAt < 0) return DEBIT;
  if (debitAt < 0) return CREDIT;
  // Whichever verb the bank used first describes this message.
  return debitAt <= creditAt ? DEBIT : CREDIT;
}

export function isRefund(body) {
  return /\b(refund|refunded|reversal|reversed)\b/i.test(body || '');
}

/* ---------------------------------------------------- account, instrument */

const ACCOUNT_RE = /(?:a\/c|acct|account|card|\bac)\.?\s*(?:no\.?|number)?\s*[:\-]?\s*(?:x+|\*+)\s*(\d{3,6})/i;
const ACCOUNT_LOOSE_RE = /[xX*]{2,}\s*(\d{3,6})/;

export function extractAccount(body) {
  const match = body.match(ACCOUNT_RE) || body.match(ACCOUNT_LOOSE_RE);
  return match ? match[1] : null;
}

export function extractInstrument(body) {
  const lowered = body.toLowerCase();
  if (/\batm\b/.test(lowered)) return 'atm';
  if (/\bupi\b|\bvpa\b|@/.test(lowered)) return 'upi';
  if (/\bcard\b/.test(lowered)) return 'card';
  if (/\b(neft|imps|rtgs)\b/.test(lowered)) return 'bank_transfer';
  if (/\bmob(?:ile)?\s*b(?:an)?k\b|\bmobile\s+banking\b/.test(lowered)) return 'mobile_banking';
  return 'unknown';
}

/* ----------------------------------------------------------- counterparty */

const VPA_RE = /\b([a-z0-9][\w.\-]{1,48}@[a-z]{2,20})\b/i;

//: Union Bank names the payee after "Fvg:" (favouring), truncated to about 8
//: characters: "... ref no , Fvg: ZOMATO L Avl Bal Rs:28893.90."
const FAVOURING_RE = /\b(?:fvg|favouring|favoring|favour|favor)\s*[:\-]\s*([A-Za-z0-9][A-Za-z0-9&'.\-\/ ]{0,60}?)(?=\s+(?:avl|avbl|bal|balance|not\s+you|ref|on)\b|\s*[.;,|]|\s*$)/i;

//: ICICI's current format names the payee before "credited":
//:   "debited for Rs 250.00 on 12-Sep-25; ZOMATO credited."
const ICICI_PAYEE_RE = /;\s*([A-Za-z0-9][A-Za-z0-9&'.\- ]{1,70}?)\s+credited\b/i;

//: "UPI/P2M/523344556677/NAMMA YATRI" -- the last segment may contain spaces.
const UPI_SLASH_RE = /\bupi[\/\-]([A-Za-z0-9@\/.\-_ ]{3,70}?)(?=\s*[.;]|\s*$|\s+(?:avl|bal|ref|refno|not\s+you|if\s+not)\b)/i;
const UPI_LABELS = new Set(['p2m', 'p2a', 'p2p', 'payment', 'paytm', 'upi', 'collect', 'mandate']);

const INFO_RE = /\b(?:info|information|remarks?|narration|desc)\s*[:\-]\s*(.{3,80}?)(?:\.|;|$)/i;

//: Where a merchant phrase ends. Deliberately broad: it is much better to cut
//: a merchant name short than to swallow the date and reference into it.
const STOP = String.raw`(?=\s+(?:on|ref|refno|upi|txn|dated|avl|bal|info|not|if|call|thank|via|linked|for|using|with|your)\b|\s*[.;,(|]|\s*$)`;

//: Prepositions that introduce the payee differ by direction. "From" is only a
//: payee marker on a credit: in "Sent Rs.240 From HDFC Bank A/C x1234 To X" it
//: introduces YOUR bank, and being the leftmost match it would otherwise win.
const DEBIT_PAYEE_RE = new RegExp(
  String.raw`\b(?:to|at|towards|paid\s+to|transferred\s+to)\s+([A-Za-z0-9][\w&'.\/\- ]{1,60}?)` + STOP, 'gi');
const CREDIT_PAYEE_RE = new RegExp(
  String.raw`\b(?:from|by)\s+([A-Za-z0-9][\w&'.\/\- ]{1,60}?)` + STOP, 'gi');

//: Card alerts that put the merchant after the date:
//:   ICICI: "spent using ICICI Bank Card XX4321 on 12-Sep-25 on AMAZON."
//:   Axis:  "INR 3200 08-09-25 19:22:11 DECATHLON SPORTS ... Avl Lmt"
const CARD_AFTER_DATE_RE = /\bon\s+\d{1,2}[-\/ ]?(?:[A-Za-z]{3}|\d{1,2})[-\/ ]?\d{2,4}\s+(?:on|at)\s+([A-Za-z0-9][A-Za-z0-9&'.\- ]{1,50}?)(?=\s*[.;]|\s+(?:avl|if|not)\b|\s*$)/i;
const CARD_AFTER_TIME_RE = /(?:\d{1,2}:\d{2}(?::\d{2})?|\d{2}[-\/]\d{2}[-\/]\d{2,4})\s+([A-Za-z][A-Za-z0-9&'.\- ]{2,50}?)(?=\s+(?:avl|bal|available|lmt|limit|on|ref)\b|\s*[.;]|\s*$)/i;

//: A captured "payee" that is really a reference to your own account.
const OWN_ACCOUNT_RE = /\b(a\/c|acct|account|your|bank\s+a\/c)\b|x{2,}\d|\bupi\s*user\b/i;

//: Payment-rail labels that turn up where a payee would be ("by UPI ref ...").
//: Also the channel names some banks put there: Union Bank writes "by Mob Bk",
//: which is mobile banking, not who was paid.
const RAIL_LABELS = new Set(['upi', 'neft', 'imps', 'rtgs', 'atm', 'nach', 'ecs', 'pos',
  'mob bk', 'mob bnk', 'mobile banking', 'mobile bank', 'mbk', 'net banking', 'netbanking',
  'internet banking', 'inet', 'ib', 'branch', 'cash']);

function cleanCounterparty(text) {
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, ' ').replace(/^[\s.,\-;:\/]+|[\s.,\-;:\/]+$/g, '')
    // A leading preposition belongs to the sentence, not the name: the card
    // pattern reads "12:16:54 by Mob Bk" as the text after the time.
    .replace(/^(?:by|via|through|thru|from|to|at|towards)\s+/i, '');
  if (!cleaned || cleaned.length < 2) return null;
  if (/^[\d\W_]+$/.test(cleaned)) return null;     // bare reference numbers
  if (OWN_ACCOUNT_RE.test(cleaned)) return null;
  if (RAIL_LABELS.has(cleaned.toLowerCase())) return null;
  return cleaned.slice(0, 80);
}

export function extractCounterparty(body, direction = DEBIT) {
  // Ordered by reliability: a VPA is unambiguous; a bare "to X" is weakest.
  const vpa = body.match(VPA_RE);
  if (vpa) return cleanCounterparty(vpa[1]);

  const favouring = body.match(FAVOURING_RE);
  if (favouring) {
    const candidate = cleanCounterparty(favouring[1]);
    if (candidate) return candidate;
  }

  const icici = body.match(ICICI_PAYEE_RE);
  if (icici) {
    const candidate = cleanCounterparty(icici[1]);
    if (candidate) return candidate;
  }

  const slash = body.match(UPI_SLASH_RE);
  if (slash) {
    const parts = slash[1].split('/').map((p) => p.trim()).filter(Boolean);
    const words = parts.filter(
      (p) => !/^\d[\d ]*$/.test(p) && p.length > 2 && !UPI_LABELS.has(p.toLowerCase()),
    );
    if (words.length) {
      const best = words.reduce((a, b) => (b.length > a.length ? b : a))
        .replace(/^\s*payment\s+(?:to|for)\s+/i, '');
      const candidate = cleanCounterparty(best);
      if (candidate) return candidate;
    }
  }

  const info = body.match(INFO_RE);
  if (info) {
    const candidate = cleanCounterparty(info[1]);
    if (candidate) return candidate;
  }

  const payeeRe = direction === CREDIT ? CREDIT_PAYEE_RE : DEBIT_PAYEE_RE;
  payeeRe.lastIndex = 0;
  for (const match of body.matchAll(payeeRe)) {
    const candidate = cleanCounterparty(match[1]);
    if (candidate) return candidate;
  }

  for (const pattern of [CARD_AFTER_DATE_RE, CARD_AFTER_TIME_RE]) {
    const match = body.match(pattern);
    if (match) {
      const candidate = cleanCounterparty(match[1]);
      if (candidate) return candidate;
    }
  }
  return null;
}

/* ------------------------------------------------------ reference & date */

const REF_RE = /\b(?:ref(?:no|erence)?|rrn|txn(?:\s*id)?|utr|transaction\s*id|upi)\s*(?:no\.?|:|-)?\s*([A-Za-z0-9]*\d{6,}[A-Za-z0-9]*)/i;

export function extractReference(body) {
  const match = body.match(REF_RE);
  if (match) return match[1];
  const fallback = body.match(/\b(\d{12})\b/);
  return fallback ? fallback[1] : null;
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const DATE_PATTERNS = [
  [/\b(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})\b/, 'dmy'],
  [/\b(\d{1,2})[-\s]?([A-Za-z]{3})[-\s]?(\d{2,4})\b/, 'dMy'],
  [/\b(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\b/, 'ymd'],
];

/** The time written in the SMS, as "HH:MM:SS", or null.
    Union Bank includes one ("07-09-2026 12:16:54"); most banks don't. */
export function extractTime(body) {
  const match = body.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/);
  if (!match) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}:${match[3] || '00'}`;
}

/** The transaction date written in the SMS, as "YYYY-MM-DD", or null. */
export function extractDate(body) {
  for (const [pattern, order] of DATE_PATTERNS) {
    const match = body.match(pattern);
    if (!match) continue;
    let day; let month; let year;
    if (order === 'dmy') [day, month, year] = [+match[1], +match[2], +match[3]];
    else if (order === 'ymd') [year, month, day] = [+match[1], +match[2], +match[3]];
    else {
      day = +match[1];
      month = MONTHS[match[2].toLowerCase()] || 0;
      year = +match[3];
    }
    if (!month) continue;
    if (year < 100) year += 2000;
    if (day < 1 || day > 31 || month < 1 || month > 12) continue;
    const check = new Date(year, month - 1, day);
    if (check.getMonth() !== month - 1) continue;   // 31-Feb and friends
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}

/* ------------------------------------------------------------------- main */

/** Parse one SMS. Never throws; failure comes back as { ok: false, reason }. */
export function parseSms(body, sender = '') {
  const text = (body || '').replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (containsCredential(text)) return { ok: false, reason: 'credential' };
  if (!looksLikeTransaction(text)) return { ok: false, reason: 'not_a_transaction' };

  const amount = extractAmount(text);
  if (!amount) return { ok: false, reason: 'no_amount' };

  const direction = extractDirection(text);
  return {
    ok: true,
    body: text,
    amountPaise: amount,
    direction,
    accountTail: extractAccount(text),
    instrument: extractInstrument(text),
    counterparty: extractCounterparty(text, direction),
    reference: extractReference(text),
    bank: identifyBank(text, sender),
    day: extractDate(text),
    time: extractTime(text),
    refund: direction === CREDIT && isRefund(text),
  };
}

/* -------------------------------------------------- splitting a paste */

/** Split pasted text that may hold several SMS into separate messages.

    Blank lines always separate messages. Within a block, consecutive lines
    that each read as a complete transaction on their own are treated as
    separate messages; otherwise the lines are one message that wrapped. */
export function splitMessages(text) {
  const blocks = (text || '')
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const messages = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const standalone = lines.filter((l) => parseSms(l).ok).length;
    if (lines.length > 1 && standalone === lines.length) {
      messages.push(...lines);
    } else {
      messages.push(lines.join(' '));
    }
  }
  return messages;
}
