// Powiadomienia systemowe (PWA): zgoda użytkownika, wysyłka przez service worker (działa w aplikacji zainstalowanej
// na telefonie) albo bezpośrednio przez Notification API. Ustawienia w localStorage `wealth-app-notify`:
// { enabled, taskHour } – przypomnienie o niewykonanych zadaniach dziennych (raz dziennie od wskazanej godziny,
// gdy aplikacja jest uruchomiona – także w tle). Powiadomienia przy całkowicie zamkniętej aplikacji wymagają
// serwera Web Push i nie są częścią tej wersji.
export const NOTIFY_KEY = 'wealth-app-notify';
const SENT_KEY = 'wealth-app-notify-sent';

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;
export const notificationPermission = () => (notificationsSupported() ? Notification.permission : 'unsupported');

export function readNotifySettings() {
  try {
    const v = JSON.parse(localStorage.getItem(NOTIFY_KEY) || '{}');
    return { enabled: !!v.enabled, taskHour: Number.isInteger(v.taskHour) ? v.taskHour : 20 };
  } catch {
    return { enabled: false, taskHour: 20 };
  }
}

export function writeNotifySettings(v) {
  try {
    localStorage.setItem(NOTIFY_KEY, JSON.stringify(v));
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
export async function showNotification(title, { body = '', url = '/', tag } = {}) {
  if (notificationPermission() !== 'granted') return false;
  const options = { body, tag, icon: '/icons/icon-192.png', badge: '/icons/icon-96.png', data: { url }, lang: 'pl' };
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
export function sentToday(kind, day) {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY) || '{}')[kind] === day;
  } catch {
    return false;
  }
}
export function markSent(kind, day) {
  try {
    const v = JSON.parse(localStorage.getItem(SENT_KEY) || '{}');
    localStorage.setItem(SENT_KEY, JSON.stringify({ ...v, [kind]: day }));
  } catch {
    // brak localStorage
  }
}
