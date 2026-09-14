/* The link to the Android app, when Kharcha runs inside it.

   On the website `window.KharchaNative` doesn't exist, `isNative` is false,
   and every function here is inert, so the same code serves both. */

const bridge = typeof window !== 'undefined' ? window.KharchaNative : undefined;

export const isNative = Boolean(bridge);

function once(eventName) {
  return new Promise((resolve) => {
    const handler = (event) => {
      window.removeEventListener(eventName, handler);
      resolve(event.detail || {});
    };
    window.addEventListener(eventName, handler);
  });
}

export function hasSmsPermission() {
  return isNative ? Boolean(bridge.hasSmsPermission()) : false;
}

/** Shows Android's permission prompt. Resolves true if granted. */
export async function requestSmsPermission() {
  if (!isNative) return false;
  const answer = once('kharcha-permission');
  bridge.requestSmsPermission();
  return Boolean((await answer).granted);
}

/** Bank SMS received after `sinceMs`, oldest first, as { body, sender, receivedAt }.
    The Android side has already dropped anything not from a bank sender ID. */
export function readBankSms(sinceMs = 0) {
  if (!isNative) return [];
  let list = [];
  try {
    list = JSON.parse(bridge.readBankSms(sinceMs) || '[]');
  } catch {
    list = [];
  }
  return list.map((m) => ({
    body: m.body,
    sender: m.address,
    receivedAt: new Date(Number(m.date)),
  }));
}

/** Opens Android's "Save to…" screen for a file. Resolves true once written. */
export async function saveTextFile(name, text) {
  if (!isNative) return false;
  const result = once('kharcha-saved');
  bridge.saveTextFile(name, text);
  return Boolean((await result).ok);
}

/** Match the phone's status and navigation bars to the app's theme. */
export function setBars(hex, dark) {
  if (isNative) bridge.setBars(hex, Boolean(dark));
}

export function appVersion() {
  return isNative ? bridge.appVersion() : '';
}
