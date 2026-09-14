/* Screens and sheets. */

import { api } from './api.js';
import { loadDemo } from './demo.js';
import {
  dayLabel, empty, errorCard, esc, h, inr, loading, sheet, timeLabel, toast,
} from './ui.js';

let CATEGORIES = [];
let refreshCurrent = () => {};

export async function loadCategories() {
  if (!CATEGORIES.length) CATEGORIES = (await api.categories()).categories;
  return CATEGORIES;
}
export const setRefresher = (fn) => { refreshCurrent = fn; };

const categoryOf = (id) => CATEGORIES.find((c) => c.id === id) || { id, label: id, emoji: '❓' };

/* ================================================================ Today */

export async function renderToday(root) {
  root.innerHTML = loading('Adding up today…');
  try {
    const [data, stats] = await Promise.all([api.overview('today'), api.stats()]);

    if (stats.transactions === 0) {
      root.innerHTML = onboarding();
      wireOnboarding(root);
      return;
    }

    const s = data.summary;
    const delta = s.today.vs_yesterday_paise;
    const deltaText = delta > 0 ? `${inr(delta)} more than yesterday`
      : delta < 0 ? `${inr(-delta)} less than yesterday` : 'Same as yesterday';

    root.innerHTML = `
      ${stats.has_demo ? demoBanner() : ''}

      <div class="hero">
        <div class="label">Spent today</div>
        <div class="amount">${esc(s.today.total_display)}</div>
        <div class="delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'muted'}">${esc(deltaText)}</div>
        <div class="mini-grid">
          <div class="cell"><div class="k">This week</div><div class="v">${esc(s.week.total_display)}</div></div>
          <div class="cell"><div class="k">This month</div><div class="v">${esc(s.month.total_display)}</div></div>
          <div class="cell"><div class="k">Daily avg</div><div class="v">${esc(s.month.daily_average_display)}</div></div>
        </div>
      </div>

      ${pasteButton()}
      ${stats.last_backup_import ? `
        <button class="btn btn-ghost btn-sm btn-block" id="catch-up" style="margin-top:10px">
          📥 Catch up from latest SMS backup
        </button>` : ''}

      ${s.uncategorised_count > 0 ? `
        <div style="margin-top:12px">
          <div class="notice" style="align-items:center">
            <span class="ico">🏷️</span>
            <div style="flex:1"><strong>${s.uncategorised_count} payment${s.uncategorised_count === 1 ? '' : 's'}</strong>
            this month need${s.uncategorised_count === 1 ? 's' : ''} a category.</div>
            <button class="btn btn-primary btn-sm" id="sort-now">Sort</button>
          </div>
        </div>` : ''}

      <div class="section-title">Today's payments</div>
      ${data.transactions.length
        ? `<div class="card">${data.transactions.map(txnRow).join('')}</div>`
        : `<div class="card"><div class="empty" style="padding:26px 20px">
             <div class="e-ico">🌤️</div><h3>Nothing spent yet today</h3>
             <p>Paste a bank SMS when you pay and it shows up here.</p>
           </div></div>`}
    `;
    wirePasteButton(root);
    wireDemoBanner(root);
    wireTransactions(root);
    const catchUp = root.querySelector('#catch-up');
    if (catchUp) catchUp.addEventListener('click', openImportBackup);
    const sortNow = root.querySelector('#sort-now');
    if (sortNow) sortNow.addEventListener('click', openSorter);
  } catch (err) {
    showError(root, err, () => renderToday(root));
  }
}

function onboarding() {
  return `
    <div class="hero" style="text-align:left">
      <div class="label" style="text-align:center">Welcome to Kharcha</div>
      <div style="font-size:21px;font-weight:700;letter-spacing:-.02em;margin:10px 0 12px;text-align:center">
        See where your money goes
      </div>
      <ol class="steps">
        <li>When you pay, your bank texts you. <strong>Long-press that SMS → Copy.</strong></li>
        <li>Open Kharcha and tap <strong>Paste SMS</strong>.</li>
        <li>It reads the amount and the shop, and files it for you.</li>
      </ol>
      <div class="small faint" style="margin-top:12px">
        You can paste older SMS too — Kharcha uses the date written in the message,
        and never saves the same one twice.
      </div>
    </div>
    <button class="btn btn-primary btn-block" id="import-history" style="margin-top:12px">
      Import all my past bank SMS
    </button>
    <div class="paste-hint">Adds last month (and more) in one go, from an SMS backup file</div>
    ${pasteButton()}
    <div style="text-align:center;margin-top:18px">
      <button class="btn btn-ghost btn-sm" id="load-demo">Try it with sample data first</button>
    </div>
    <div class="notice info" style="margin-top:18px">
      <span class="ico">🔒</span>
      <div>Everything stays on this phone, inside this app. Nothing is uploaded,
      and OTP messages are refused rather than stored.</div>
    </div>`;
}

