/* Shared helpers: DOM, formatting, toasts, bottom sheets. */

export function h(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

/** Escape before interpolating. Merchant names come from SMS, i.e. from outside. */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Paise -> "₹1,23,456". Mirrors the server's formatter. */
export function inr(paise, { decimals = false } = {}) {
  if (paise === null || paise === undefined) return '—';
  const negative = paise < 0;
  const value = Math.abs(Math.round(paise));
  const rupees = Math.floor(value / 100);
  const rest = value % 100;

  let text = String(rupees);
  if (text.length > 3) {
    const tail = text.slice(-3);
    let head = text.slice(0, -3);
    const groups = [];
    while (head.length > 2) {
      groups.unshift(head.slice(-2));
      head = head.slice(0, -2);
    }
    if (head) groups.unshift(head);
    text = groups.concat(tail).join(',');
  }
  if (decimals) text += '.' + String(rest).padStart(2, '0');
  return (negative ? '-' : '') + '₹' + text;
}

const DAY_MS = 86400000;

export function dayLabel(iso) {
  const today = new Date();
  const date = new Date(iso + 'T00:00:00');
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((midnight - date) / DAY_MS);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7 && diff > 0) return date.toLocaleDateString('en-IN', { weekday: 'long' });
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function timeLabel(iso, hasTime = true) {
  if (!iso || !hasTime) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

/* ---------- toasts ---------- */

/** Show a toast. `action` adds a button, e.g. { label: 'Undo', onClick }. */
export function toast(message, kind = '', { action = null, duration } = {}) {
  const root = document.getElementById('toasts');
  const el = h(`
    <div class="toast ${kind}">
      <span class="toast-text">${esc(message)}</span>
      ${action ? `<button class="toast-action">${esc(action.label)}</button>` : ''}
    </div>`);
  root.appendChild(el);

  const dismiss = () => {
    el.style.transition = 'opacity .2s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 220);
  };
  if (action) {
    el.querySelector('.toast-action').addEventListener('click', () => {
      dismiss();
      action.onClick();
    });
  }
  // Toasts with an action stay longer: nobody can hit Undo in under 3 seconds.
  setTimeout(dismiss, duration || (action ? 6500 : kind === 'bad' ? 4800 : 2600));
}

/* ---------- bottom sheet ---------- */

export function sheet(innerHtml, { onMount } = {}) {
  const root = document.getElementById('sheet-root');
  const backdrop = h(`
    <div class="sheet-backdrop">
      <div class="sheet"><div class="sheet-grip"></div>${innerHtml}</div>
    </div>`);

  const close = () => {
    backdrop.style.transition = 'opacity .15s';
    backdrop.style.opacity = '0';
    setTimeout(() => backdrop.remove(), 150);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (event) => { if (event.key === 'Escape') close(); };

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener('keydown', onKey);
  root.appendChild(backdrop);

  if (onMount) onMount(backdrop.querySelector('.sheet'), close);
  return close;
}

/* ---------- states ---------- */

export function loading(label = 'Loading…') {
  return `
    <div class="empty">
      <div class="spinner" style="color:var(--accent);margin-bottom:12px"></div>
      <p class="muted">${esc(label)}</p>
    </div>`;
}

export function empty({ icon = '🫙', title, body, actionLabel, actionId }) {
  return `
    <div class="card">
      <div class="empty">
        <div class="e-ico">${icon}</div>
        <h3>${esc(title)}</h3>
        <p>${esc(body)}</p>
        ${actionLabel ? `<button class="btn btn-primary" id="${actionId || 'empty-action'}">${esc(actionLabel)}</button>` : ''}
      </div>
    </div>`;
}

export function errorCard(err, retryId = 'retry') {
  return `
    <div class="card">
      <div class="empty">
        <div class="e-ico">⚠️</div>
        <h3>Something went wrong</h3>
        <p>${esc(err.message || 'Something went wrong.')}</p>
        <button class="btn btn-ghost" id="${retryId}">Try again</button>
      </div>
    </div>`;
}
