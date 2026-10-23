// Funkcja serwerowa (Vercel): pośrednik do Yahoo Finance z tej samej domeny co aplikacja – omija blokadę CORS.
// Wywołanie: /api/yahoo?path=/v8/finance/chart/PKO.WA?range=5d&interval=1d
// Dozwolone są wyłącznie zapytania o wykresy (chart) – endpoint nie jest otwartym proxy.
// Kolejność: 1) Yahoo query1/query2 jak przeglądarka, 2) Yahoo z ciasteczkiem i „crumb” (Yahoo coraz częściej odrzuca
// zapytania z serwerów chmurowych bez sesji: 401/403/429), 3) dla bieżących notowań (range=5d, interval=1d) –
// zapasowo Stooq (GPW, Xetra, USA, kursy walut) w formacie odpowiedzi Yahoo. Całość mieści się w limicie funkcji (~9 s).

const ALLOWED_PATH = /^\/v8\/finance\/chart\/[A-Za-z0-9.^=_%-]+(\?[A-Za-z0-9=&._%-]*)?$/;
const HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
  'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8',
};
const BUDGET_MS = 8500;
const SESSION_TTL_MS = 50 * 60 * 1000;

// Sesja Yahoo (ciasteczko + crumb) – trzymana w pamięci ciepłej instancji funkcji
let session = null;

async function timedFetch(url, opts, deadline, maxMs = 4000) {
  const left = deadline - Date.now();
  if (left < 300) throw new Error('przekroczony czas');
  return fetch(url, { cache: 'no-store', ...opts, signal: AbortSignal.timeout(Math.min(maxMs, left)) });
}

async function yahooSession(deadline) {
  if (session && Date.now() - session.at < SESSION_TTL_MS) return session;
  const r = await timedFetch('https://fc.yahoo.com/', { headers: HEADERS, redirect: 'manual' }, deadline, 3000);
  const raw = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [r.headers.get('set-cookie') || ''];
  const cookie = raw
    .map((c) => String(c).split(';')[0])
    .filter((c) => c.includes('='))
    .join('; ');
  if (!cookie) throw new Error('brak ciasteczka Yahoo');
  const c = await timedFetch(`${HOSTS[1]}/v1/test/getcrumb`, { headers: { ...HEADERS, Cookie: cookie } }, deadline, 3000);
  const crumb = (await c.text()).trim();
  if (!c.ok || !crumb || crumb.length > 64 || /[<{\s]/.test(crumb)) throw new Error(`brak crumb (HTTP ${c.status})`);
  session = { cookie, crumb, at: Date.now() };
  return session;
}

// Symbol Yahoo → Stooq (tylko rynki o pewnej walucie i jednostce ceny); null – brak odpowiednika
export function stooqSymbol(yahoo) {
  const s = String(yahoo || '').toUpperCase();
  let m;
  if ((m = s.match(/^([A-Z]{3})([A-Z]{3})=X$/))) return `${m[1]}${m[2]}`.toLowerCase();
  if ((m = s.match(/^([A-Z0-9-]+)\.WA$/))) return m[1].toLowerCase();
  if ((m = s.match(/^([A-Z0-9-]+)\.DE$/))) return `${m[1].toLowerCase()}.de`;
  if ((m = s.match(/^([A-Z][A-Z-]{0,5})$/))) return `${m[1].toLowerCase().replace('-', '.')}.us`;
  return null;
}

const csvRows = (text) =>
  String(text)
    .trim()
    .split(/\r?\n/)
    .map((l) => l.split(','));

// Bieżące notowanie ze Stooq w kształcie odpowiedzi Yahoo chart (świeca poprzedniej sesji + bieżąca)
async function stooqChart(yahooSymbol, deadline) {
  const sym = stooqSymbol(yahooSymbol);
  if (!sym) throw new Error('brak odpowiednika w Stooq');
  const q = await timedFetch(`https://stooq.com/q/l/?s=${encodeURIComponent(sym)}&f=sd2t2ohlcv&h&e=csv`, { headers: HEADERS }, deadline, 3000);
  const rows = csvRows(await q.text());
  const row = rows[1] || [];
  const date = row[1];
  const close = Number(row[6]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !(close > 0)) throw new Error('Stooq: brak notowania');
  const [y, mo, d] = date.split('-').map(Number);
  const dayTs = (yy, mm, dd) => Date.UTC(yy, mm - 1, dd, 10) / 1000;
  const timestamp = [];
  const closes = [];
  // Poprzednie zamknięcie z notowań dziennych (gdy dostępne)
  try {
    const h = await timedFetch(`https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}&i=d`, { headers: HEADERS }, deadline, 2500);
    const hist = csvRows(await h.text()).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r[0]) && r[0] < date && Number(r[4]) > 0);
    const prev = hist[hist.length - 1];
    if (prev) {
      const [py, pm, pd] = prev[0].split('-').map(Number);
      timestamp.push(dayTs(py, pm, pd));
      closes.push(Number(prev[4]));
    }
  } catch {
    // bez historii – zmiana dzienna nieznana (0%)
  }
  timestamp.push(dayTs(y, mo, d));
  closes.push(close);
  const meta = { symbol: yahooSymbol, regularMarketPrice: close, regularMarketTime: dayTs(y, mo, d) + 3600, gmtoffset: 0, dataSource: 'Stooq' };
  if (sym.endsWith('.de')) meta.currency = 'EUR';
  else if (sym.endsWith('.us')) meta.currency = 'USD';
  else if (!sym.includes('.') && sym.length !== 6) meta.currency = 'PLN';
  return JSON.stringify({ chart: { result: [{ meta, timestamp, indicators: { quote: [{ close: closes }] } }], error: null } });
}

