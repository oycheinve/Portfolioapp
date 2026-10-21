// Pobieranie danych z Yahoo Finance mimo blokady CORS przeglądarki.
// Kolejność tras: 1) własny endpoint aplikacji /api/yahoo (Vercel Function w produkcji, middleware Vite lokalnie),
// 2) proxy wpisane w ustawieniach, 3) publiczne proxy CORS (corsproxy.io, allorigins, codetabs).
// Ostatnio działająca trasa jest zapamiętywana i próbowana jako pierwsza; trasy, które zawiodły, odpoczywają kilka minut.

const TIMEOUT_MS = 8000;
const COOLDOWN_MS = 5 * 60 * 1000;
const PREFERRED_KEY = 'wealth-app-yahoo-route';
const YAHOO_HOST = 'https://query1.finance.yahoo.com';

export const PUBLIC_PROXIES = [
  { id: 'corsproxy', label: 'corsproxy.io', wrap: (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}` },
  { id: 'allorigins', label: 'allorigins', wrap: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` },
  { id: 'codetabs', label: 'codetabs', wrap: (url) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}` },
];

const failedAt = {};

function readPreferred() {
  try {
    return localStorage.getItem(PREFERRED_KEY);
  } catch {
    return null;
  }
}

function savePreferred(id) {
  try {
    localStorage.setItem(PREFERRED_KEY, id);
  } catch {
    // brak localStorage – trasa nie zostanie zapamiętana
  }
}

function customRoute(corsProxy) {
  const value = String(corsProxy || '').trim();
  if (!value) return null;
  // Domyślny wpis z poprzednich wersji (corsproxy.io) jest już na liście publicznych proxy
  if (/corsproxy\.io/i.test(value)) return null;
  return {
    id: `custom:${value}`,
    label: 'proxy z ustawień',
    wrap: (url) => (value.includes('{url}') ? value.replace('{url}', encodeURIComponent(url)) : `${value}${encodeURIComponent(url)}`),
  };
}

function routes(corsProxy, ignoreCooldown = false) {
  const list = [{ id: 'app', label: 'serwer aplikacji', wrap: (_url, path) => `/api/yahoo?path=${encodeURIComponent(path)}` }];
  const custom = customRoute(corsProxy);
  if (custom) list.push(custom);
  list.push(...PUBLIC_PROXIES);
  const preferred = readPreferred();
  const now = Date.now();
  return list
    .filter((r) => ignoreCooldown || !(failedAt[r.id] && now - failedAt[r.id] < COOLDOWN_MS))
    .sort((a, b) => (a.id === preferred ? -1 : b.id === preferred ? 1 : 0));
}

async function fetchJsonWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    // Hosting SPA może zwrócić index.html zamiast JSON – traktujemy to jako błąd trasy
    if (!/^\s*[[{]/.test(text)) throw new Error('odpowiedź nie jest JSON');
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

// Ścieżka API Yahoo (np. /v8/finance/chart/PKO.WA?range=5d&interval=1d) → JSON; validate(json) rzuca, gdy dane są niepełne
export async function fetchYahooJson(path, { corsProxy, validate } = {}) {
  const full = `${YAHOO_HOST}${path}`;
  const errors = [];
  const list = routes(corsProxy);
  // Wszystkie trasy chwilowo „odpoczywają” – spróbuj ponownie każdej
  const tryList = list.length ? list : routes(corsProxy, true);
  for (const route of tryList) {
    try {
      const json = await fetchJsonWithTimeout(route.wrap(full, path));
      if (validate) validate(json);
      savePreferred(route.id);
      delete failedAt[route.id];
      return { json, via: route.label };
    } catch (e) {
      // Brak danych dla symbolu (np. błędny ticker) nie oznacza awarii trasy
      if (!/Brak danych|Nieprawidłow|Za mało/.test(e.message)) failedAt[route.id] = Date.now();
      errors.push(`${route.label}: ${e.name === 'AbortError' ? 'przekroczony czas' : e.message}`);
      if (/Brak danych|Nieprawidłow|Za mało/.test(e.message)) break;
    }
  }
  throw new Error(errors.join('; ') || 'brak dostępnych tras');
}

// Symbole Yahoo: GPW .WA, Xetra .DE, Londyn .L, USA bez końcówki. Zamienia też końcówki XTB (.PL, .UK, .US…).
const XTB_SUFFIX = { PL: 'WA', UK: 'L', US: '', NL: 'AS', FR: 'PA', IT: 'MI', ES: 'MC', BE: 'BR', PT: 'LS', FI: 'HE', IE: 'IR', CH: 'SW', DK: 'CO', SE: 'ST', NO: 'OL', AT: 'VI', CZ: 'PR' };

export function normalizeYahooSymbol(symbol) {
  const s = String(symbol || '').trim().toUpperCase();
  if (!s || s.startsWith('^') || s.endsWith('=X') || s.endsWith('=F')) return s;
  const dot = s.lastIndexOf('.');
  if (dot <= 0) return s;
  const base = s.slice(0, dot);
  const suffix = s.slice(dot + 1);
  if (suffix in XTB_SUFFIX) return XTB_SUFFIX[suffix] ? `${base}.${XTB_SUFFIX[suffix]}` : base;
  return s;
}

// Symbol Yahoo dla instrumentu: zapisany symbol (znormalizowany) albo ticker + .WA dla instrumentów w PLN
export function yahooSymbolFor(instrument) {
  if (instrument?.yahooSymbol) return normalizeYahooSymbol(instrument.yahooSymbol);
  const ticker = String(instrument?.ticker || '').trim().toUpperCase();
  if (!ticker) return null;
  return (instrument.currency || 'PLN') === 'PLN' ? `${ticker}.WA` : ticker;
}

// Ograniczenie równoległości – publiczne proxy źle znoszą kilkadziesiąt jednoczesnych zapytań
export async function mapLimited(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
