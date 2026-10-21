// Etap 3: historia cen – pobieranie z Yahoo Finance oraz rozwiązywanie cen historycznych
// z łańcuchem awaryjnym: historia Yahoo → rekonstrukcja z transakcji (interpolacja geometryczna) → kurs bieżący.
import { BENCHMARKS, FX_HISTORY_SYMBOLS } from './constants.js';
import { fetchYahooHistory } from './prices.js';
import { fxToPLN, isoDay } from './engine.js';
import { getCpiTable } from './bonds.js';

const DAY = 86400000;

function toTime(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

// Ostatni punkt ≤ data (punkty posortowane rosnąco); przed pierwszym punktem – pierwszy punkt
function closeAt(points, iso) {
  if (!points?.length) return null;
  if (iso <= points[0][0]) return points[0][1];
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (points[mid][0] <= iso) lo = mid;
    else hi = mid - 1;
  }
  return points[lo][1];
}

// Interpolacja geometryczna między punktami kotwiczącymi
function interpolate(anchors, iso) {
  if (!anchors.length) return null;
  if (iso <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (iso >= last[0]) return last[1];
  for (let i = 1; i < anchors.length; i += 1) {
    if (anchors[i][0] >= iso) {
      const [d0, p0] = anchors[i - 1];
      const [d1, p1] = anchors[i];
      const t = (toTime(iso) - toTime(d0)) / Math.max(1, toTime(d1) - toTime(d0));
      return p0 > 0 && p1 > 0 ? p0 * Math.pow(p1 / p0, t) : p0 + (p1 - p0) * t;
    }
  }
  return last[1];
}

export function historySymbols(state) {
  const symbols = new Set();
  for (const inst of state.instruments) if (inst.yahooSymbol) symbols.add(inst.yahooSymbol);
  for (const b of Object.values(BENCHMARKS)) if (b.yahooSymbol) symbols.add(b.yahooSymbol);
  const currencies = new Set([...state.instruments.map((i) => i.currency), 'USD', 'EUR']);
  for (const c of currencies) if (FX_HISTORY_SYMBOLS[c]) symbols.add(FX_HISTORY_SYMBOLS[c]);
  return [...symbols];
}

export async function fetchAllHistory(state) {
  const symbols = historySymbols(state);
  const series = {};
  const log = [];
  const now = new Date().toISOString();
  await Promise.all(
    symbols.map(async (sym) => {
      try {
        const h = await fetchYahooHistory(sym, state.settings.corsProxy);
        series[sym] = { ...h, updatedAt: now };
      } catch (e) {
        log.push({ level: 'warn', message: `${sym}: ${e.message}` });
      }
    }),
  );
  const ok = Object.keys(series).length;
  const status = ok === symbols.length ? 'live' : ok > 0 ? 'partial' : 'offline';
  log.unshift({
    level: status === 'live' ? 'info' : 'warn',
    message:
      status === 'offline'
        ? 'Historia Yahoo niedostępna – wykresy korzystają z rekonstrukcji z transakcji'
        : `Pobrano historię ${ok}/${symbols.length} symboli`,
  });
  return { series, status, updatedAt: now, log: log.slice(0, 40) };
}

// Indeks CPI (miesięczny łańcuch z odczytów r/r: (1 + r/r)^(1/12) na miesiąc)
function buildCpiIndex(settings) {
  const table = getCpiTable(settings);
  const keys = Object.keys(table).sort();
  if (!keys.length) return () => 1;
  const index = {};
  let level = 1;
  for (const k of keys) {
    index[k] = level;
    level *= Math.pow(1 + table[k].value / 100, 1 / 12);
  }
  const lastKey = keys[keys.length - 1];
  const lastMonthly = Math.pow(1 + table[lastKey].value / 100, 1 / 12);
  const lastLevel = level;
  return (iso) => {
    const key = iso.slice(0, 7);
    const day = Number(iso.slice(8, 10));
    const frac = (day - 1) / 30;
    if (index[key] !== undefined) {
      const next = keys[keys.indexOf(key) + 1];
      const nextLevel = next ? index[next] : lastLevel;
      return index[key] * Math.pow(nextLevel / index[key], frac);
    }
    if (key < keys[0]) return 1;
    // po ostatnim odczycie – kontynuacja ostatniej dynamiki
    const [y, m] = key.split('-').map(Number);
    const [ly, lm] = lastKey.split('-').map(Number);
    const months = (y - ly) * 12 + (m - lm) - 1 + frac;
    return lastLevel * Math.pow(lastMonthly, Math.max(0, months));
  };
}

// Resolver cen historycznych (PLN) dla instrumentów i benchmarków
export function createPriceResolver(state) {
  const today = isoDay(new Date());
  const series = state.priceHistory?.series || {};
  const fx = state.prices?.fx;
  const quotes = state.prices?.quotes || {};
  const cache = new Map();
  const sources = {};

  const fxAt = (currency, iso) => {
    if (!currency || currency === 'PLN') return 1;
    if (iso >= today) return fxToPLN(fx, currency);
    const s = series[FX_HISTORY_SYMBOLS[currency]];
    const v = s ? closeAt(s.points, iso) : null;
    return Number.isFinite(v) && v > 0 ? v : fxToPLN(fx, currency);
  };

  const anchorsFor = (inst) => {
    if (cache.has(inst.id)) return cache.get(inst.id);
    const anchors = state.trades
      .filter((t) => t.instrumentId === inst.id && Number(t.price) > 0)
      .map((t) => [t.date, Number(t.price) * (Number(t.fxRate) || 1)])
      .sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const q = quotes[inst.id];
    const nowPrice = q && Number.isFinite(q.price) ? q.price * fxToPLN(fx, q.currency || inst.currency) : null;
    if (nowPrice) anchors.push([today, nowPrice]);
    // uśrednienie wielu transakcji z tego samego dnia
    const merged = [];
    for (const a of anchors) {
      const last = merged[merged.length - 1];
      if (last && last[0] === a[0]) last[1] = (last[1] + a[1]) / 2;
      else merged.push([...a]);
    }
    cache.set(inst.id, merged);
    return merged;
  };

  // Etap 5: ceny zapisane w migawkach dziennych (ostatnia migawka ≤ data, maks. 10 dni wcześniej)
  const snapPrices = new Map();
  for (const sn of state.snapshots || []) {
    for (const [id, price] of Object.entries(sn.prices || {})) {
      if (!snapPrices.has(id)) snapPrices.set(id, []);
      snapPrices.get(id).push([sn.date, price]);
    }
  }
  const snapshotPriceAt = (id, iso) => {
    const pts = snapPrices.get(id);
    if (!pts?.length || iso < pts[0][0]) return null;
    let lo = 0;
    let hi = pts.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (pts[mid][0] <= iso) lo = mid;
      else hi = mid - 1;
    }
    const [d, p] = pts[lo];
    return (toTime(iso) - toTime(d)) / DAY <= 10 ? p : null;
  };

  const instrumentPLN = (inst, iso) => {
    if (!inst) return null;
    const q = quotes[inst.id];
    if (iso >= today && q && Number.isFinite(q.price)) {
      return q.price * fxToPLN(fx, q.currency || inst.currency);
    }
    const s = inst.yahooSymbol ? series[inst.yahooSymbol] : null;
    if (s && s.points?.length && iso >= s.points[0][0]) {
      sources[inst.id] = 'yahoo';
      return closeAt(s.points, iso) * fxAt(s.currency || inst.currency, iso);
    }
    const snap = snapshotPriceAt(inst.id, iso);
    if (snap !== null) {
      sources[inst.id] = sources[inst.id] === 'reconstructed' ? 'reconstructed' : 'snapshots';
      return snap;
    }
    sources[inst.id] = 'reconstructed';
    return interpolate(anchorsFor(inst), iso);
  };

  const cpiIndex = buildCpiIndex(state.settings);

  // Benchmark: historia Yahoo → instrument-proxy z portfela → brak
  const benchmarkInfo = {};
  for (const b of Object.values(BENCHMARKS)) {
    if (b.id === 'CPI') {
      benchmarkInfo[b.id] = { available: true, source: 'Tabela CPI (GUS)' };
      continue;
    }
    const s = b.yahooSymbol ? series[b.yahooSymbol] : null;
    if (s?.points?.length) {
      benchmarkInfo[b.id] = { available: true, source: s.source || 'Yahoo' };
      continue;
    }
    const proxy = state.instruments.find((i) => b.proxySymbols.includes(i.yahooSymbol));
    benchmarkInfo[b.id] = proxy
      ? { available: true, source: `przybliżenie: ${proxy.ticker} (rekonstrukcja)`, proxy }
      : { available: false, source: 'brak danych – pobierz historię' };
  }

  const benchmarkPLN = (id, iso) => {
    const b = BENCHMARKS[id];
    const info = benchmarkInfo[id];
    if (!b || !info?.available) return null;
    if (id === 'CPI') return cpiIndex(iso);
    const s = b.yahooSymbol ? series[b.yahooSymbol] : null;
    if (s?.points?.length) return closeAt(s.points, iso) * fxAt(s.currency || b.currency, iso);
    return instrumentPLN(info.proxy, iso);
  };

  return { instrumentPLN, benchmarkPLN, benchmarkInfo, sources, fxAt, today };
}

export function historyAgeDays(state) {
  const u = state.priceHistory?.updatedAt;
  if (!u) return Infinity;
  return (Date.now() - new Date(u).getTime()) / DAY;
}
