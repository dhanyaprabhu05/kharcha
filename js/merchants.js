/* Merchant resolution: many spellings, one merchant.

   PAYTM*ZOMATO, zomato@ybl, "ZOMATO LIMITED BANGALORE" and "Eternal Limited"
   must all become Zomato, or every total is wrong.

   UPI payee names are often the REGISTERED COMPANY name rather than the brand,
   which is why this table knows that Bundl Technologies is Swiggy and
   Kiranakart is Zepto. ICICI's SMS show exactly that registered name.

   Aliases match whole words only. Substring matching was a real bug in the
   first version: "ola" matched "Coca Cola", "rent" matched "current". */

const AGGREGATORS = ['paytm', 'razorpay', 'rzp', 'billdesk', 'ccavenue', 'payu',
  'cashfree', 'instamojo', 'phonepe', 'gpay', 'googlepay', 'bharatpe', 'pinelabs',
  'juspay', 'easebuzz', 'worldline', 'mswipe', 'ezetap'];

const COMPANY_SUFFIXES = ['private limited', 'pvt limited', 'pvt ltd', 'private ltd',
  'p ltd', 'limited', 'ltd', 'llp', 'inc', 'corp', 'corporation', 'company',
  'technologies', 'technology', 'tech', 'solutions', 'services', 'enterprises',
  'retail', 'retails', 'stores', 'store', 'india', 'indian', 'online', 'digital',
  'ventures', 'labs', 'systems', 'hospitality', 'foods', 'pvt', 'private']
  .sort((a, b) => b.length - a.length);

const CITIES = new Set(['bangalore', 'bengaluru', 'mumbai', 'delhi', 'chennai',
  'kolkata', 'hyderabad', 'pune', 'ahmedabad', 'kochi', 'cochin', 'trivandrum',
  'thiruvananthapuram', 'kozhikode', 'calicut', 'thrissur', 'coimbatore',
  'madurai', 'mysore', 'mysuru', 'noida', 'gurgaon', 'gurugram', 'jaipur',
  'lucknow', 'chandigarh', 'indore', 'bhopal', 'nagpur', 'surat', 'vadodara',
  'vizag', 'visakhapatnam', 'patna', 'guwahati', 'goa', 'kerala', 'karnataka',
  'maharashtra', 'gujarat', 'tamilnadu', 'in']);

/* [pattern, display name]. Patterns are whole-word, checked in order, so the
   more specific ones (Swiggy Instamart) sit above the general (Swiggy). */