function wireOnboarding(root) {
  wirePasteButton(root);
  root.querySelector('#import-history').addEventListener('click', openImportBackup);
  root.querySelector('#load-demo').addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    const count = await loadDemo();
    toast(`Loaded ${count} sample payments.`, 'good');
    renderToday(root);
  });
}

function demoBanner() {
  return `
    <div class="banner" id="demo-banner">
      <span>🧪</span>
      <span class="grow">You're looking at <strong>sample data</strong>.</span>
      <button id="clear-demo">Clear it</button>
    </div>`;
}

function wireDemoBanner(root) {
  const button = root.querySelector('#clear-demo');
  if (!button) return;
  button.addEventListener('click', async () => {
    const { removed } = await api.clearDemo();
    toast(`Removed ${removed} sample payments. Your own are untouched.`, 'good');
    refreshCurrent();
  });
}

/* ------------------------------------------------------------- pasting */

function pasteButton() {
  return `
    <button class="paste-cta" id="paste-sms">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/>
      </svg>
      Paste SMS
    </button>
    <div class="paste-hint">Long-press your bank SMS → Copy → tap here</div>`;
}

function wirePasteButton(root) {
  const button = root.querySelector('#paste-sms');
  if (!button) return;
  button.addEventListener('click', quickPaste);
}

/** One tap: read the clipboard and save. Falls back to the paste box when the
    clipboard cannot be read (permission refused, or not an https page). */
export async function quickPaste() {
  let text = '';
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      text = await navigator.clipboard.readText();
    }
  } catch {
    text = '';
  }
  if (!text || !text.trim()) {
    openAddSheet({ tab: 'sms' });
    return;
  }
  await saveText(text, { openOnFailure: true });
}

/** Import text (from paste or share) and report the outcome in one toast. */
export async function saveText(text, { openOnFailure = false } = {}) {
  const report = await api.importText(text);
  const added = report.added;

  if (added.length === 1) {
    const t = added[0];
    toast(`Saved ${t.amount_display} · ${t.merchant_name} (${t.category_label})`, 'good', {
      action: { label: 'Undo', onClick: () => undo(added) },
    });
  } else if (added.length > 1) {
    const total = added.filter((t) => t.direction === 'debit').reduce((s, t) => s + t.amount_paise, 0);
    toast(`Saved ${added.length} payments · ${inr(total)}`, 'good', {
      action: { label: 'Undo', onClick: () => undo(added) },
    });
  } else if (report.duplicates > 0 && !report.unreadable.length && !report.credentials) {
    toast(report.duplicates === 1 ? 'Already saved — no double counting.' : `All ${report.duplicates} were already saved.`);
  } else if (report.credentials > 0 && !report.unreadable.length) {
    toast('That was an OTP message — Kharcha never stores those.', 'bad');
  } else if (openOnFailure) {
    openAddSheet({ tab: 'sms', text });
  } else {
    toast(report.unreadable[0]?.message || "Couldn't read that message.", 'bad');
  }

  if (report.refundsLinked) {
    setTimeout(() => toast('Matched a refund to its payment — left out of your totals.', 'good'), 900);
  }
  refreshCurrent();
  return report;
}

async function undo(added) {
  await api.deleteTransactions(added.map((t) => t.id));
  toast('Undone.');
  refreshCurrent();
}

/* ================================================================ Month */

let monthPeriod = 'month';

export async function renderMonth(root) {
  root.innerHTML = `
    <div class="segmented" id="period-tabs">
      ${[['week', 'This week'], ['month', 'This month'], ['all', 'All time']]
        .map(([key, label]) => `<button data-period="${key}" class="${key === monthPeriod ? 'active' : ''}">${label}</button>`)
        .join('')}
    </div>
    ${loading('Working it out…')}`;

  const tabs = root.querySelector('#period-tabs');
  tabs.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-period]');
    if (!button) return;
    monthPeriod = button.dataset.period;
    renderMonth(root);
  });

  try {
    const data = await api.overview(monthPeriod);
    const label = monthPeriod === 'all' ? 'Total spent' : monthPeriod === 'week' ? 'Spent this week' : 'Spent this month';
    const body = h('<div></div>');
    body.innerHTML = `
      <div class="hero">
        <div class="label">${label}</div>
        <div class="amount">${esc(data.total_display)}</div>
        ${monthPeriod === 'month' && data.total_paise > 0 ? `
          <div class="delta muted">On track for ${esc(data.summary.month.projected_display)} by month end</div>` : ''}
      </div>

      ${data.series.length > 1 ? `
        <div class="card" style="margin-top:12px">
          <div class="card-head"><h2>Day by day</h2></div>
          <div class="chart" id="chart"></div>
        </div>` : ''}

      <div class="section-title">Where it went</div>
      ${data.categories.length
        ? `<div class="card">${data.categories.map(categoryRow).join('')}</div>`
        : empty({ icon: '📊', title: 'Nothing here yet', body: 'Once you add payments, this shows what you spend on.' })}

      ${data.merchants.length ? `
        <div class="section-title">Top places</div>
        <div class="card">${data.merchants.slice(0, 8).map(merchantRow).join('')}</div>` : ''}`;

    root.innerHTML = '';
    root.appendChild(tabs);
    while (body.firstChild) root.appendChild(body.firstChild);

    const chart = root.querySelector('#chart');
    if (chart) drawBars(chart, data.series);
    root.querySelectorAll('[data-category]').forEach((row) => {
      row.addEventListener('click', () => openCategorySheet(row.dataset.category));
    });
  } catch (err) {
    showError(root, err, () => renderMonth(root));
  }
}

