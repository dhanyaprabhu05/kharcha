# Kharcha

**See where your money goes, from your bank's SMS.** Kharcha runs entirely inside
your phone's browser, with no server, no account, and no APK to download.

Copy an ICICI payment SMS and tap **Paste SMS**, or share the SMS straight to
Kharcha. It reads the amount and the shop, files the payment into a category,
and shows what you spent today, this week and this month.

---

## Install it on your phone

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
never saves the same SMS twice: every ICICI alert carries its own UPI reference
number, so sharing one twice cannot double-count it.

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

- It only knows about payments you paste or share. A payment you skip is
  missing.
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
real ICICI, HDFC, SBI and Axis message formats in `tests/fixtures.js`. When a
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
test.html           parser tests, run in the browser
```