export async function proxyYahoo(path) {
  if (!ALLOWED_PATH.test(path || '')) return { status: 400, body: JSON.stringify({ error: 'Niedozwolona ścieżka' }) };
  const deadline = Date.now() + BUDGET_MS;
  const errors = [];
  let last = { status: 502, body: JSON.stringify({ error: 'Brak odpowiedzi Yahoo' }) };
  let blocked = false;
  for (const host of HOSTS) {
    try {
      const res = await timedFetch(`${host}${path}`, { headers: HEADERS }, deadline, 3500);
      const body = await res.text();
      if (res.ok) return { status: 200, body, source: 'yahoo' };
      // 404 / błąd danych (np. nieznany symbol) – inne trasy dadzą to samo
      if (res.status === 404 || res.status === 400) return { status: res.status, body, source: 'yahoo' };
      blocked = blocked || [401, 403, 429].includes(res.status);
      errors.push(`${host.slice(8, 14)}: HTTP ${res.status}`);
      last = { status: res.status, body };
    } catch (e) {
      errors.push(`${host.slice(8, 14)}: ${e.message}`);
      last = { status: 502, body: JSON.stringify({ error: e.message }) };
    }
  }
  // Yahoo z sesją (ciasteczko + crumb) – przy odmowie dostępu lub limicie zapytań
  if (blocked) {
    try {
      const s = await yahooSession(deadline);
      const sep = path.includes('?') ? '&' : '?';
      const res = await timedFetch(`${HOSTS[1]}${path}${sep}crumb=${encodeURIComponent(s.crumb)}`, { headers: { ...HEADERS, Cookie: s.cookie } }, deadline, 3500);
      const body = await res.text();
      if (res.ok) return { status: 200, body, source: 'yahoo-session' };
      if ([401, 403].includes(res.status)) session = null;
      errors.push(`sesja: HTTP ${res.status}`);
    } catch (e) {
      session = null;
      errors.push(`sesja: ${e.message}`);
    }
  }
  // Zapas dla bieżących notowań: Stooq
  const m = path.match(/^\/v8\/finance\/chart\/([^?]+)\?(.*)$/);
  if (m && /(^|&)range=5d(&|$)/.test(m[2]) && /(^|&)interval=1d(&|$)/.test(m[2])) {
    try {
      return { status: 200, body: await stooqChart(decodeURIComponent(m[1]), deadline), source: 'stooq' };
    } catch (e) {
      errors.push(`stooq: ${e.message}`);
    }
  }
  return { ...last, errors };
}

export default async function handler(req, res) {
  const path = typeof req.query?.path === 'string' ? req.query.path : new URL(req.url, 'http://localhost').searchParams.get('path') || '';
  const result = await proxyYahoo(path);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // Notowania muszą być świeże – bez długiego serwowania starej odpowiedzi z pamięci CDN
  res.setHeader('Cache-Control', result.status === 200 ? 's-maxage=15, stale-while-revalidate=15' : 'no-store');
  if (result.source) res.setHeader('X-Quote-Source', result.source);
  if (result.errors?.length) res.setHeader('X-Quote-Errors', result.errors.join('; ').replace(/[^\x20-\x7e]/g, '?').slice(0, 500));
  res.statusCode = result.status;
  res.end(result.body);
}
