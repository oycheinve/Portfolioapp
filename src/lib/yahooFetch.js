// Pobieranie danych z Yahoo Finance mimo blokady CORS przeglądarki.
// Kolejność tras: 1) własny endpoint aplikacji /api/yahoo (Vercel Function w produkcji, middleware Vite lokalnie),
// 2) proxy wpisane w ustawieniach, 3) publiczne proxy CORS (corsproxy.io, allorigins, codetabs).
// Ostatnio działająca trasa jest zapamiętywana i próbowana jako pierwsza; trasy, które zawiodły, odpoczywają chwilę,
// a gdy zawiodą wszystkie – próbowane są ponownie (także druga domena Yahoo: query2). Wynik diagnostyki w konsoli.

const TIMEOUT_MS = 8000;
// Serwer aplikacji sam próbuje dwóch domen Yahoo (po 5 s) – dłuższy limit, by nie odrzucać go przy zimnym starcie
const APP_TIMEOUT_MS = 12000;
const COOLDOWN_MS = 90 * 1000;
const PREFERRED_KEY = 'wealth-app-yahoo-route';
const YAHOO_HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];

// unwrap – proxy zwracające JSON z treścią w polu (np. allorigins /get → { contents })
export const PUBLIC_PROXIES = [
  { id: 'corsproxy', label: 'corsproxy.io', wrap: (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}` },
  { id: 'allorigins', label: 'allorigins', wrap: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` },
  { id: 'codetabs', label: 'codetabs', wrap: (url) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}` },
  { id: 'corslol', label: 'cors.lol', wrap: (url) => `https://api.cors.lol/?url=${encodeURIComponent(url)}` },
  { id: 'thingproxy', label: 'thingproxy', wrap: (url) => `https://thingproxy.freeboard.io/fetch/${url}` },
  { id: 'allorigins-get', label: 'allorigins (get)', wrap: (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, unwrap: (j) => (typeof j?.contents === 'string' ? JSON.parse(j.contents) : j) },
];

const failedAt = {};

// Ręczne / nowe odświeżenie notowań: trasy, które niedawno zawiodły, dostają kolejną szansę od razu
export function resetYahooCooldowns() {
  for (const k of Object.keys(failedAt)) delete failedAt[k];
}

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
  // Serwer aplikacji sam próbuje query1 i query2 – jedna trasa
  // `t` – znacznik czasu poza ścieżką Yahoo: omija pamięć podręczną przeglądarki i CDN, serwer go nie przekazuje dalej
  const list = [{ id: 'app', label: 'serwer aplikacji', wrap: (_url, path) => `/api/yahoo?path=${encodeURIComponent(path)}&t=${Date.now()}`, singleHost: true }];
  const custom = customRoute(corsProxy);
  if (custom) list.push(custom);
  list.push(...PUBLIC_PROXIES);
  const preferred = readPreferred();
  const now = Date.now();
  return list
    .filter((r) => ignoreCooldown || !(failedAt[r.id] && now - failedAt[r.id] < COOLDOWN_MS))
    .sort((a, b) => (a.id === preferred ? -1 : b.id === preferred ? 1 : 0));
}