/* ================================================================== All */

export async function renderList(root) {
  root.innerHTML = loading('Loading payments…');
  try {
    const { transactions } = await api.transactions({ period: 'all', limit: 400 });
    if (!transactions.length) {
      root.innerHTML = empty({ icon: '📭', title: 'No payments yet', body: 'Paste a bank SMS from the Today tab to add your first one.' });
      return;
    }
    const groups = groupByDay(transactions);
    root.innerHTML = `
      <div class="section-title">All payments · ${transactions.length}</div>
      <div class="card">
        ${groups.map(([day, items]) => `
          <div class="day-head">
            <span>${esc(dayLabel(day))}</span>
            <span class="t">${esc(inr(items.reduce((s, t) => s + (t.direction === 'debit' && !t.excluded ? t.amount_paise : 0), 0)))}</span>
          </div>
          ${items.map(txnRow).join('')}`).join('')}
      </div>`;
    wireTransactions(root);
  } catch (err) {
    showError(root, err, () => renderList(root));
  }
}

/* ============================================================ Repeating */

export async function renderRepeat(root) {
  root.innerHTML = loading('Looking for repeating payments…');
  try {
    const { recurring } = await api.recurring();
    if (!recurring.length) {
      root.innerHTML = empty({
        icon: '🔁', title: 'Nothing repeating yet',
        body: 'Kharcha spots subscriptions from their rhythm — same shop, similar amount, a steady gap. It needs about three months of payments first.',
      });
      return;
    }
    const monthly = recurring.reduce((s, r) => s + Math.round(r.typical_paise * (30 / (r.average_gap_days || 30))), 0);
    root.innerHTML = `
      <div class="hero">
        <div class="label">Repeating every month</div>
        <div class="amount">${esc(inr(monthly))}</div>
        <div class="delta muted">${recurring.length} regular payment${recurring.length === 1 ? '' : 's'} found</div>
      </div>
      <div class="section-title">What repeats</div>
      <div class="card">
        ${recurring.map((r) => `
          <div class="txn">
            <div class="cat-ico">${r.emoji}</div>
            <div class="txn-main">
              <div class="txn-name">${esc(r.name)}</div>
              <div class="txn-sub"><span>${esc(r.cadence)} · every ~${r.average_gap_days}d</span>
                <span>· next ~${esc(dayLabel(r.next_expected))}</span></div>
            </div>
            <div class="txn-amt">${esc(r.typical_display)}</div>
          </div>`).join('')}
      </div>
      <div class="notice info" style="margin-top:12px">
        <span class="ico">💡</span>
        <div>These are guesses from timing, not confirmed subscriptions. Anything you
        don't recognise is worth checking — that's usually where forgotten money goes.</div>
      </div>`;
  } catch (err) {
    showError(root, err, () => renderRepeat(root));
  }
}

/* ============================================================== pieces */

function txnRow(t) {
  const sub = [esc(t.category_label)];
  if (t.instrument === 'upi') sub.push('UPI');
  else if (t.instrument === 'card') sub.push('Card');
  else if (t.source === 'manual') sub.push('Cash');
  const time = timeLabel(t.occurred_at, t.has_time);

  return `
    <div class="txn ${t.excluded ? 'excluded' : ''}" data-txn="${t.id}">
      <div class="cat-ico">${t.category_emoji}</div>
      <div class="txn-main">
        <div class="txn-name">${esc(t.merchant_name)}</div>
        <div class="txn-sub">
          <span>${sub.join(' · ')}</span>
          ${t.is_guess ? '<span class="tag guess">guessed</span>' : ''}
          ${t.is_person ? '<span class="tag person">person</span>' : ''}
          ${t.note ? `<span class="tag">${esc(t.note)}</span>` : ''}
          ${time ? `<span>${esc(time)}</span>` : ''}
        </div>
      </div>
      <div class="txn-amt ${t.direction === 'credit' ? 'credit' : ''}">
        ${t.direction === 'credit' ? '+' : ''}${esc(t.amount_display)}
      </div>
    </div>`;
}

function categoryRow(c) {
  return `
    <div class="cat-row" data-category="${esc(c.category)}">
      <div class="cat-ico">${c.emoji}</div>
      <div class="cat-main">
        <div class="cat-name">${esc(c.label)}</div>
        <div class="cat-sub">${c.count} payment${c.count === 1 ? '' : 's'} · ${c.share_pct}%</div>
        <div class="bar"><i style="width:${Math.max(c.share_pct, 2)}%"></i></div>
      </div>
      <div class="cat-amt">${esc(c.total_display)}</div>
    </div>`;
}

