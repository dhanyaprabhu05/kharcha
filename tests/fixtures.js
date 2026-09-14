/* Real-world bank SMS shapes, used by test.html.

   ICICI comes first and gets the most cases because it is the bank this app is
   actually used with. Account numbers and references are altered.

   `expect: null` means the message must be REJECTED (OTP, reminder, offer,
   failed payment, collect request) and never become a transaction. */

export const FIXTURES = [
  // ------------------------------------------------------- Union Bank of India
  // The format actually received on the phone this app is used with. Every
  // message ends in a safety footer naming OTP/PIN/CVV, and none name a payee.
  {
    name: 'Union Bank credit (real message, digits changed)',
    body: 'A/c *7165 Credited for Rs:30.00 on 07-09-2026 12:16:54 by Mob Bk ref no 525512340001 Avl Bal Rs:1520.45 .Never Share OTP/PIN/CVV-Union Bank of India',
    expect: { amount: 3000, direction: 'credit', account: '7165', category: 'income', day: '2026-09-07', time: '12:16:54', merchantName: 'Unknown' },
  },
  {
    name: 'Union Bank debit, same format',
    body: 'A/c *7165 Debited for Rs:250.00 on 08-09-2026 13:05:10 by Mob Bk ref no 525512340002 Avl Bal Rs:1270.45 .Never Share OTP/PIN/CVV-Union Bank of India',
    expect: { amount: 25000, direction: 'debit', account: '7165', category: 'other', day: '2026-09-08', time: '13:05:10', merchantName: 'Unknown' },
  },
  {
    name: 'Union Bank debit with a four-digit amount',
    body: 'A/c *7165 Debited for Rs:1,499.00 on 09-09-2026 20:41:02 by Mob Bk ref no 525512340003 Avl Bal Rs:12.50 .Never Share OTP/PIN/CVV-Union Bank of India',
    expect: { amount: 149900, direction: 'debit', account: '7165', day: '2026-09-09' },
  },
  {
    name: 'Union Bank UPI variant',
    body: 'Your A/c XX7165 is debited for Rs.120.00 on 10-09-2026 by UPI ref no 525512340004. Avl bal Rs.1150.45 - Union Bank of India',
    expect: { amount: 12000, direction: 'debit', account: '7165', day: '2026-09-10' },
  },
  {
    name: 'Payment alert with "never asks / do not share" footers is still a payment',
    body: 'Rs.500.00 debited from a/c XX4567 on 09-09-26 to VPA swiggy@icici (UPI Ref 525512340005). Bank never asks for OTP/PIN. Do not share your OTP with anyone.',
    expect: { amount: 50000, direction: 'debit', merchant: 'swiggy' },
  },
  // A real OTP must still be refused even when it carries the same footer.
  { name: 'Union Bank OTP with the footer', body: 'Your OTP for transaction of Rs:250.00 is 483920. Never Share OTP/PIN/CVV-Union Bank of India', expect: null },
  { name: 'OTP hidden behind a footer, labelled "code"', body: '482913 is your code to pay Rs:99.00 to ZOMATO. Never share OTP/PIN/CVV.', expect: null },
  { name: 'MPIN message', body: 'Use MPIN 4321 to approve the debit of Rs:500.00 from A/c *7165.', expect: null },

  // ------------------------------------------------------------------ ICICI
  {
    name: 'ICICI UPI debit, current format',
    body: 'ICICI Bank Acct XX123 debited for Rs 250.00 on 12-Sep-25; ZOMATO credited. UPI:525512345678. Call 18002662 for dispute. SMS BLOCK 123 to 9215676766.',
    expect: { amount: 25000, direction: 'debit', account: '123', merchant: 'zomato', category: 'food_delivery', day: '2025-09-12' },
  },
  {
    name: 'ICICI UPI debit to a legal-entity name (Swiggy)',
    body: 'ICICI Bank Acct XX123 debited for Rs 412.00 on 13-Sep-25; BUNDL TECHNOLOGIES PRIVATE LIMITED credited. UPI:525598765432. Call 18002662 for dispute.',
    expect: { amount: 41200, direction: 'debit', merchant: 'swiggy', category: 'food_delivery' },
  },
  {
    name: 'ICICI UPI debit to Zepto (Kiranakart)',
    body: 'ICICI Bank Acct XX123 debited for Rs 389.00 on 13-Sep-25; KIRANAKART TECHNOLOGIES PVT LTD credited. UPI:525500001111. Call 18002662 for dispute.',
    expect: { amount: 38900, merchant: 'zepto', category: 'groceries' },
  },
  {
    name: 'ICICI UPI debit to a person',
    body: 'ICICI Bank Acct XX123 debited for Rs 150.00 on 11-Sep-25; RAHUL KUMAR credited. UPI:525511112222. Call 18002662 for dispute.',
    expect: { amount: 15000, direction: 'debit', merchantName: 'Rahul Kumar' },
  },
  {
    name: 'ICICI UPI debit, older "Info:" format',
    body: 'Dear Customer, Acct XX123 is debited with INR 340.00 on 11-Sep-25. Info: UPI/523987654321/Payment to Swiggy. The Available Balance is INR 8,220.10.',
    expect: { amount: 34000, direction: 'debit', account: '123', merchant: 'swiggy', category: 'food_delivery' },
  },
  {
    name: 'ICICI UPI credit from a person',
    body: 'Dear Customer, Acct XX123 is credited with Rs 500.00 on 12-Sep-25 from JOHN DOE. UPI:525512349999-ICICI Bank.',
    expect: { amount: 50000, direction: 'credit', category: 'income' },
  },
  {
    name: 'ICICI credit, colon format',
    body: 'ICICI Bank Account XX123 credited:Rs. 1,000.00 on 12-Sep-25 by UPI ref No.525512345000; Avl Bal Rs. 5,000.00',
    expect: { amount: 100000, direction: 'credit', account: '123', category: 'income' },
  },
  {
    name: 'ICICI salary credit',
    body: 'ICICI Bank Acct XX123 credited with Rs 15,000.00 on 01-Sep-25. Info: NEFT-SALARY-ACME PRIVATE LIMITED.',
    expect: { amount: 1500000, direction: 'credit', category: 'income' },
  },
  {
    name: 'ICICI credit card spend',
    body: 'INR 1,234.00 spent using ICICI Bank Card XX4321 on 12-Sep-25 on AMAZON. Avl Limit: INR 45,678.00. If not you, call 1800 2662/SMS BLOCK 4321 to 9215676766.',
    expect: { amount: 123400, direction: 'debit', account: '4321', merchant: 'amazon', category: 'shopping' },
  },
  {
    name: 'ICICI credit card, Netflix',
    body: 'INR 649.00 spent using ICICI Bank Card XX4321 on 03-Sep-25 on NETFLIX. Avl Limit: INR 44,000.00.',
    expect: { amount: 64900, direction: 'debit', merchant: 'netflix', category: 'subscriptions' },
  },
  {
    name: 'ICICI UPI autopay (mandate) debit is real spending',
    body: 'Rs 119.00 debited from your ICICI Bank Acct XX123 on 09-Sep-25 towards SPOTIFY INDIA for UPI-Mandate. UPI Ref 525544443333.',
    expect: { amount: 11900, direction: 'debit', merchant: 'spotify', category: 'subscriptions' },
  },
  {
    name: 'ICICI ATM withdrawal',
    body: 'ICICI Bank Acct XX123 debited with INR 2,000.00 on 10-Sep-25 at ATM ID S1CN1234. Avl Bal INR 6,220.00.',
    expect: { amount: 200000, direction: 'debit', category: 'cash' },
  },
  {
    name: 'ICICI Rapido (Roppen Transportation)',
    body: 'ICICI Bank Acct XX123 debited for Rs 64.00 on 12-Sep-25; ROPPEN TRANSPORTATION SERVICES PVT LTD credited. UPI:525577778888. Call 18002662 for dispute.',
    expect: { amount: 6400, merchant: 'rapido', category: 'transport' },
  },

  // ------------------------------------------------------------ other banks
  {
    name: 'HDFC UPI sent',
    body: 'Sent Rs.240.00 From HDFC Bank A/C x1234 To ZOMATO On 12/09/25 Ref 523456789012 Not You? Call 18002586161',
    expect: { amount: 24000, direction: 'debit', account: '1234', merchant: 'zomato', day: '2025-09-12' },
  },
  {
    name: 'HDFC credit card is spending, not income',
    body: 'Thank you for using your HDFC Bank Credit Card xx8899 for Rs.899.00 at NETFLIX on 01-09-2025. Avl Limit: Rs.48,000',
    expect: { amount: 89900, direction: 'debit', merchant: 'netflix' },
  },
  {
    name: 'SBI UPI with no currency symbol',
    body: 'Dear UPI user A/C X8901 debited by 150.0 on date 10Sep25 trf to RAPIDO Refno 598877665544. If not u? call 1800111109. -SBI',
    expect: { amount: 15000, direction: 'debit', account: '8901', merchant: 'rapido' },
  },
  {
    name: 'SBI transfer to a phone-number VPA is a person',
    body: 'Your a/c no. XX8901 is debited for Rs.2000.00 on 05-09-25 and a/c linked to VPA 9876543210@paytm credited (UPI Ref no 512345678901)',
    expect: { amount: 200000, direction: 'debit', category: 'transfers' },
  },
  {
    name: 'Axis card with masked number beside the currency',
    body: 'Spent Card no. XX2211 INR 3200 08-09-25 19:22:11 DECATHLON SPORTS INDIA BANGALORE Avl Lmt INR 96,800',
    expect: { amount: 320000, direction: 'debit', account: '2211', merchant: 'decathlon', category: 'shopping' },
  },
  {
    name: 'Axis UPI P2M with a spaced merchant name',
    body: 'Rs 60.00 debited from A/c XX9012 on 12-09-25 towards UPI/P2M/523344556677/NAMMA YATRI. Bal Rs 4,510.00',
    expect: { amount: 6000, merchant: 'nammayatri', category: 'transport' },
  },

  // ------------------------------------------------------ must be REJECTED
  { name: 'ICICI OTP', body: 'OTP is 483920 for txn of INR 250.00 at ZOMATO on ICICI Bank card XX4321. Do not share OTP with anyone.', expect: null },
  { name: 'Generic OTP', body: '123456 is your one time password to make a payment of INR 3,499.00. Never share your OTP.', expect: null },
  { name: 'ICICI autopay pre-debit notice', body: 'Rs 649.00 will be debited from your ICICI Bank Acct XX123 on 03-Oct-25 towards NETFLIX for UPI-Mandate. To cancel, visit iMobile.', expect: null },
  { name: 'ICICI mandate created', body: 'Your UPI-Mandate for Rs 119.00 towards SPOTIFY is successfully created on ICICI Bank Acct XX123.', expect: null },
  { name: 'ICICI card bill due', body: 'Your ICICI Bank Credit Card XX4321 statement is generated. Total Amount Due: INR 12,400.00. Due date 18-Sep-25.', expect: null },
  { name: 'Failed payment', body: 'Your transaction of Rs.599.00 at SWIGGY has failed. The amount will be reversed within 5 working days.', expect: null },
  { name: 'UPI collect request', body: 'Payment request of Rs.250.00 has been received from john@okaxis. Approve in your UPI app.', expect: null },
  { name: 'Loan offer', body: 'Congratulations! You are eligible for a pre-approved personal loan of Rs.5,00,000 from ICICI Bank. Click here to apply now.', expect: null },
  { name: 'Delivery update', body: 'Your Amazon order has been shipped and will arrive tomorrow.', expect: null },
];
