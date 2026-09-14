/* App shell: start-up, share handling, tabs, theme, offline support. */

import { api } from './api.js';
import { isNative, setBars } from './native.js';
import { closeTopSheet, toast } from './ui.js';
import {
  loadCategories, openAddSheet, openSettings, renderList, renderMonth,
  renderRepeat, renderToday, saveText, setRefresher, syncFromDevice,
} from './views.js';

const view = document.getElementById('view');
const ROUTES = { today: renderToday, month: renderMonth, list: renderList, repeat: renderRepeat };
let current = 'today';

function setRoute(route) {
  current = ROUTES[route] ? route : 'today';
  document.querySelectorAll('.tabbar button').forEach((b) => {
    b.classList.toggle('active', b.dataset.route === current);
  });
  window.scrollTo({ top: 0 });
  ROUTES[current](view);
}

/* ---------- theme ---------- */

const THEME_KEY = 'kharcha.theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0d1117' : '#f4f5f7');
  setBars(theme === 'dark' ? '#0d1117' : '#f4f5f7', theme === 'dark');
}

function initTheme() {
  let stored = null;
  try { stored = localStorage.getItem(THEME_KEY); } catch { /* private mode */ }
  applyTheme(stored || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  });
}

/* ---------- share target ---------- */

/** An SMS shared into Kharcha from the Messages app arrives as ?text=...
    It is saved straight away, with Undo on the toast, so sharing is one step. */
async function handleLaunchParams() {
  const params = new URLSearchParams(location.search);
  const shared = params.get('text') || params.get('title') || params.get('url');
  const tab = params.get('tab');
  if (shared || tab) {
    // Drop the SMS text from the address bar so a reload cannot import it again.
    history.replaceState(null, '', location.pathname);
  }
  if (tab) setRoute(tab);
  if (shared) await saveText(shared, { openOnFailure: true });
}

/* ---------- boot ---------- */

async function boot() {
  initTheme();
  try {
    await api.init();
    await loadCategories();
  } catch (err) {
    view.innerHTML = `<div class="card"><div class="empty"><div class="e-ico">⚠️</div>
      <h3>Kharcha could not open its storage</h3><p>${err.message}</p></div></div>`;
    return;
  }

  setRefresher(() => ROUTES[current](view));

  document.getElementById('tabbar').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-route]');
    if (button) setRoute(button.dataset.route);
  });
  document.getElementById('add-btn').addEventListener('click', () => openAddSheet({ tab: 'sms' }));
  document.getElementById('settings-btn').addEventListener('click', openSettings);

  setRoute('today');
  await handleLaunchParams();

  if (isNative) {
    // Android: read new bank SMS now, and every time the app comes back.
    window.__kharchaBack = () => closeTopSheet();
    window.addEventListener('kharcha-resume', () => { syncFromDevice(); });
    // A bank SMS arriving while Kharcha is on screen shows up within seconds.
    window.addEventListener('kharcha-sms', () => { syncFromDevice(); });
    await syncFromDevice();
  }

  // Coming back to the app is usually right after paying; refresh the numbers.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') ROUTES[current](view);
  });

  // The Android app bundles every file already, so it needs no offline cache.
  if (!isNative && 'serviceWorker' in navigator && window.isSecureContext) {
    // When an update takes over, reload once so it's used straight away,
    // instead of only on the next launch. Skipped on the very first install,
    // when the page already came from the network and there's nothing to swap.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      location.reload();
    });
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  if (!isNative) {
    window.addEventListener('offline', () => toast('You are offline. Kharcha still works: it never needs the internet.'));
  }
}

boot();