async function fetchJsonWithTimeout(url, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // no-store: bez odpowiedzi z pamięci podręcznej przeglądarki (stare notowania)
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    // Hosting SPA może zwrócić index.html zamiast JSON – traktujemy to jako błąd trasy
    if (!/^\s*[[{]/.test(text)) throw new Error('odpowiedź nie jest JSON');
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

const DATA_ERROR = /Brak danych|Nieprawidłow|Za mało/;

// Diagnostyka ostatnich zapytań (trasa → wynik) – podgląd w konsoli: window.__yahooDiag
const diag = [];
function report(entry) {
  diag.unshift({ at: new Date().toISOString(), ...entry });
  diag.length = Math.min(diag.length, 50);
  try {
    window.__yahooDiag = diag;
  } catch {
    // poza przeglądarką
  }
}

// Ścieżka API Yahoo (np. /v8/finance/chart/PKO.WA?range=5d&interval=1d) → JSON; validate(json) rzuca, gdy dane są niepełne.
// Kolejno wszystkie dostępne trasy; przy błędzie HTTP danej trasy także druga domena Yahoo (query2). Gdy wszystkie trasy
// zawiodły przed chwilą (odpoczywają) – szybka odpowiedź bez ponownego czekania (dane awaryjne), po przerwie – nowa próba.
export async function fetchYahooData(path, { corsProxy, validate } = {}) {
  const errors = [];
  const list = routes(corsProxy);
  if (!list.length) {
    const msg = 'wszystkie trasy do Yahoo chwilowo niedostępne (sieć zablokowana lub proxy nie odpowiadają)';
    report({ path, ok: false, error: msg });
    throw new Error(msg);
  }
  for (const route of list) {
    for (const host of route.singleHost ? [YAHOO_HOSTS[0]] : YAHOO_HOSTS) {
      try {
        const raw = await fetchJsonWithTimeout(route.wrap(`${host}${path}`, path), route.id === 'app' ? APP_TIMEOUT_MS : TIMEOUT_MS);
        const json = route.unwrap ? route.unwrap(raw) : raw;
        if (validate) validate(json);
        savePreferred(route.id);
        delete failedAt[route.id];
        report({ path, ok: true, via: route.label, host });
        return { json, via: route.label };
      } catch (e) {
        const msg = e.name === 'AbortError' ? 'przekroczony czas' : e.message;
        errors.push(`${route.label}${route.singleHost ? '' : ` (${host.slice(8, 14)})`}: ${msg}`);
        // Brak danych dla symbolu (np. błędny ticker) nie oznacza awarii trasy – kolejne trasy dadzą to samo
        if (DATA_ERROR.test(e.message)) {
          report({ path, ok: false, via: route.label, error: msg });
          throw new Error(errors.join('; '));
        }
        failedAt[route.id] = Date.now();
        // Druga domena Yahoo ma sens tylko przy odpowiedzi HTTP z błędem (np. 401/429), nie przy braku połączenia z proxy
        if (!/^HTTP \d+/.test(e.message)) break;
      }
    }
  }
  report({ path, ok: false, error: errors.join('; ') });
  throw new Error(errors.join('; '));
}


// Symbole Yahoo: GPW .WA, Xetra .DE, Londyn .L, USA bez końcówki. Zamienia też końcówki XTB (.PL, .UK, .US…).
const XTB_SUFFIX = { PL: 'WA', UK: 'L', US: '', DE: 'DE', NL: 'AS', FR: 'PA', IT: 'MI', ES: 'MC', BE: 'BR', PT: 'LS', FI: 'HE', IE: 'IR', CH: 'SW', DK: 'CO', SE: 'ST', NO: 'OL', AT: 'VI', CZ: 'PR' };

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

// Domyślna giełda wg waluty, gdy ticker nie ma końcówki: PLN → GPW (.WA), EUR → Xetra (.DE), GBP → Londyn (.L),
// CHF → SIX (.SW), USD → USA (bez końcówki)
const SUFFIX_BY_CURRENCY = { PLN: '.WA', EUR: '.DE', GBP: '.L', CHF: '.SW', USD: '' };

// Symbol Yahoo dla instrumentu: zapisany symbol (znormalizowany, np. DIG.PL → DIG.WA, CSPX.UK → CSPX.L) albo ticker –
// z końcówką XTB zamienioną na Yahoo lub z końcówką giełdy wg waluty
export function yahooSymbolFor(instrument) {
  if (instrument?.yahooSymbol) return normalizeYahooSymbol(instrument.yahooSymbol);
  const ticker = String(instrument?.ticker || '').trim().toUpperCase();
  if (!ticker) return null;
  if (ticker.includes('.') || ticker.startsWith('^') || ticker.endsWith('=X')) return normalizeYahooSymbol(ticker);
  return `${ticker}${SUFFIX_BY_CURRENCY[instrument.currency || 'PLN'] ?? ''}`;
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
