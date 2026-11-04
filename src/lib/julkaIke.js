// „IKE - Julka” – całkowicie odizolowane konto: systematyczny zakup jednego ETF-u (IE00BK5BQT80, Vanguard FTSE
// All-World UCITS ETF Acc, Xetra VWCE.DE w EUR) za stałą kwotę (domyślnie 100 zł miesięcznie).
// Izolacja: dane NIE są częścią stanu portfela (konta, transakcje, wpłaty) – żyją wyłącznie w osobnym kluczu
// localStorage `wealth-app-ike-julka-v1` (synchronizowanym z Supabase jako ustawienia UI – kolumna ui_prefs,
// nie dane portfela). Żaden moduł główny (Pulpit, Portfel, Wykresy, limity IKE, raporty) go nie czyta.
//
// Wyliczenie zakupu (mechanizm przewalutowania jak na IKE w XTB):
//   prowizja = kwota × % przewalutowania;  kwota w walucie ETF = (kwota − prowizja) / kurs waluty;
//   liczba jednostek = kwota w walucie ETF / cena 1 jednostki (zaokrąglenie do 4 miejsc po przecinku).
import { XTB_FX_FEE_PCT } from './constants.js';
import { fetchYahooHistory, fetchYahooQuote } from './prices.js';

export const JULKA_KEY = 'wealth-app-ike-julka-v1';
export const JULKA_ETF = { isin: 'IE00BK5BQT80', symbol: 'VWCE.DE', ticker: 'VWCE', name: 'Vanguard FTSE All-World UCITS ETF (Acc)', currency: 'EUR', fxSymbol: 'EURPLN=X' };

export const DEFAULT_JULKA = {
  amount: 100,
  fxFeePct: XTB_FX_FEE_PCT,
  autoEnabled: false,
  autoDay: 10,
  autoFrom: null, // pierwszy miesiąc automatycznych zakupów ('RRRR-MM')
  purchases: [],
  lastQuote: null, // { price, fx, at, source }
};

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

export function readJulka() {
  try {
    const v = JSON.parse(localStorage.getItem(JULKA_KEY) || 'null');
    if (!v || typeof v !== 'object') return { ...DEFAULT_JULKA };
    return { ...DEFAULT_JULKA, ...v, purchases: Array.isArray(v.purchases) ? v.purchases : [] };
  } catch {
    return { ...DEFAULT_JULKA };
  }
}

export function writeJulka(data) {
  try {
    const json = JSON.stringify(data);
    if (localStorage.getItem(JULKA_KEY) === json) return;
    localStorage.setItem(JULKA_KEY, json);
    // Synchronizacja ustawień UI z chmurą (to samo zdarzenie co budżet) – osobno od danych portfela
    window.dispatchEvent(new CustomEvent('wealth-app-prefs-changed', { detail: { key: JULKA_KEY } }));
  } catch {
    // brak localStorage
  }
}

// Czysta funkcja: zakup za `amountPLN` przy kursie waluty `fxRate` (PLN za 1 EUR) i cenie ETF `price` (EUR)
export function calcPurchase({ amountPLN, fxRate, price, fxFeePct = XTB_FX_FEE_PCT }) {
  const amount = Number(amountPLN) || 0;
  const fx = Number(fxRate) || 0;
  const px = Number(price) || 0;
  const feePLN = round(amount * ((Number(fxFeePct) || 0) / 100), 4);
  const netPLN = amount - feePLN;
  const amountCcy = fx > 0 ? netPLN / fx : 0;
  const units = px > 0 ? round(amountCcy / px, 4) : 0;
  return { amountPLN: amount, fxRate: fx, fxFeePct: Number(fxFeePct) || 0, feePLN, netPLN: round(netPLN, 4), amountCcy: round(amountCcy, 4), price: px, units };
}

// Podsumowanie: wpłacono, jednostki, wartość po bieżącym kursie ETF i waluty, zysk/strata
export function julkaSummary(purchases, quote) {
  const deposited = purchases.reduce((s, p) => s + (Number(p.amountPLN) || 0), 0);
  const units = round(purchases.reduce((s, p) => s + (Number(p.units) || 0), 0), 4);
  const fees = purchases.reduce((s, p) => s + (Number(p.feePLN) || 0), 0);
  const price = Number(quote?.price) || 0;
  const fx = Number(quote?.fx) || 0;
  const value = price > 0 && fx > 0 ? units * price * fx : null;
  const pl = value === null ? null : value - deposited;
  return { deposited, units, fees, value, pl, plPct: value !== null && deposited > 0 ? pl / deposited : null, avgPricePLN: units > 0 ? deposited / units : null };
}

