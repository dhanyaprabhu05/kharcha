/* Categorisation, strongest evidence first:
     1. what you told it (a correction always wins, and is remembered)
     2. a table of known merchants
     3. whole-word keyword rules, marked as guesses
   No model: a classifier trained on nothing is worse than a lookup table on
   day one, and your corrections are worth more than any model. */

export const CATEGORIES = [
  { id: 'food_delivery', label: 'Food delivery', emoji: '🍔' },
  { id: 'eating_out', label: 'Eating out', emoji: '🍽️' },
  { id: 'groceries', label: 'Groceries', emoji: '🛒' },
  { id: 'transport', label: 'Transport', emoji: '🚕' },
  { id: 'fuel', label: 'Fuel', emoji: '⛽' },
  { id: 'shopping', label: 'Shopping', emoji: '🛍️' },
  { id: 'bills', label: 'Bills & recharge', emoji: '🧾' },
  { id: 'rent', label: 'Rent', emoji: '🏠' },
  { id: 'subscriptions', label: 'Subscriptions', emoji: '🔁' },
  { id: 'entertainment', label: 'Entertainment', emoji: '🎬' },
  { id: 'health', label: 'Health', emoji: '💊' },
  { id: 'education', label: 'Education', emoji: '📚' },
  { id: 'personal_care', label: 'Personal care', emoji: '✂️' },
  { id: 'travel', label: 'Travel', emoji: '✈️' },
  { id: 'investments', label: 'Investments', emoji: '📈' },
  { id: 'transfers', label: 'Sent to people', emoji: '👥' },
  { id: 'cash', label: 'Cash withdrawal', emoji: '🏧' },
  { id: 'income', label: 'Money in', emoji: '💰' },
  { id: 'other', label: 'Uncategorised', emoji: '❓' },
];

export const INCOME = 'income';
export const UNCATEGORISED = 'other';

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));
export const categoryInfo = (id) => BY_ID.get(id) || BY_ID.get(UNCATEGORISED);
export const isCategory = (id) => BY_ID.has(id);

//: Merchant key (see merchants.js) -> category.
const MERCHANT_CATEGORIES = {
  zomato: 'food_delivery', swiggy: 'food_delivery', dominos: 'food_delivery',
  mcdonalds: 'eating_out', kfc: 'eating_out', burgerking: 'eating_out',
  subway: 'eating_out', starbucks: 'eating_out', cafecoffeeday: 'eating_out',
  chaayos: 'eating_out', thirdwavecoffee: 'eating_out',
  swiggyinstamart: 'groceries', blinkit: 'groceries', zepto: 'groceries',
  bigbasket: 'groceries', dmart: 'groceries', jiomart: 'groceries',
  reliancefresh: 'groceries', reliancesmart: 'groceries', licious: 'groceries',
  freshtohome: 'groceries',
  uber: 'transport', ola: 'transport', rapido: 'transport', nammayatri: 'transport',
  fastag: 'transport', irctc: 'travel', redbus: 'travel', makemytrip: 'travel',
  goibibo: 'travel', cleartrip: 'travel', indigo: 'travel', airindia: 'travel',
  indianoil: 'fuel', bharatpetroleum: 'fuel', hppetrol: 'fuel', shell: 'fuel',
  amazon: 'shopping', flipkart: 'shopping', myntra: 'shopping', ajio: 'shopping',
  meesho: 'shopping', tatacliq: 'shopping', croma: 'shopping', decathlon: 'shopping',
  ikea: 'shopping', lenskart: 'shopping', reliancedigital: 'shopping',
  nykaa: 'personal_care',
  netflix: 'subscriptions', spotify: 'subscriptions', jiohotstar: 'subscriptions',
  primevideo: 'subscriptions', youtube: 'subscriptions', adobe: 'subscriptions',
  canva: 'subscriptions', notion: 'subscriptions', openai: 'subscriptions',
  anthropic: 'subscriptions', github: 'subscriptions', microsoft: 'subscriptions',
  apple: 'subscriptions', google: 'subscriptions',
  jio: 'bills', airtel: 'bills', vi: 'bills', bsnl: 'bills', actfibernet: 'bills',
  bookmyshow: 'entertainment', pvr: 'entertainment', inox: 'entertainment',
  dream11: 'entertainment',
  apollopharmacy: 'health', pharmeasy: 'health', tata1mg: 'health',
  netmeds: 'health', practo: 'health', cultfit: 'health',
  zerodha: 'investments', groww: 'investments', upstox: 'investments',
};