function merchantRow(m) {
  return `
    <div class="txn">
      <div class="cat-ico">${m.emoji}</div>
      <div class="txn-main">
        <div class="txn-name">${esc(m.name)}</div>
        <div class="txn-sub"><span>${m.count} payment${m.count === 1 ? '' : 's'}</span></div>
      </div>
      <div class="txn-amt">${esc(m.total_display)}</div>
    </div>`;
}

function groupByDay(transactions) {
  const map = new Map();
  transactions.forEach((t) => {
    if (!map.has(t.day)) map.set(t.day, []);
    map.get(t.day).push(t);
  });
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

function drawBars(container, series) {
  const width = 340;
  const height = 110;
  const gap = series.length > 60 ? 0.6 : 2;
  const max = Math.max(...series.map((d) => d.total_paise), 1);
  const barWidth = Math.max((width - gap * (series.length - 1)) / series.length, 0.8);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const bars = series.map((d, i) => {
    const barHeight = d.total_paise > 0 ? Math.max((d.total_paise / max) * (height - 16), 2) : 2;
    const cls = d.total_paise === 0 ? 'zero' : d.date === todayKey ? 'today' : '';
    return `<rect class="chart-bar ${cls}" x="${(i * (barWidth + gap)).toFixed(1)}" y="${(height - barHeight).toFixed(1)}"
              width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="${Math.min(barWidth / 2, 2.5).toFixed(1)}">
              <title>${esc(d.date)}: ${esc(d.total_display)}</title></rect>`;
  }).join('');

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height + 16}" preserveAspectRatio="none" role="img" aria-label="Daily spending">
      ${bars}
      <text x="0" y="${height + 13}" font-size="9" fill="var(--faint)">${esc(dayLabel(series[0].date))}</text>
      <text x="${width}" y="${height + 13}" font-size="9" fill="var(--faint)" text-anchor="end">${esc(dayLabel(series[series.length - 1].date))}</text>
    </svg>`;
}

function showError(root, err, retry) {
  root.innerHTML = errorCard(err);
  const button = root.querySelector('#retry');
  if (button) button.addEventListener('click', retry);
}

/* ======================================================= transaction sheet */

function wireTransactions(root) {
  root.querySelectorAll('[data-txn]').forEach((row) => {
    row.addEventListener('click', async () => {
      const { transactions } = await api.transactions({ period: 'all', limit: 100000 });
      const txn = transactions.find((t) => t.id === Number(row.dataset.txn));
      if (txn) openTransactionSheet(txn);
    });
  });
}

function openTransactionSheet(txn) {
  sheet(`
    <h2>${esc(txn.merchant_name)}</h2>
    <p class="sub">
      ${txn.direction === 'credit' ? 'Received' : 'Paid'} ${esc(txn.amount_display)} · ${esc(dayLabel(txn.day))}
      ${esc(timeLabel(txn.occurred_at, txn.has_time))}${txn.bank ? ` · ${esc(txn.bank)}` : ''}${txn.account_tail ? ` ••${esc(txn.account_tail)}` : ''}
    </p>

    <div class="section-title" style="margin-top:0">Category</div>
    <div class="cat-picker" id="cat-picker">
      ${CATEGORIES.map((c) => `
        <button class="cat-pick ${c.id === txn.category ? 'active' : ''}" data-cat="${esc(c.id)}">
          <span class="e">${c.emoji}</span><span>${esc(c.label)}</span>
        </button>`).join('')}
    </div>

    <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" id="toggle-exclude">${txn.excluded ? 'Count in totals' : "Don't count this"}</button>
      <button class="btn btn-ghost btn-sm" id="delete-txn" style="color:var(--bad)">Delete</button>
    </div>

    ${txn.raw_body ? `
      <div class="notice info" style="margin-top:14px">
        <span class="ico">📩</span>
        <div><div class="small faint" style="margin-bottom:3px">From the SMS${txn.is_guess ? ' — the category was guessed; picking one above teaches it' : ''}:</div>
        ${esc(txn.raw_body)}</div>
      </div>` : ''}
  `, {
    onMount(box, close) {
      box.querySelector('#cat-picker').addEventListener('click', async (event) => {
        const button = event.target.closest('[data-cat]');
        if (!button) return;
        const category = button.dataset.cat;
        try {
          const result = await api.setCategory(txn.id, category, true);
          toast(result.updated > 1
            ? `${categoryOf(category).label} — fixed ${result.updated} payments at ${txn.merchant_name}.`
            : `Filed under ${categoryOf(category).label}.`, 'good');
          close();
          refreshCurrent();
        } catch (err) {
          toast(err.message, 'bad');
        }
      });

      box.querySelector('#toggle-exclude').addEventListener('click', async () => {
        await api.setExcluded(txn.id, !txn.excluded);
        toast(txn.excluded ? 'Counted again.' : 'Left out of totals.', 'good');
        close();
        refreshCurrent();
      });

      box.querySelector('#delete-txn').addEventListener('click', async (event) => {
        const button = event.currentTarget;
        if (button.dataset.confirm !== 'yes') {
          button.dataset.confirm = 'yes';
          button.textContent = 'Tap again to delete';
          return;
        }
        await api.deleteTransactions([txn.id]);
        toast('Deleted.');
        close();
        refreshCurrent();
      });
    },
  });
}

async function openCategorySheet(category) {
  const info = categoryOf(category);
  const { transactions } = await api.transactions({ period: 'month', category, limit: 300 });
  sheet(`
    <h2>${info.emoji} ${esc(info.label)}</h2>
    <p class="sub">${transactions.length} payment${transactions.length === 1 ? '' : 's'} this month</p>
    <div class="card">${transactions.map(txnRow).join('') || '<div class="empty"><p>None this month.</p></div>'}</div>
  `, {
    onMount(box, close) {
      box.querySelectorAll('[data-txn]').forEach((row) => {
        row.addEventListener('click', () => {
          const txn = transactions.find((t) => t.id === Number(row.dataset.txn));
          if (!txn) return;
          close();
          openTransactionSheet(txn);
        });
      });
    },
  });
}

/* ============================================================ add sheet */

export function openAddSheet({ tab = 'sms', text = '' } = {}) {
  sheet(`
    <div class="tabs-inline" id="add-tabs">
      <button data-tab="sms" class="${tab === 'sms' ? 'active' : ''}">From SMS</button>
      <button data-tab="cash" class="${tab === 'cash' ? 'active' : ''}">Cash</button>
    </div>

    <div data-pane="sms" ${tab === 'sms' ? '' : 'hidden'}>
      <label class="field">
        <span>Paste one or more bank SMS</span>
        <textarea class="input" id="sms-text" placeholder="ICICI Bank Acct XX123 debited for Rs 250.00 on …">${esc(text)}</textarea>
      </label>
      <div id="sms-preview"></div>
      <button class="btn btn-primary btn-block" id="sms-save" style="margin-top:12px" disabled>Save</button>
      <div class="small faint" style="margin-top:10px">
        Tip: long-press the SMS in your Messages app, tap Copy, then long-press the box above and Paste.
      </div>
      <button class="btn btn-ghost btn-sm btn-block" id="goto-import" style="margin-top:12px">
        Lots of SMS? Import a whole backup file instead
      </button>
    </div>

    <div data-pane="cash" ${tab === 'cash' ? '' : 'hidden'}>
      <p class="sub">For cash, or anything your bank doesn't text you about.</p>
      <label class="field"><span>Amount</span>
        <input class="input" type="number" id="add-amount" inputmode="decimal" placeholder="0" step="0.01" min="0.01" /></label>
      <label class="field"><span>Where</span>
        <input class="input" type="text" id="add-merchant" placeholder="Canteen, auto, chai…" /></label>
      <div class="section-title" style="margin-top:4px">Category</div>
      <div class="cat-picker" id="add-cats">
        ${CATEGORIES.filter((c) => c.id !== 'income').map((c) => `
          <button class="cat-pick" data-cat="${esc(c.id)}"><span class="e">${c.emoji}</span><span>${esc(c.label)}</span></button>`).join('')}
      </div>
      <button class="btn btn-primary btn-block" id="add-save" style="margin-top:18px">Save</button>
    </div>
  `, {
    onMount(box, close) {
      /* tabs */
      box.querySelector('#add-tabs').addEventListener('click', (event) => {
        const button = event.target.closest('[data-tab]');
        if (!button) return;
        box.querySelectorAll('#add-tabs button').forEach((b) => b.classList.toggle('active', b === button));
        box.querySelectorAll('[data-pane]').forEach((pane) => { pane.hidden = pane.dataset.pane !== button.dataset.tab; });
      });

      /* SMS pane: live preview as you paste or type */
      const textarea = box.querySelector('#sms-text');
      const previewEl = box.querySelector('#sms-preview');
      const saveButton = box.querySelector('#sms-save');

      const renderPreview = async () => {
        const value = textarea.value.trim();
        if (!value) { previewEl.innerHTML = ''; saveButton.disabled = true; return; }
        const items = await api.preview(value);
        const saveable = items.filter((i) => i.ok && !i.duplicate).length;
        saveButton.disabled = saveable === 0;
        saveButton.textContent = saveable > 1 ? `Save ${saveable} payments` : 'Save';
        previewEl.innerHTML = `<div class="card">${items.map((item) => {
          if (!item.ok) {
            return `<div class="preview-item bad"><div class="cat-ico">⚠️</div>
              <div class="pv-main"><div class="pv-name">Not saved</div><div class="pv-sub">${esc(item.message)}</div></div></div>`;
          }
          const r = item.record;
          return `<div class="preview-item"><div class="cat-ico">${r.category_emoji}</div>
            <div class="pv-main"><div class="pv-name">${esc(r.merchant_name)}</div>
              <div class="pv-sub">${esc(r.category_label)} · ${esc(dayLabel(r.day))}${item.duplicate ? ' · <strong>already saved</strong>' : ''}${r.is_guess ? ' · guessed' : ''}</div></div>
            <div class="pv-amt ${r.direction === 'credit' ? 'txn-amt credit' : ''}">${r.direction === 'credit' ? '+' : ''}${esc(r.amount_display)}</div></div>`;
        }).join('')}</div>`;
      };
      textarea.addEventListener('input', renderPreview);
      box.querySelector('#goto-import').addEventListener('click', () => {
        close();
        setTimeout(openImportBackup, 180);
      });
      if (text) renderPreview(); else if (tab === 'sms') textarea.focus();

      saveButton.addEventListener('click', async () => {
        saveButton.disabled = true;
        const report = await saveText(textarea.value);
        if (report.added.length) close();
        else renderPreview();
      });

      /* cash pane */
      let chosen = null;
      box.querySelector('#add-cats').addEventListener('click', (event) => {
        const button = event.target.closest('[data-cat]');
        if (!button) return;
        box.querySelectorAll('#add-cats .cat-pick').forEach((b) => b.classList.toggle('active', b === button));
        chosen = button.dataset.cat;
      });
      box.querySelector('#add-save').addEventListener('click', async () => {
        try {
          await api.addManual({
            amount: box.querySelector('#add-amount').value,
            merchant: box.querySelector('#add-merchant').value.trim() || 'Cash',
            category: chosen || 'other',
          });
          toast('Added.', 'good');
          close();
          refreshCurrent();
        } catch (err) {
          toast(err.message, 'bad');
        }
      });
    },
  });
}

/* ============================================================ Sort payments */

/** Tag untagged payments one at a time: tap a category and it moves on.

    Built for banks like Union Bank whose SMS never say who was paid. Names you
    type become one-tap buttons, so a regular spot ("Canteen", "Auto") costs a
    single tap from the second time on. */
export async function openSorter() {
  let queue = (await api.untagged()).transactions;
  const total = queue.length;
  let done = 0;

  if (!total) {
    toast('Nothing to sort — every payment has a category.', 'good');
    return;
  }

  sheet(`<div id="sorter"></div>`, {
    onMount(box, close) {
      const root = box.querySelector('#sorter');

      const render = async () => {
        if (!queue.length) {
          root.innerHTML = `
            <div class="empty" style="padding:24px 10px">
              <div class="e-ico">🎉</div>
              <h3>All sorted</h3>
              <p>${done} payment${done === 1 ? '' : 's'} tagged. Your Month tab now shows where it all went.</p>
              <button class="btn btn-primary" id="sorter-done">Done</button>
            </div>`;
          root.querySelector('#sorter-done').addEventListener('click', () => { close(); refreshCurrent(); });
          return;
        }

        const t = queue[0];
        const labels = await api.recentLabels(8);
        const knownShop = t.merchant_key && !t.merchant_name.startsWith('Untagged');
        root.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <div class="small faint">${done + 1} of ${total}</div>
            <button class="btn btn-ghost btn-sm" id="sorter-close">Finish later</button>
          </div>
          <div style="text-align:center;margin:10px 0 14px">
            <div style="font-size:34px;font-weight:720;letter-spacing:-.03em" class="tabular">${esc(t.amount_display)}</div>
            <div class="muted small">
              ${esc(dayLabel(t.day))} ${esc(timeLabel(t.occurred_at, t.has_time))}
              ${t.bank ? ` · ${esc(t.bank)}` : ''}${t.account_tail ? ` ••${esc(t.account_tail)}` : ''}
            </div>
            ${knownShop ? `<div style="margin-top:6px;font-weight:640">${esc(t.merchant_name)}</div>` : ''}
          </div>

          ${labels.length ? `
            <div class="section-title" style="margin:0 0 8px">One tap</div>
            <div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:14px">
              ${labels.map((l) => `
                <button class="tag" data-label-key="${esc(l.key)}" style="padding:7px 11px;font-size:13px;border:1px solid var(--border);cursor:pointer">
                  ${l.emoji} ${esc(l.name)}</button>`).join('')}
            </div>` : ''}

          ${knownShop ? '' : `
            <label class="field" style="margin-bottom:10px">
              <span>What was it? <span class="faint">(optional — e.g. Canteen, Auto, Rent)</span></span>
              <input class="input" id="sorter-name" type="text" autocomplete="off" />
            </label>`}

          <div class="cat-picker" id="sorter-cats">
            ${CATEGORIES.filter((c) => c.id !== 'income' && c.id !== 'other').map((c) => `
              <button class="cat-pick" data-cat="${esc(c.id)}"><span class="e">${c.emoji}</span><span>${esc(c.label)}</span></button>`).join('')}
          </div>

          <div style="display:flex;gap:8px;margin-top:14px">
            <button class="btn btn-ghost btn-sm" id="sorter-skip" style="flex:1">Skip</button>
            <button class="btn btn-ghost btn-sm" id="sorter-exclude" style="flex:1">Don't count it</button>
          </div>`;

        const next = () => { queue = queue.slice(1); done += 1; render(); };

        root.querySelector('#sorter-close').addEventListener('click', () => { close(); refreshCurrent(); });

        root.querySelectorAll('[data-label-key]').forEach((chip) => {
          chip.addEventListener('click', async () => {
            const label = labels.find((l) => l.key === chip.dataset.labelKey);
            await api.labelTransaction(t.id, { name: label.name, category: label.category });
            next();
          });
        });

        root.querySelector('#sorter-cats').addEventListener('click', async (event) => {
          const button = event.target.closest('[data-cat]');
          if (!button) return;
          const nameInput = root.querySelector('#sorter-name');
          const result = await api.labelTransaction(t.id, {
            name: nameInput ? nameInput.value : '',
            category: button.dataset.cat,
          });
          // Teaching a known shop can file several queued payments at once.
          if (result.updated > 1) {
            const fresh = new Set((await api.untagged()).transactions.map((x) => x.id));
            const before = queue.length;
            queue = queue.filter((x) => x.id === t.id || fresh.has(x.id));
            done += before - queue.length;
          }
          next();
        });

        root.querySelector('#sorter-skip').addEventListener('click', () => {
          queue = queue.slice(1).concat(t);   // back of the line, not lost
          render();
        });
        root.querySelector('#sorter-exclude').addEventListener('click', async () => {
          await api.setExcluded(t.id, true);
          next();
        });
      };

      render();
    },
  });
}

