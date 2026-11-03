// Powiadomienia (PWA): zgoda użytkownika, wysyłka lokalna (service worker / Notification API), ustawienia oraz
// subskrypcja Web Push (powiadomienia z serwera także przy zamkniętej aplikacji).
// Ustawienia: localStorage `wealth-app-notify` – { enabled, tasks: { on, hour }, news: { on, min, slot } }
// (starszy zapis { enabled, taskHour } jest odczytywany zgodnie). Po włączeniu Web Push te same ustawienia trafiają
// do tabeli Supabase `push_subscriptions` (supabase/push_subscriptions.sql), z której korzysta /api/push-cron.
import { NOTIFY_TITLE, normalizePrefs } from './notifyPlan.js';
import { getClient } from './cloud.js';

export const NOTIFY_KEY = 'wealth-app-notify';
const SENT_KEY = 'wealth-app-notify-sent';

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;
export const notificationPermission = () => (notificationsSupported() ? Notification.permission : 'unsupported');

export function readNotifySettings() {
  try {
    return normalizePrefs(JSON.parse(localStorage.getItem(NOTIFY_KEY) || '{}'));
  } catch {
    return normalizePrefs({});
  }
}

export function writeNotifySettings(v) {
  try {
    const p = normalizePrefs(v);
    // taskHour – zgodność ze starszymi wersjami aplikacji (kopie zapasowe / inne urządzenia)
    localStorage.setItem(NOTIFY_KEY, JSON.stringify({ ...p, taskHour: p.tasks.hour }));
    window.dispatchEvent(new CustomEvent('wealth-app-prefs-changed', { detail: { key: NOTIFY_KEY } }));
  } catch {
    // brak localStorage
  }
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

// Wysyłka: najpierw przez service worker (wymagane na Androidzie w aplikacji zainstalowanej), potem bezpośrednio
// Tytuł zawsze „FinTrack 📊” (pierwszy argument pozostaje dla zgodności wywołań – nie jest wyświetlany)
export async function showNotification(_title, { body = '', url = '/', tag, renotify = false } = {}) {
  if (notificationPermission() !== 'granted') return false;
  const title = NOTIFY_TITLE;
  const options = { body, tag, renotify: !!(renotify && tag), icon: '/icons/icon-192.png', badge: '/icons/icon-monochrome-512.png', data: { url }, lang: 'pl' };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) {
      await reg.showNotification(title, options);
      return true;
    }
  } catch {
    // brak service workera – próba bezpośrednia
  }
  try {
    // eslint-disable-next-line no-new
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

// Czy dziś już wysłano przypomnienie danego rodzaju (raz dziennie)
export function readSent() {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY) || '{}') || {};
  } catch {
    return {};
  }
}
export function sentToday(kind, day) {
  return readSent()[kind] === day;
}
// Stan alarmów cenowych ({ day, levels }) – w tym samym zapisie co znaczniki „wysłano dziś”
export function writeSentState(kind, value) {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify({ ...readSent(), [kind]: value }));
  } catch {
    // brak localStorage
  }
}
export function markSent(kind, day) {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify({ ...readSent(), [kind]: day }));
  } catch {
    // brak localStorage
  }
}

// ── Web Push ──
// Klucz publiczny VAPID (zmienna VITE_VAPID_PUBLIC_KEY); bez niego działają tylko powiadomienia lokalne
export const vapidPublicKey = () => (import.meta.env?.VITE_VAPID_PUBLIC_KEY || '').trim();
export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && !!vapidPublicKey();

function urlBase64ToUint8Array(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function currentPushSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

const timeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw';
  } catch {
    return 'Europe/Warsaw';
  }
};

// Zapis subskrypcji z ustawieniami i obserwowanymi spółkami (watch – tematy z portfela do podsumowania wiadomości)
async function saveSubscription(userId, sub, prefs, watch) {
  const json = sub.toJSON();
  const sb = await getClient();
  const { error } = await sb.from('push_subscriptions').upsert(
    { user_id: userId, endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth, prefs: normalizePrefs(prefs), watch, tz: timeZone(), updated_at: new Date().toISOString() },
    { onConflict: 'endpoint' },
  );
  if (error) throw new Error(/push_subscriptions/.test(error.message || '') ? 'brak tabeli push_subscriptions – uruchom supabase/push_subscriptions.sql' : error.message);
}

export async function subscribePush(userId, prefs, watch = []) {
  if (!pushSupported()) throw new Error('Web Push nie jest skonfigurowany (VITE_VAPID_PUBLIC_KEY) albo nieobsługiwany przez przeglądarkę');
  if (!userId) throw new Error('Zaloguj się, aby włączyć powiadomienia z serwera');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey()) }));
  await saveSubscription(userId, sub, prefs, watch);
  return sub;
}

// Aktualizacja ustawień / spółek w istniejącej subskrypcji (np. po zmianie godziny albo portfela)
export async function syncPushSubscription(userId, prefs, watch = []) {
  const sub = await currentPushSubscription();
  if (!sub || !userId) return false;
  await saveSubscription(userId, sub, prefs, watch);
  return true;
}

export async function unsubscribePush(userId) {
  const sub = await currentPushSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  if (userId) {
    const sb = await getClient();
    await sb.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', userId);
  }
}

// Powiadomienie testowe z serwera (sprawdza całą ścieżkę: VAPID, subskrypcja, service worker)
export async function sendServerTestPush() {
  const sb = await getClient();
  const { data } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Brak sesji – zaloguj się ponownie');
  const res = await fetch('/api/push-test', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}
