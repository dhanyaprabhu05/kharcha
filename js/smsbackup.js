/* Reading an "SMS Backup & Restore" XML file.

   The file looks like:
     <smses count="3">
       <sms address="AD-ICICIB" date="1726290000000" type="1" body="..." ... />
       <mms ...> ...base64 images... </mms>
     </smses>

   It is scanned with a regular expression rather than a DOM parser on purpose:
   a backup that includes MMS can be tens of megabytes of base64 images, and
   building a DOM for all of it would stall a phone. The scan picks out <sms>
   elements only and never touches <mms> content.

   Attribute values are matched quote-aware, because SMS text can legitimately
   contain ">" and a naive `[^>]*` would cut a message in half. */

const SMS_ELEMENT_RE = /<sms((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*\/?>/g;
const ATTRIBUTE_RE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

//: Bank and payment-app sender codes, matched inside the sender ID
//: ("AD-ICICIB", "JD-ICICIT", "VM-HDFCBK").
const BANK_SENDER_CODES = [
  'ICICI', 'HDFC', 'SBI', 'AXIS', 'KOTAK', 'PNB', 'BOB', 'BOI', 'CANBNK', 'CANARA',
  'UNIONB', 'UBOI', 'UBIN', 'ANDBNK', 'CORPBK', 'IDBI', 'IDFC', 'INDUS', 'YESBNK', 'RBL', 'FEDBNK', 'FEDERAL', 'SIB',
  'CSB', 'KVB', 'TMB', 'INDBNK', 'IOB', 'UCO', 'CENTBK', 'AUBANK', 'BANDHN',
  'JUPITER', 'FISUPI', 'PAYTM', 'PHONPE', 'PHONEPE', 'GPAY', 'AMZNPAY', 'SLICE', 'CRED',
];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, name) => {
    if (name[0] === '#') {
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

function attributes(source) {
  const result = {};
  for (const match of source.matchAll(ATTRIBUTE_RE)) {
    result[match[1]] = decodeEntities(match[2] ?? match[3] ?? '');
  }
  return result;
}

/** Bank alerts come from alphanumeric sender IDs, never from phone numbers. */
export function isBankSender(address) {
  const upper = String(address || '').toUpperCase();
  if (!/[A-Z]/.test(upper)) return false;      // a phone number: a person
  return BANK_SENDER_CODES.some((code) => upper.includes(code));
}

/** Extract received bank messages from a backup file. */
export function readSmsBackup(xml) {
  const messages = [];
  let total = 0;
  let sent = 0;
  let personal = 0;

  for (const match of String(xml || '').matchAll(SMS_ELEMENT_RE)) {
    total += 1;
    const sms = attributes(match[1]);
    // type 1 = received. Anything you sent yourself is not a bank alert.
    if (sms.type && sms.type !== '1') { sent += 1; continue; }
    if (!isBankSender(sms.address)) { personal += 1; continue; }

    const body = (sms.body || '').trim();
    if (!body || body === 'null') continue;
    const epoch = Number(sms.date);
    messages.push({
      body,
      sender: sms.address,
      receivedAt: Number.isFinite(epoch) && epoch > 0 ? new Date(epoch) : null,
    });
  }
  return { messages, total, sent, personal };
}