const ALIAS_LIST = [
  // Legal entity names that UPI shows instead of the brand.
  ['bundl technologies', 'Swiggy'], ['bundl', 'Swiggy'],
  ['kiranakart', 'Zepto'], ['blink commerce', 'Blinkit'],
  ['eternal limited', 'Zomato'], ['eternal ltd', 'Zomato'],
  ['roppen transportation', 'Rapido'], ['ani technologies', 'Ola'],
  ['uber india systems', 'Uber'], ['bigtree entertainment', 'BookMyShow'],
  ['fsn e commerce', 'Nykaa'], ['fashnear', 'Meesho'], ['instakart', 'Flipkart'],
  ['flipkart internet', 'Flipkart'], ['myntra designs', 'Myntra'],
  ['innovative retail concepts', 'BigBasket'], ['supermarket grocery supplies', 'BigBasket'],
  ['avenue supermarts', 'DMart'], ['jubilant foodworks', "Domino's"],
  ['hardcastle restaurants', "McDonald's"], ['connaught plaza restaurants', "McDonald's"],
  ['curefit', 'Cult.fit'], ['sporta technologies', 'Dream11'],
  ['reliance jio', 'Jio'], ['bharti airtel', 'Airtel'],
  ['google india digital', 'Google'], ['apple media services', 'Apple'],
  ['indian railway catering', 'IRCTC'], ['tata starbucks', 'Starbucks'],
  ['delightful gourmet', 'Licious'], ['nextbillion technology', 'Groww'],
  ['zerodha broking', 'Zerodha'],
  // Brands.
  ['swiggy instamart', 'Swiggy Instamart'], ['instamart', 'Swiggy Instamart'],
  ['zomato', 'Zomato'], ['swiggy', 'Swiggy'], ['blinkit', 'Blinkit'],
  ['grofers', 'Blinkit'], ['zepto', 'Zepto'], ['bigbasket', 'BigBasket'],
  ['bb daily', 'BigBasket'], ['dmart', 'DMart'], ['jiomart', 'JioMart'],
  ['reliance fresh', 'Reliance Fresh'], ['reliance digital', 'Reliance Digital'],
  ['reliance smart', 'Reliance Smart'], ['amazon', 'Amazon'], ['amzn', 'Amazon'],
  ['flipkart', 'Flipkart'], ['myntra', 'Myntra'], ['ajio', 'AJIO'],
  ['meesho', 'Meesho'], ['nykaa', 'Nykaa'], ['tatacliq', 'Tata CLiQ'],
  ['croma', 'Croma'], ['decathlon', 'Decathlon'], ['ikea', 'IKEA'],
  ['lenskart', 'Lenskart'], ['uber', 'Uber'], ['olacabs', 'Ola'], ['ola cabs', 'Ola'],
  ['ola', 'Ola'], ['rapido', 'Rapido'], ['namma yatri', 'Namma Yatri'],
  ['irctc', 'IRCTC'], ['redbus', 'RedBus'], ['makemytrip', 'MakeMyTrip'],
  ['goibibo', 'Goibibo'], ['cleartrip', 'Cleartrip'], ['indigo', 'IndiGo'],
  ['air india', 'Air India'], ['netflix', 'Netflix'], ['spotify', 'Spotify'],
  ['hotstar', 'JioHotstar'], ['jiohotstar', 'JioHotstar'], ['jiocinema', 'JioHotstar'],
  ['prime video', 'Prime Video'], ['youtube', 'YouTube'], ['google', 'Google'],
  ['apple', 'Apple'], ['microsoft', 'Microsoft'], ['openai', 'OpenAI'],
  ['anthropic', 'Anthropic'], ['github', 'GitHub'], ['adobe', 'Adobe'],
  ['canva', 'Canva'], ['notion', 'Notion'], ['jio', 'Jio'], ['airtel', 'Airtel'],
  ['vodafone', 'Vi'], ['bsnl', 'BSNL'], ['act fibernet', 'ACT Fibernet'],
  ['starbucks', 'Starbucks'], ["domino'?s", "Domino's"], ["mcdonald'?s", "McDonald's"],
  ['kfc', 'KFC'], ['burger king', 'Burger King'], ['subway', 'Subway'],
  ['cafe coffee day', 'Cafe Coffee Day'], ['chaayos', 'Chaayos'],
  ['third wave coffee', 'Third Wave Coffee'], ['bookmyshow', 'BookMyShow'],
  ['pvr', 'PVR'], ['inox', 'INOX'],
  ['apollo pharmacy', 'Apollo Pharmacy'], ['pharmeasy', 'PharmEasy'],
  ['1mg', 'Tata 1mg'], ['netmeds', 'Netmeds'], ['cult fit', 'Cult.fit'],
  ['practo', 'Practo'], ['licious', 'Licious'], ['freshtohome', 'FreshToHome'],
  ['indian oil', 'Indian Oil'], ['indianoil', 'Indian Oil'], ['iocl', 'Indian Oil'],
  ['bharat petroleum', 'Bharat Petroleum'], ['bpcl', 'Bharat Petroleum'],
  ['hindustan petroleum', 'HP Petrol'], ['hpcl', 'HP Petrol'], ['shell', 'Shell'],
  ['fastag', 'FASTag'], ['zerodha', 'Zerodha'], ['groww', 'Groww'],
  ['upstox', 'Upstox'], ['dream11', 'Dream11'],
  // Vending machines, common on campuses and in offices.
  ['justvend', 'JustVend'], ['daalchini', 'Daalchini'], ['vendiman', 'Vendiman'],
];

const ALIASES = ALIAS_LIST.map(([pattern, name]) => [new RegExp(`\\b${pattern.replace(/\s+/g, '\\s+')}\\b`), name]);

//: Aliases too generic to match from a truncated fragment. "INDIAN R" could be
//: IRCTC or an Indian restaurant; "ETERNAL " could be Zomato or a café.
const NO_PREFIX = new Set(['innovative retail concepts', 'supermarket grocery supplies',
  'avenue supermarts', 'indian railway catering', 'eternal limited', 'eternal ltd',
  'delightful gourmet', 'connaught plaza restaurants', 'prime video', 'air india']);

