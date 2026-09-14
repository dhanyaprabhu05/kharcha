/* Sample data, so the app can be explored before any real SMS is added.

   Generated as ICICI-format SMS TEXT and run through the real parser, merchant
   resolver and categoriser -- nothing is written straight into storage. Every
   row is tagged source='demo' so "Clear sample data" removes exactly these and
   never touches a real payment. */

import { api } from './api.js';

const MERCHANTS = [
  // [payee as ICICI shows it, min rupees, max rupees, weight]
  ['ZOMATO', 180, 480, 6], ['BUNDL TECHNOLOGIES PRIVATE LIMITED', 150, 520, 6],
  ['BLINK COMMERCE PVT LTD', 200, 900, 4], ['KIRANAKART TECHNOLOGIES PVT LTD', 120, 700, 4],
  ['UBER INDIA SYSTEMS PVT LTD', 60, 340, 4], ['ROPPEN TRANSPORTATION SERVICES PVT LTD', 40, 160, 6],
  ['TATA STARBUCKS PRIVATE LIMITED', 250, 480, 2], ['AVENUE SUPERMARTS LTD', 600, 2400, 2],
  ['AMAZON PAY INDIA', 300, 3500, 3], ['APOLLO PHARMACY', 120, 800, 2],
  ['BIGTREE ENTERTAINMENT PVT LTD', 250, 700, 1], ['SRI LAKSHMI STORES', 40, 260, 5],
  ['ANAND KUMAR', 100, 1500, 2], ['CAMPUS CANTEEN', 30, 120, 6],
];
const SUBSCRIPTIONS = [['NETFLIX', 649, 3], ['SPOTIFY INDIA', 119, 10], ['RELIANCE JIO INFOCOMM LTD', 299, 17]];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Small seeded PRNG, so the sample looks the same every time. */
function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smsDate = (d) =>
  `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;

function iciciDebit(amount, payee, date, ref) {
  return `ICICI Bank Acct XX123 debited for Rs ${amount}.00 on ${smsDate(date)}; ${payee} credited. UPI:${ref}. Call 18002662 for dispute.`;
}

export async function loadDemo(days = 100) {
  const random = rng(7);
  const pick = (list) => {
    const total = list.reduce((s, m) => s + m[3], 0);
    let r = random() * total;
    for (const m of list) { r -= m[3]; if (r <= 0) return m; }
    return list[list.length - 1];
  };
  const ref = () => String(Math.floor(100000000000 + random() * 899999999999));

  const bodies = [];
  const today = new Date();
  for (let back = days; back >= 0; back--) {
    const date = new Date(today);
    date.setDate(today.getDate() - back);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const count = Math.floor(random() * (weekend ? 5 : 3.5));
    for (let i = 0; i < count; i++) {
      const [payee, low, high] = pick(MERCHANTS);
      const amount = Math.round(low + random() * (high - low));
      bodies.push(iciciDebit(amount, payee, date, ref()));
    }
    for (const [payee, amount, dayOfMonth] of SUBSCRIPTIONS) {
      if (date.getDate() === dayOfMonth) bodies.push(iciciDebit(amount, payee, date, ref()));
    }
    if (date.getDate() === 1) {
      bodies.push(`ICICI Bank Acct XX123 credited with Rs 8,000.00 on ${smsDate(date)}. Info: NEFT-POCKET MONEY.`);
    }
  }

  const records = bodies.map((body) => api.buildDemoRecord(body, 'demo')).filter(Boolean);
  const saved = await api.addDemo(records);
  return saved.length;
}