/* ======================================================= SMS backup import */

/** Import every bank SMS from an "SMS Backup & Restore" file in one go. */
export function openImportBackup() {
  sheet(`
    <h2>Import all your bank SMS</h2>
    <p class="sub">Adds every past payment at once: last month, or as far back as your phone keeps SMS.</p>

    <div class="section-title" style="margin-top:0">First time</div>
    <ol class="steps">
      <li>Install <strong>SMS Backup &amp; Restore</strong> from the <strong>Play Store</strong>.</li>
      <li>Open it → <strong>Set up a backup</strong> → turn on <strong>Messages</strong> only (Calls not needed).</li>
      <li>Choose <strong>Your phone</strong> as the place to save it → <strong>Back up now</strong>.</li>
      <li>Come back here and tap <strong>Choose backup file</strong>.</li>
    </ol>

    <label class="btn btn-primary btn-block" for="backup-file" style="margin-top:16px">Choose backup file</label>
    <input type="file" id="backup-file" hidden />
    <div id="import-result" style="margin-top:14px"></div>

    <div class="notice info" style="margin-top:14px">
      <span class="ico">🔒</span>
      <div>The file is read <strong>on this phone only</strong>. Kharcha looks only at messages
      from bank sender IDs, skips anything you sent, refuses OTPs, and keeps nothing but
      the payments. Payments you've already added are never counted twice.</div>
    </div>

    <div class="small faint" style="margin-top:12px">
      <strong>Staying up to date:</strong> in SMS Backup &amp; Restore, turn on
      <strong>scheduled backups</strong> (daily). Then whenever you like, tap Import here
      and pick the newest file. Only the new payments get added.
    </div>
  `, {
    onMount(box) {
      const input = box.querySelector('#backup-file');
      const result = box.querySelector('#import-result');

      input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;
        const megabytes = (file.size / 1048576).toFixed(1);
        result.innerHTML = `<div class="card pad small muted" style="display:flex;gap:10px;align-items:center">
          <span class="spinner" style="color:var(--accent)"></span>
          Reading ${esc(file.name)} (${megabytes} MB)…</div>`;
        try {
          const report = await api.importSmsBackup(await file.text());
          const added = report.added.length;
          const spent = report.added.filter((t) => t.direction === 'debit').reduce((s, t) => s + t.amount_paise, 0);
          result.innerHTML = `
            <div class="card pad">
              <div style="font-weight:680;font-size:16px">
                ${added ? `Added ${added} payment${added === 1 ? '' : 's'}` : 'Nothing new to add'}
              </div>
              ${added ? `<div class="muted small" style="margin-top:3px">
                ${esc(dayLabel(report.from))} to ${esc(dayLabel(report.to))} · ${esc(inr(spent))} spent</div>` : ''}
              <div class="small faint" style="margin-top:9px;line-height:1.7">
                ${report.scanned} messages in the file · ${report.bankMessages} from banks<br/>
                ${report.duplicates ? `${report.duplicates} already saved, skipped<br/>` : ''}
                ${report.credentials ? `${report.credentials} OTP / password messages refused<br/>` : ''}
                ${report.unreadable.length ? `${report.unreadable.length} bank messages weren't payments (reminders, offers, balances)<br/>` : ''}
                ${report.refundsLinked ? `${report.refundsLinked} refunds matched to their payments<br/>` : ''}
              </div>
              <div id="sort-offer"></div>
            </div>`;
          await api.markBackupImported();
          refreshCurrent();

          const pending = (await api.untagged()).transactions.length;
          if (pending) {
            const offer = result.querySelector('#sort-offer');
            offer.innerHTML = `
              <div class="small muted" style="margin-top:10px">${pending} of these don't say what they were for.
              Tag them now — one tap each, and places you tag once become one-tap buttons.</div>
              <button class="btn btn-primary btn-block" id="start-sort" style="margin-top:10px">Sort ${pending} payments</button>`;
            offer.querySelector('#start-sort').addEventListener('click', () => {
              document.querySelector('.sheet-backdrop')?.click();
              setTimeout(openSorter, 200);
            });
          }
        } catch (err) {
          result.innerHTML = `<div class="notice" style="border-color:var(--bad)"><span class="ico">⚠️</span>
            <div>${esc(err.message)}</div></div>`;
        } finally {
          input.value = '';
        }
      });
    },
  });
}

/* ============================================================== settings */

export async function openSettings() {
  const stats = await api.stats();
  const persistence = stats.persistent === true
    ? 'Protected — the phone won\'t clear it to save space.'
    : stats.persistent === false
      ? 'Not yet protected. Install Kharcha to your home screen so Chrome keeps it safe.'
      : 'Unknown on this browser.';

  sheet(`
    <h2>Kharcha</h2>
    <p class="sub">${stats.transactions} payment${stats.transactions === 1 ? '' : 's'} saved${stats.tracking_since ? ` since ${esc(dayLabel(stats.tracking_since))}` : ''} · ${stats.merchant_rules} shop${stats.merchant_rules === 1 ? '' : 's'} you've taught it</p>

    <div class="card">
      <button class="settings-row" id="import-backup">
        <span>📥</span><span class="sr-main">Import SMS backup<div class="sr-sub">${stats.last_backup_import
          ? `Last imported ${esc(dayLabel(stats.last_backup_import.slice(0, 10)))}`
          : 'Add all your past bank SMS at once'}</div></span>
      </button>
      <button class="settings-row" id="export">
        <span>💾</span><span class="sr-main">Back up<div class="sr-sub">Save all your payments to a file</div></span>
      </button>
      <label class="settings-row" for="import-file">
        <span>📂</span><span class="sr-main">Restore from backup<div class="sr-sub">Nothing is ever counted twice</div></span>
      </label>
      <input type="file" id="import-file" accept="application/json,.json" hidden />
      ${stats.has_demo ? `
        <button class="settings-row" id="clear-demo-2">
          <span>🧪</span><span class="sr-main">Clear sample data<div class="sr-sub">Your own payments are kept</div></span>
        </button>` : ''}
      <button class="settings-row danger" id="clear-all">
        <span>🗑️</span><span class="sr-main">Delete everything<div class="sr-sub">Can't be undone — back up first</div></span>
      </button>
    </div>

    <div class="section-title">Your data</div>
    <div class="card pad small muted">
      <div>Stored only on this phone, in this app. Nothing is uploaded anywhere.</div>
      <div style="margin-top:6px">${esc(persistence)}</div>
      <div style="margin-top:6px">Clearing Chrome's site data for this app would erase it, so take a backup now and then.</div>
    </div>
  `, {
    onMount(box, close) {
      box.querySelector('#import-backup').addEventListener('click', () => {
        close();
        setTimeout(openImportBackup, 180);
      });

      box.querySelector('#export').addEventListener('click', async () => {
        const json = await api.exportData();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const today = new Date().toISOString().slice(0, 10);
        link.href = url;
        link.download = `kharcha-backup-${today}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast('Backup saved to your Downloads.', 'good');
      });

      box.querySelector('#import-file').addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        try {
          const result = await api.importBackup(await file.text());
          toast(`Restored ${result.restored} payment${result.restored === 1 ? '' : 's'}${result.skipped ? ` (${result.skipped} already here)` : ''}.`, 'good');
          close();
          refreshCurrent();
        } catch (err) {
          toast(err.message, 'bad');
        }
      });

      const clearDemo = box.querySelector('#clear-demo-2');
      if (clearDemo) {
        clearDemo.addEventListener('click', async () => {
          const { removed } = await api.clearDemo();
          toast(`Removed ${removed} sample payments.`, 'good');
          close();
          refreshCurrent();
        });
      }

      box.querySelector('#clear-all').addEventListener('click', async (event) => {
        const button = event.currentTarget;
        if (button.dataset.confirm !== 'yes') {
          button.dataset.confirm = 'yes';
          button.querySelector('.sr-main').firstChild.textContent = 'Tap again to delete everything';
          return;
        }
        await api.clearAll();
        toast('Everything deleted.');
        close();
        refreshCurrent();
      });
    },
  });
}