//: Plain-text aliases usable for prefix matching (regex-style ones excluded).
const PREFIXABLE = ALIAS_LIST
  .filter(([pattern]) => !/[?'*]/.test(pattern) && !NO_PREFIX.has(pattern))
  .map(([pattern, name]) => [pattern, name]);

//: Union Bank cuts payee names to 8 characters. A fragment this long that is
//: the start of exactly one known merchant is that merchant; anything shorter,
//: or matching several ("RELIANCE" = Fresh? Digital? Jio?), is left alone.
const MIN_FRAGMENT = 7;

function aliasForFragment(fragment) {
  if (!fragment || fragment.length < MIN_FRAGMENT) return null;
  const names = new Set(
    PREFIXABLE
      .filter(([pattern]) => pattern.length > fragment.length && pattern.startsWith(fragment))
      .map(([, name]) => name),
  );
  return names.size === 1 ? [...names][0] : null;
}

const PHONE_VPA_RE = /^(?:\+?91)?[6-9]\d{9}$/;

const SHORT_WORDS = new Set(['sri', 'shri', 'the', 'and', 'of', 'new', 'big',
  'raj', 'ram', 'sai', 'dr', 'mr', 'ms', 'bar', 'bus', 'cab', 'tea', 'pan', 'dal',
  'hot', 'top', 'one', 'two', 'day', 'fun', 'joy', 'om']);

function stripAccents(text) {
  return text.normalize('NFKD').replace(/\p{M}/gu, '');
}

function splitVpa(raw) {
  const at = raw.indexOf('@');
  return at >= 0 ? [raw.slice(0, at), raw.slice(at + 1)] : [raw, null];
}

export function isPersonVpa(raw) {
  if (!raw) return false;
  const [handle, provider] = splitVpa(raw.trim());
  return provider !== null && PHONE_VPA_RE.test(handle.replace(/[-\s]/g, ''));
}

/** Lower-case words with punctuation gone, but company suffixes still on. */
function normalise(raw) {
  let text = stripAccents(String(raw || '')).toLowerCase().trim();

  // "PAYTM*ZOMATO" and "RAZORPAY|Zomato" -> the part after the gateway.
  for (const separator of ['*', '|']) {
    if (text.includes(separator)) {
      const [head, ...rest] = text.split(separator);
      const tail = rest.join(separator).trim();
      if (tail && AGGREGATORS.some((a) => head.trim().startsWith(a))) text = tail;
    }
  }

  [text] = splitVpa(text);
  text = text.replace(/[^\w\s&']/g, ' ').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

  for (const prefix of AGGREGATORS) {
    if (text.startsWith(prefix + ' ')) text = text.slice(prefix.length + 1);
  }
  return text;
}

/** Reduce to the identifying words: no gateway, city, or corporate suffix. */
export function clean(raw) {
  let text = normalise(raw);
  text = text.replace(/\s+\d{3,}$/, '');   // trailing reference digits

  const words = text.split(' ').filter(Boolean);
  while (words.length > 1 && CITIES.has(words[words.length - 1])) words.pop();
  text = words.join(' ');

  let previous;
  do {
    previous = text;
    for (const suffix of COMPANY_SUFFIXES) {
      if (text.endsWith(' ' + suffix)) text = text.slice(0, -(suffix.length + 1)).trim();
    }
  } while (text !== previous && text.includes(' '));

  return text.replace(/\s+/g, ' ').trim();
}

function aliasFor(raw) {
  // A truncated name first: "SWIGGY I" is Swiggy Instamart, not Swiggy, and
  // "KIRANAKA" (Kiranakart) is Zepto though no whole alias appears in it.
  const fragment = aliasForFragment(normalise(raw));
  if (fragment) return fragment;

  // Then whole-word matches, fuller form first, so "Ani Technologies" can
  // match while plain "Ani Sweets" does not.
  for (const candidate of [normalise(raw), clean(raw)]) {
    if (!candidate) continue;
    for (const [pattern, name] of ALIASES) {
      if (pattern.test(candidate)) return name;
    }
  }
  return null;
}

const keyOf = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Resolve a raw payee string to { key, name, isPerson }. */
export function resolveMerchant(raw) {
  if (!raw) return { key: '', name: 'Unknown', isPerson: false };
  if (isPersonVpa(raw)) return { key: 'person_upi', name: 'Person (UPI)', isPerson: true };

  const alias = aliasFor(raw);
  if (alias) return { key: keyOf(alias), name: alias, isPerson: false };

  const cleaned = clean(raw);
  if (!cleaned) return { key: '', name: 'Unknown', isPerson: false };

  // Title-case, but keep short acronyms: "kfc" -> "KFC", not "Kfc". Common
  // short words are not acronyms: "sri lakshmi" -> "Sri Lakshmi".
  const name = cleaned
    .split(' ')
    .map((w) => (w.length <= 3 && !SHORT_WORDS.has(w)
      ? w.toUpperCase()
      : w[0].toUpperCase() + w.slice(1)))
    .join(' ')
    .slice(0, 60);
  return { key: keyOf(cleaned), name, isPerson: false };
}