//: Whole-word keyword rules, first match wins. Whole words matter: as a
//: substring "rent" matches "current" and "mart" matches "smart".
const KEYWORD_RULES = [
  ['restaurant', 'eating_out'], ['cafe', 'eating_out'], ['coffee', 'eating_out'],
  ['bakery', 'eating_out'], ['bakers', 'eating_out'], ['hotel', 'eating_out'],
  ['dhaba', 'eating_out'], ['biryani', 'eating_out'], ['juice', 'eating_out'],
  ['tea', 'eating_out'], ['canteen', 'eating_out'], ['mess', 'eating_out'],
  ['sweets', 'eating_out'], ['chai', 'eating_out'], ['kitchen', 'eating_out'],
  ['supermarket', 'groceries'], ['kirana', 'groceries'], ['grocery', 'groceries'],
  ['groceries', 'groceries'], ['provisions', 'groceries'], ['vegetables', 'groceries'],
  ['fruits', 'groceries'], ['dairy', 'groceries'], ['milk', 'groceries'],
  ['hypermarket', 'groceries'], ['mart', 'groceries'],
  ['petrol', 'fuel'], ['fuel', 'fuel'], ['fuels', 'fuel'],
  ['metro', 'transport'], ['bmtc', 'transport'], ['ksrtc', 'transport'],
  ['auto', 'transport'], ['cab', 'transport'], ['cabs', 'transport'],
  ['parking', 'transport'], ['toll', 'transport'], ['travels', 'travel'],
  ['pharmacy', 'health'], ['medical', 'health'], ['medicals', 'health'],
  ['clinic', 'health'], ['hospital', 'health'], ['diagnostics', 'health'],
  ['chemist', 'health'], ['gym', 'health'], ['fitness', 'health'],
  ['salon', 'personal_care'], ['spa', 'personal_care'], ['barber', 'personal_care'],
  ['beauty', 'personal_care'],
  ['recharge', 'bills'], ['electricity', 'bills'], ['broadband', 'bills'],
  ['kseb', 'bills'], ['bescom', 'bills'], ['tneb', 'bills'], ['gas', 'bills'],
  ['water', 'bills'], ['insurance', 'bills'], ['dth', 'bills'],
  ['rent', 'rent'], ['pg', 'rent'], ['hostel', 'rent'],
  ['cinema', 'entertainment'], ['cinemas', 'entertainment'], ['movies', 'entertainment'],
  ['college', 'education'], ['university', 'education'], ['school', 'education'],
  ['tuition', 'education'], ['academy', 'education'], ['books', 'education'],
  ['stationery', 'education'], ['xerox', 'education'],
  ['mutual fund', 'investments'], ['sip', 'investments'],
  ['salary', 'income'], ['interest', 'income'], ['cashback', 'income'],
].map(([word, category]) => [new RegExp(`\\b${word}\\b`, 'i'), category]);

/** Decide a category and say which layer decided it. */
export function categorise({ merchantKey, merchantText, direction, instrument, isPerson, rules }) {
  if (merchantKey && rules && rules[merchantKey]) {
    return { category: rules[merchantKey], source: 'user' };
  }
  if (direction === 'credit') return { category: INCOME, source: 'direction' };
  if (instrument === 'atm') return { category: 'cash', source: 'rule' };
  if (isPerson) return { category: 'transfers', source: 'merchant' };
  if (merchantKey && MERCHANT_CATEGORIES[merchantKey]) {
    return { category: MERCHANT_CATEGORIES[merchantKey], source: 'merchant' };
  }
  const haystack = merchantText || '';
  for (const [pattern, category] of KEYWORD_RULES) {
    if (pattern.test(haystack)) return { category, source: 'keyword' };
  }
  return { category: UNCATEGORISED, source: 'default' };
}

/** A guess is anything the app inferred rather than knew. Shown as such. */
export const isGuess = (source) => source === 'keyword' || source === 'default';

/** Every category referenced by a rule must exist. Checked by test.html. */
export function selfCheck() {
  const problems = [];
  for (const [key, category] of Object.entries(MERCHANT_CATEGORIES)) {
    if (!isCategory(category)) problems.push(`merchant ${key} -> ${category}`);
  }
  for (const [pattern, category] of KEYWORD_RULES) {
    if (!isCategory(category)) problems.push(`keyword ${pattern} -> ${category}`);
  }
  return problems;
}
