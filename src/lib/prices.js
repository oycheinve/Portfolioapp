// Moduł notowań: Yahoo Finance (GPW .WA, ETF-y z giełd zagranicznych) + kursy walut NBP.
// Trasy do Yahoo (serwer aplikacji → proxy z ustawień → publiczne proxy CORS) w yahooFetch.js.
// Gdy Yahoo jest niedostępne: ostatnie znane notowanie albo cena z transakcji (bez losowych danych); źródło kursów w toaście i konsoli.
import { fetchYahooData, mapLimited, normalizeYahooSymbol, resetYahooCooldowns, yahooSymbolFor } from './yahooFetch.js';

const TIMEOUT_MS = 7000;
const FX_CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF'];

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

// Ścieżka identyczna z zapytaniem do Yahoo; świeżość zapewnia znacznik czasu w adresie trasy (yahooFetch.js)
function yahooChartPath(symbol) {
  return `/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
}

const warsawDay = (d) => new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
const dayOf = (sec, gmtoffset) => Math.floor((sec + gmtoffset) / 86400);

function parseYahooChart(json) {
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('Brak danych w odpowiedzi Yahoo');
  const meta = result.meta || {};
  const rawCloses = result.indicators?.quote?.[0]?.close || [];
  const ts = result.timestamp || [];
  // Pary (data, zamknięcie) bez pustych świec (close === null)
  const candles = ts.length === rawCloses.length ? ts.map((t, i) => [t, rawCloses[i]]).filter(([, c]) => Number.isFinite(c)) : [];
  const closes = rawCloses.filter((c) => Number.isFinite(c));
  const num = (v) => (Number.isFinite(v) ? v : null);
  // Cena bieżąca: regularMarketPrice (albo fulldayPrice), w ostateczności ostatnie niepuste zamknięcie
  const price = num(meta.regularMarketPrice) ?? num(meta.fulldayPrice) ?? closes[closes.length - 1];
  // Zamknięcie poprzedniej sesji – kolejno:
  // 1) gotowa zmiana z meta (regularMarketChange / fulldayChange, albo procent) → prevClose = cena − zmiana;
  // 2) świece: ostatnia niepusta świeca z dnia wcześniejszego niż dzień ostatniej transakcji (czas giełdy);
  // 3) meta.previousClose. Nigdy meta.chartPreviousClose – przy range=5d to kurs sprzed całego zakresu, nie z wczoraj.
  let prevClose = null;
  const change = num(meta.regularMarketChange) ?? num(meta.fulldayChange);
  const changePct = num(meta.regularMarketChangePercent) ?? num(meta.fulldayChangePercent);
  if (Number.isFinite(price) && change !== null) prevClose = price - change;
  else if (Number.isFinite(price) && changePct !== null && changePct > -100) prevClose = price / (1 + changePct / 100);
  if (!(prevClose > 0) && candles.length) {
    const gmt = Number(meta.gmtoffset) || 0;
    const marketDay = dayOf(num(meta.regularMarketTime) ?? candles[candles.length - 1][0], gmt);
    const prev = candles.filter(([t]) => dayOf(t, gmt) < marketDay).pop();
    if (prev) prevClose = prev[1];
  }
  if (!(prevClose > 0)) prevClose = num(meta.previousClose) ?? price;
  if (!Number.isFinite(price)) throw new Error('Nieprawidłowa cena');
  let currency = meta.currency || null;
  let p = price;
  let pc = prevClose;
  // Notowania z Londynu bywają w pensach (GBp)
  if (currency === 'GBp' || currency === 'GBX') {
    currency = 'GBP';
    p /= 100;
    pc /= 100;
  }
  return { price: p, prevClose: pc, currency, marketTime: meta.regularMarketTime ? meta.regularMarketTime * 1000 : null };
}

export async function fetchYahooQuote(symbol, corsProxy) {
  const { json, via } = await fetchYahooData(yahooChartPath(normalizeYahooSymbol(symbol)), { corsProxy, validate: parseYahooChart });
  // Serwer aplikacji podaje zapasowo notowanie ze Stooq (gdy Yahoo odrzuca zapytania) – w tym samym formacie
  const provider = json?.chart?.result?.[0]?.meta?.dataSource === 'Stooq' ? 'Stooq' : 'Yahoo';
  return { ...parseYahooChart(json), source: `${provider} (${via})` };
}

// Kursy średnie NBP (tabela A) – API NBP obsługuje CORS
export async function fetchNbpRates() {
  const json = await fetchJson('https://api.nbp.pl/api/exchangerates/tables/A/?format=json');
  const table = json?.[0];
  if (!table?.rates) throw new Error('Brak tabeli NBP');
  const rates = { PLN: 1 };
  for (const r of table.rates) {
    if (FX_CURRENCIES.includes(r.code)) rates[r.code] = r.mid;
  }
  return { rates, source: `NBP tabela ${table.no} (${table.effectiveDate})` };
}

async function fetchYahooFx(corsProxy) {
  const rates = { PLN: 1 };
  for (const c of FX_CURRENCIES) {
    const q = await fetchYahooQuote(`${c}PLN=X`, corsProxy);
    rates[c] = q.price;
  }
  return { rates, source: 'Yahoo FX' };
}

// Deterministyczny-ish błądzenie losowe dla trybu offline
function mockStep(prev) {
  const change = (Math.random() - 0.5) * 0.04; // ±2%
  return prev * (1 + change);
}

export function mockQuote(instrument, previous) {
  const base = previous?.price || instrument.mockPrice || 100;
  const price = mockStep(base);
  return {
    price: Math.round(price * 100) / 100,
    prevClose: base,
    currency: instrument.currency,
    source: 'Mock (symulacja)',
  };
}

export function mockFx(previous) {
  const base = previous?.rates || { PLN: 1, USD: 3.65, EUR: 4.25, GBP: 4.88, CHF: 4.55 };
  const rates = { PLN: 1 };
  for (const c of FX_CURRENCIES) {
    rates[c] = Math.round((base[c] || 1) * (1 + (Math.random() - 0.5) * 0.004) * 10000) / 10000;
  }
  return { rates, source: 'Mock (symulacja)' };
}

const DEFAULT_FX = { PLN: 1, USD: 3.65, EUR: 4.25, GBP: 4.88, CHF: 4.55 };

function isRealQuote(q) {
  return q && Number.isFinite(q.price) && q.source && !/mock|symul|rekonstr/i.test(q.source);
}

// Cena z transakcji: ostatnia cena zakupu/sprzedaży instrumentu, a w razie braku – cena zapisana w instrumencie
function reconstructedPrice(instrument, trades) {
  let last = null;
  for (const t of trades) {
    if (t.instrumentId !== instrument.id || !(Number(t.price) > 0)) continue;
    if (!last || t.date > last.date) last = t;
  }
  if (last) return Number(last.price);
  const manual = Number(instrument.mockPrice);
  return manual > 0 ? manual : null;
}

// Główna funkcja odświeżania: zwraca nowe notowania + kursy + dziennik zdarzeń.
// mode: 'auto' (Yahoo/NBP, a przy braku sieci ostatnie znane dane lub ceny z transakcji) | 'mock' (wyłącznie symulacja)
export async function refreshAllPrices({ instruments, previous, corsProxy, mode = 'auto', trades = [] }) {
  const log = [];
  const now = new Date().toISOString();
  if (mode !== 'mock') resetYahooCooldowns();
  const quotes = {};
  let liveCount = 0;
  let fallbackCount = 0;
  const routesUsed = new Set();
  const failures = [];

  let fx;
  if (mode === 'mock') {
    fx = mockFx(previous?.fx);
  } else {
    try {
      fx = await fetchNbpRates();
    } catch (e) {
      log.push({ level: 'info', message: `NBP niedostępne (${e.message}) – próba Yahoo FX` });
      try {
        fx = await fetchYahooFx(corsProxy);
      } catch {
        // Ostatnie znane kursy (bez losowania); przy pierwszym uruchomieniu – kursy domyślne
        const prev = previous?.fx;
        fx = prev?.rates && prev.source && !/mock/i.test(prev.source) ? { rates: prev.rates, source: `${prev.source.replace(/ \(ostatnie znane\)$/, '')} (ostatnie znane)` } : { rates: { ...DEFAULT_FX, ...(prev?.rates || {}) }, source: 'kursy domyślne' };
        log.push({ level: 'info', message: 'Kursy walut z ostatnich znanych danych' });
      }
    }
  }
  fx = { ...fx, updatedAt: now };

  await mapLimited(instruments, 4, async (inst) => {
    const prev = previous?.quotes?.[inst.id];
    if (mode === 'mock') {
      quotes[inst.id] = { ...mockQuote(inst, prev), updatedAt: now };
      fallbackCount += 1;
      return;
    }
    const symbol = yahooSymbolFor(inst);
    if (symbol) {
      try {
        const q = await fetchYahooQuote(symbol, corsProxy);
        quotes[inst.id] = { ...q, currency: q.currency || inst.currency, updatedAt: now };
        routesUsed.add(q.source.replace(/^(\w+) \((.*)\)$/, (_, p, r) => (p === 'Yahoo' ? r : `${r} · ${p}`)));
        liveCount += 1;
        return;
      } catch (e) {
        log.push({ level: 'info', message: `${inst.ticker} (${symbol}): ${e.message}` });
        failures.push({ ticker: inst.ticker, symbol, error: e.message });
      }
    }
    fallbackCount += 1;
    if (isRealQuote(prev)) {
      // Ostatnie znane notowanie z zachowaniem daty pobrania; zmiana dzienna tylko, gdy pobrano je dziś
      const sameDay = !!prev.updatedAt && warsawDay(prev.updatedAt) === warsawDay(Date.now());
      quotes[inst.id] = { ...prev, prevClose: sameDay && prev.prevClose > 0 ? prev.prevClose : prev.price, stale: true, source: `${prev.source.replace(/ \(ostatnie znane\)$/, '')} (ostatnie znane)` };
      return;
    }
    const price = reconstructedPrice(inst, trades);
    if (price) quotes[inst.id] = { price, prevClose: price, currency: inst.currency, source: 'Rekonstrukcja z transakcji', updatedAt: now };
  });

  const status = mode === 'mock' ? 'mock' : liveCount > 0 && fallbackCount === 0 ? 'live' : liveCount > 0 ? 'partial' : 'offline';
  log.unshift({
    level: status === 'live' ? 'info' : 'warn',
    message:
      status === 'live'
        ? `Pobrano ${liveCount} notowań na żywo`
        : status === 'partial'
          ? `Na żywo: ${liveCount}, z ostatnich danych: ${fallbackCount}`
          : status === 'mock'
            ? `Dane symulowane (${fallbackCount})`
            : 'Yahoo Finance niedostępne – ceny z ostatnich danych i transakcji',
  });

  // Diagnostyka w konsoli: skąd ceny i dlaczego część nie przyszła na żywo
  if (mode !== 'mock' && typeof console !== 'undefined') {
    if (failures.length) {
      console.warn(`[Kursy] Yahoo Finance: ${liveCount} na żywo, ${fallbackCount} z danych awaryjnych (ostatnie znane / transakcje).`, failures);
    } else {
      console.info(`[Kursy] Yahoo Finance: ${liveCount} notowań na żywo · trasa: ${[...routesUsed].join(', ') || '—'} · kursy walut: ${fx.source}`);
    }
  }

  return { quotes, fx, status, lastRefresh: now, log: log.slice(0, 30), routes: [...routesUsed], live: liveCount, fallback: fallbackCount, failures: failures.slice(0, 5) };
}

// Etap 3: historia notowań (tygodniowa 5 lat + dzienna 2 lata). adjusted – kurs skorygowany o dywidendy (benchmarki);
// instrumenty portfela – zwykłe zamknięcie (dywidendy są w wycenie jako gotówka, korekta liczyłaby je podwójnie).
// Daty w czasie giełdy; puste świece (null) pomijane. Świeca tygodniowa datowana na ostatni dzień tygodnia
// (Yahoo podaje poniedziałek z zamknięciem piątku – bez tego wycena na środek tygodnia brała kurs z przyszłości).
function parseYahooHistory(json, { adjusted = true, interval = '1wk' } = {}) {
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('Brak danych historycznych');
  const ts = result.timestamp || [];
  const adj = adjusted ? result.indicators?.adjclose?.[0]?.adjclose : null;
  const gmt = Number(result.meta?.gmtoffset) || 0;
  const todayIso = new Date().toISOString().slice(0, 10);
  const close = result.indicators?.quote?.[0]?.close || [];
  let currency = result.meta?.currency || null;
  const divisor = currency === 'GBp' || currency === 'GBX' ? 100 : 1;
  if (divisor === 100) currency = 'GBP';
  const points = [];
  for (let i = 0; i < ts.length; i += 1) {
    const v = Number.isFinite(adj?.[i]) ? adj[i] : close[i];
    if (!Number.isFinite(v)) continue;
    const d = new Date((ts[i] + gmt + (interval === '1wk' ? 4 * 86400 : 0)) * 1000);
    let iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    if (iso > todayIso) iso = todayIso;
    if (points.length && points[points.length - 1][0] === iso) points[points.length - 1][1] = v / divisor;
    else points.push([iso, v / divisor]);
  }
  if (points.length < 2) throw new Error('Za mało punktów historii');
  return { points, currency };
}

export async function fetchYahooHistory(symbol, corsProxy, { range = '5y', interval = '1wk', adjusted = true } = {}) {
  const path = `/v8/finance/chart/${encodeURIComponent(normalizeYahooSymbol(symbol))}?range=${range}&interval=${interval}&events=div`;
  const opts = { adjusted, interval };
  const { json, via } = await fetchYahooData(path, { corsProxy, validate: (j) => parseYahooHistory(j, opts) });
  return { ...parseYahooHistory(json, opts), source: `Yahoo (${via})` };
}

// Historia dywidend z Yahoo Finance (dzień dywidendy = data zdarzenia, kwota na akcję w walucie notowań)
function parseYahooDividends(json) {
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('Brak danych');
  let currency = result.meta?.currency || null;
  const divisor = currency === 'GBp' || currency === 'GBX' ? 100 : 1;
  if (divisor === 100) currency = 'GBP';
  const events = Object.values(result.events?.dividends || {})
    .map((d) => {
      const dt = new Date(d.date * 1000);
      return {
        exDate: `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`,
        amount: d.amount / divisor,
      };
    })
    .sort((a, b) => (a.exDate < b.exDate ? -1 : 1));
  return { events, currency };
}

export async function fetchYahooDividends(symbol, corsProxy) {
  const path = `/v8/finance/chart/${encodeURIComponent(normalizeYahooSymbol(symbol))}?range=5y&interval=1mo&events=div`;
  const { json, via } = await fetchYahooData(path, { corsProxy, validate: parseYahooDividends });
  return { ...parseYahooDividends(json), source: `Yahoo (${via})` };
}