// Daty zaległych zakupów automatycznych: wybrany dzień każdego miesiąca od `autoFrom` do dziś, bez zakupu w tym miesiącu
export function dueAutoDates(data, today) {
  if (!data.autoEnabled || !data.autoFrom) return [];
  const day = Math.min(28, Math.max(1, Number(data.autoDay) || 1));
  const months = new Set(data.purchases.map((p) => p.date.slice(0, 7)));
  const out = [];
  let [y, m] = data.autoFrom.split('-').map(Number);
  for (let guard = 0; guard < 240; guard += 1) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const date = `${key}-${String(day).padStart(2, '0')}`;
    if (date > today) break;
    if (!months.has(key)) out.push(date);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

// Zamknięcie z dnia (ostatnia sesja ≤ data) z dziennej historii punktów [[RRRR-MM-DD, close], …]
export function closeOnOrBefore(points, iso) {
  let best = null;
  for (const [d, c] of points || []) {
    if (d <= iso && Number.isFinite(c)) best = [d, c];
    else if (d > iso) break;
  }
  return best;
}

const historyCache = new Map();
async function dailyHistory(symbol, date) {
  const ageDays = (Date.now() - new Date(`${date}T12:00:00`).getTime()) / 86400000;
  const range = ageDays < 80 ? '3mo' : ageDays < 350 ? '1y' : ageDays < 1800 ? '5y' : 'max';
  const key = `${symbol}|${range}`;
  if (!historyCache.has(key)) historyCache.set(key, fetchYahooHistory(symbol, undefined, { range, interval: '1d', adjusted: false }).catch((e) => (historyCache.delete(key), Promise.reject(e))));
  return historyCache.get(key);
}

// Cena ETF (EUR) i kurs EUR/PLN z dnia zakupu (ostatnie zamknięcie ≤ data); dziś – bieżące notowanie
export async function pricesOn(date, today) {
  if (date >= today) {
    const [q, fx] = await Promise.all([fetchYahooQuote(JULKA_ETF.symbol), fetchYahooQuote(JULKA_ETF.fxSymbol)]);
    return { price: q.price, fx: fx.price, priceDate: date, fxDate: date, source: q.source };
  }
  const [h, f] = await Promise.all([dailyHistory(JULKA_ETF.symbol, date), dailyHistory(JULKA_ETF.fxSymbol, date)]);
  const p = closeOnOrBefore(h.points, date);
  const x = closeOnOrBefore(f.points, date);
  if (!p || !x) throw new Error('brak notowań z tego dnia – wpisz kurs i cenę ręcznie');
  return { price: p[1], fx: x[1], priceDate: p[0], fxDate: x[0], source: h.source };
}

export async function currentQuote() {
  const [q, fx] = await Promise.all([fetchYahooQuote(JULKA_ETF.symbol), fetchYahooQuote(JULKA_ETF.fxSymbol)]);
  return { price: q.price, fx: fx.price, at: new Date().toISOString(), source: q.source };
}

const newId = () => `jk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// Zakup z dnia `date`: pobranie kursów i wyliczenie jednostek (auto – zakup automatyczny)
export async function buildPurchase(data, date, today, { auto = false } = {}) {
  const px = await pricesOn(date, today);
  const calc = calcPurchase({ amountPLN: data.amount, fxRate: px.fx, price: px.price, fxFeePct: data.fxFeePct });
  return { id: newId(), date, ...calc, currency: JULKA_ETF.currency, priceDate: px.priceDate, fxDate: px.fxDate, source: px.source, auto };
}

// Ręczna korekta wpisu: przeliczenie jednostek z poprawionych kwoty / kursu / ceny / prowizji
export function correctPurchase(p, patch) {
  const next = { ...p, ...patch };
  const calc = calcPurchase({ amountPLN: next.amountPLN, fxRate: next.fxRate, price: next.price, fxFeePct: next.fxFeePct });
  return { ...next, ...calc, manual: true, units: patch.units !== undefined && patch.units !== '' ? round(Number(patch.units) || 0, 4) : calc.units };
}

export function sortPurchases(list) {
  return [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// Automatyczne zakupy zaległych miesięcy (wywoływane po otwarciu aplikacji / zakładki); zwraca nowy stan i listę dodanych
let autoRunning = null;
export function runJulkaAuto(today) {
  if (autoRunning) return autoRunning;
  autoRunning = (async () => {
    const data = readJulka();
    const added = [];
    const errors = [];
    for (const date of dueAutoDates(data, today).slice(0, 24)) {
      try {
        added.push(await buildPurchase(data, date, today, { auto: true }));
      } catch (e) {
        errors.push(`${date}: ${e.message}`);
        break; // brak notowań – kolejna próba przy następnym otwarciu
      }
    }
    if (added.length) {
      const fresh = readJulka(); // w międzyczasie mogły dojść zmiany z widoku
      const months = new Set(fresh.purchases.map((p) => p.date.slice(0, 7)));
      const next = { ...fresh, purchases: [...fresh.purchases, ...added.filter((p) => !months.has(p.date.slice(0, 7)))] };
      writeJulka(next);
      return { data: next, added, errors };
    }
    return { data, added, errors };
  })().finally(() => {
    autoRunning = null;
  });
  return autoRunning;
}
