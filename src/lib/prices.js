// Moduł notowań: Yahoo Finance (GPW .WA, ETF-y z giełd zagranicznych) + kursy walut NBP,
// z łańcuchem awaryjnym: proxy deweloperskie -> zewnętrzne proxy CORS -> dane mockowane.

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

function yahooChartPath(symbol) {
  return `/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
}

function buildYahooUrls(symbol, corsProxy) {
  const path = yahooChartPath(symbol);
  const urls = [{ url: `/api/yahoo${path}`, via: 'proxy lokalne' }];
  if (corsProxy) {
    const full = `https://query1.finance.yahoo.com${path}`;
    const url = corsProxy.includes('{url}')
      ? corsProxy.replace('{url}', encodeURIComponent(full))
      : `${corsProxy}${encodeURIComponent(full)}`;
    urls.push({ url, via: 'proxy CORS' });
  }
  return urls;
}

function parseYahooChart(json) {
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('Brak danych w odpowiedzi Yahoo');
  const meta = result.meta || {};
  const closes = (result.indicators?.quote?.[0]?.close || []).filter((c) => Number.isFinite(c));
  const price = Number.isFinite(meta.regularMarketPrice) ? meta.regularMarketPrice : closes[closes.length - 1];
  let prevClose = null;
  if (closes.length >= 2) {
    const last = closes[closes.length - 1];
    prevClose = Math.abs(last - price) / price < 1e-6 ? closes[closes.length - 2] : last;
  }
  if (!Number.isFinite(prevClose)) prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
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
  const errors = [];
  for (const { url, via } of buildYahooUrls(symbol, corsProxy)) {
    try {
      const json = await fetchJson(url);
      return { ...parseYahooChart(json), source: `Yahoo (${via})` };
    } catch (e) {
      errors.push(`${via}: ${e.message}`);
    }
  }
  throw new Error(errors.join('; '));
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

// Główna funkcja odświeżania: zwraca nowe notowania + kursy + dziennik zdarzeń.
// mode: 'auto' (live z fallbackiem do mock) | 'mock' (wyłącznie symulacja)
export async function refreshAllPrices({ instruments, previous, corsProxy, mode = 'auto' }) {
  const log = [];
  const now = new Date().toISOString();
  const quotes = {};
  let liveCount = 0;
  let mockCount = 0;

  let fx;
  if (mode === 'mock') {
    fx = mockFx(previous?.fx);
  } else {
    try {
      fx = await fetchNbpRates();
    } catch (e) {
      log.push({ level: 'warn', message: `NBP niedostępne (${e.message}) – próba Yahoo FX` });
      try {
        fx = await fetchYahooFx(corsProxy);
      } catch (e2) {
        log.push({ level: 'warn', message: `Yahoo FX niedostępne – kursy symulowane` });
        fx = mockFx(previous?.fx);
      }
    }
  }
  fx = { ...fx, updatedAt: now };

  const tasks = instruments.map(async (inst) => {
    const prev = previous?.quotes?.[inst.id];
    if (mode !== 'mock' && inst.yahooSymbol) {
      try {
        const q = await fetchYahooQuote(inst.yahooSymbol, corsProxy);
        quotes[inst.id] = { ...q, currency: q.currency || inst.currency, updatedAt: now };
        liveCount += 1;
        return;
      } catch (e) {
        log.push({ level: 'warn', message: `${inst.ticker}: ${e.message}` });
      }
    }
    quotes[inst.id] = { ...mockQuote(inst, prev), updatedAt: now };
    mockCount += 1;
  });
  await Promise.all(tasks);

  const status = liveCount > 0 && mockCount === 0 ? 'live' : liveCount > 0 ? 'partial' : 'mock';
  log.unshift({
    level: status === 'live' ? 'info' : 'warn',
    message:
      status === 'live'
        ? `Pobrano ${liveCount} notowań na żywo`
        : status === 'partial'
          ? `Na żywo: ${liveCount}, symulowane: ${mockCount}`
          : `Brak dostępu do Yahoo Finance – użyto danych symulowanych (${mockCount})`,
  });

  return { quotes, fx, status, lastRefresh: now, log: log.slice(0, 30) };
}
