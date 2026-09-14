# Kharcha

**See where your money goes, from your bank's SMS.** Kharcha runs entirely inside
your phone's browser, with no server, no account, and no APK to download.

Copy a payment SMS from your bank and tap **Paste SMS**, or import a whole SMS
backup at once. It reads the amount and the shop, files the payment into a category,
and shows what you spent today, this week and this month.

---

## The Android app (reads your SMS by itself)

A website can't read SMS, so there is also a small Android app. It's the same
code as the website, wrapped so it can read the inbox itself. You build it on
your own laptop and install it over a USB cable. There's no store and no APK
downloaded from anywhere.

- It reads **only bank sender IDs** (`VK-UNIONB`, `AD-ICICIB`, …). Chats from
  people are filtered out in the Android code, before the app ever sees them.
- It asks for **read SMS only**, and has **no internet permission**, so nothing
  it reads can leave the phone.
- New payments appear **every time you open it**. While it's open on screen, a
  new bank SMS shows up within a couple of seconds. Nothing runs in the
  background, so it costs no battery.

Build and install (needs Android Studio's SDK and Python; the phone needs USB
debugging on):

```bash
python android/build.py --install
```

The first build creates a signing key in `android/signing/`. **Keep that
folder.** Android only accepts updates signed with the same key. It's
git-ignored and must never be committed.

## Install it on your phone (website)

1. Open the app's address in **Chrome** on your Android phone.
2. Tap **⋮ → Install app** (or **Add to Home screen**).

Chrome installs the web page itself. You are not downloading an APK file, and
nothing comes from outside the browser. From then on Kharcha has its own icon
and opens full-screen like a normal app, even with no signal.

Installing also shows **Kharcha in your share menu**, and it asks Chrome to keep
your data safe when the phone runs low on space.

## Adding payments

**All your past SMS at once:** install **SMS Backup & Restore** from the Play
Store, back up **Messages** to your phone, then in Kharcha tap **⚙ → Import SMS
backup** and pick the file. Every bank payment in it is added in one go, dated
by when the SMS actually arrived. Personal chats, messages you sent, and OTPs
are skipped. The file is read on the phone and never uploaded.

**Staying up to date without pasting:** turn on *scheduled backups* (daily) in
SMS Backup & Restore. Whenever you open Kharcha, tap **Catch up from latest SMS
backup** and pick the newest file. Only new payments are added.

**Copy and paste** (always works): long-press the bank SMS → **Copy** → open
Kharcha → **Paste SMS**. The payment is saved immediately, with an **Undo**.

**Share** (if your Messages app has it): long-press the SMS → **Share** →
**Kharcha**.

**Several at once:** paste them all into the box behind **+**. Each one is
previewed before it's saved.

**Cash:** **+** → **Cash**.

Older SMS are fine to add. Kharcha uses the date written in the message, and it
never saves the same SMS twice: bank alerts carry their own reference number,
so adding one twice cannot double-count it.

## Union Bank of India

Union Bank debits name the payee after `Fvg:`, cut to 8 letters:
`Debited Rs:264.88 on 11-09-2026 18:29:30 by Mob Bk ref no , Fvg: ZOMATO L`.
Kharcha matches those cut-off names: `ZOMATO L` is Zomato, `ROPPEN T` is
Rapido, `BUNDL TE` is Swiggy, `NAMMA YA` is Namma Yatri.

Some alerts (credits, and some older debits) say only how much and when. For
*what it was on*, tap
**Sort** on the Today screen: one payment at a time, one tap for a category, and
an optional name. Every name you type ("Canteen", "Auto") becomes a one-tap
button, so regular spots take a single tap from the second time on.

Every Union Bank alert ends with "Never Share OTP/PIN/CVV". That's a safety
footer, not an OTP. Kharcha tells the two apart: footers are ignored, while a
message actually carrying a code ("Your OTP … is 483920") is still refused.

## Teaching it

Tap any payment and pick the right category. Kharcha remembers that shop, and
**re-files every earlier payment there too**, so you only correct a shop once.
Categories that were guessed are marked *guessed*.

It also recognises the registered company names that UPI shows in place of the
brand: *Bundl Technologies* is Swiggy, *Kiranakart* is Zepto, *Roppen
Transportation* is Rapido, *Blink Commerce* is Blinkit, and so on.

## What it handles for you

- **Refunds.** When a failed payment is reversed, the original debit is taken
  out of your totals automatically. Nothing is deleted; both are marked.
- **OTPs are refused.** Anything that looks like a one-time password, PIN or CVV
  is rejected before it's read, and is never stored.
- **Reminders aren't spending.** Autopay notices ("will be debited"), bill
  reminders, collect requests, failed payments and offers are all ignored.
- **Credit card ≠ credit.** A card purchase counts as spending, not income.
- **Repeating payments.** Subscriptions are found from their rhythm (same shop,
  similar amount, steady gap) once there are about three months of history.

## Your data

- It's stored **only on this phone**, in the app's private browser storage.
  Nothing is uploaded anywhere. This site has no server to upload to.
- **Back it up now and then:** ⚙ → **Back up** saves a file to Downloads, and
  **Restore** reads it back. Restoring the same backup twice never duplicates
  anything.
- Clearing Chrome's site data for this app **erases your payments**. That's what
  the backup is for.
- The app's code is public at this address, but your payments are not. Anyone
  else who opens it gets an empty app with their own separate storage.

## Honest limits

- The website only knows about payments you paste, share or import. The
  Android app reads them itself.
- A bank that changes its SMS wording may need the parser updated. When a
  message can't be read, you're told why instead of it being silently dropped.
- UPI sometimes shows a person's name with nothing to say whether it's a shop.
  Those land as *Uncategorised* until you file them once.
- Data lives in one browser on one phone. Use Back up / Restore to move it.

---

## For development

No build step and no dependencies: plain HTML, CSS and JavaScript modules.

```bash
python serve.py
```

Then open http://localhost:8790. Run **test.html** to check the parser against
real Union Bank, ICICI, HDFC, SBI and Axis message formats in `tests/fixtures.js`. When a
bank changes its wording, add the new message there first and fix the parser
until it passes.

```
index.html          app shell
manifest.webmanifest  install + share target
sw.js               offline cache; bump VERSION on every release
js/parser.js        SMS -> amount, direction, payee, date
js/merchants.js     payee -> one canonical shop (incl. legal names)
js/categories.js    your corrections > known shops > keywords
js/api.js           summaries, refunds, backup; all local
js/store.js         IndexedDB
js/views.js         screens and sheets
js/native.js        bridge to the Android app (inert on the website)
test.html           parser tests, run in the browser
tests/native-mock.html  the app with a fake Android bridge, for testing
android/            the Android wrapper: one Java file + build.py (no Gradle)
```
