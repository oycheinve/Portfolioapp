// Bezpieczny ponowny import (np. zaktualizowany plik z XTB): operacja z pliku, która już jest w danych, jest pomijana.
// Dopasowanie 1) po identyfikatorze importu (ten sam wiersz z poprzedniego importu) albo 2) po treści operacji:
// konto, data, rodzaj, ticker, liczba jednostek i cena (transakcje) / kwota (wpłaty, wypłaty, dywidendy, odsetki).
// Czas porównywany, gdy oba wpisy go mają i pochodzą z tego samego rodzaju importu (różne arkusze XTB podają czas
// w innych strefach). Dopasowanie jeden do jednego – dwie identyczne operacje w pliku wymagają dwóch w danych;
// zlecenia realizowane w częściach dopasowywane grupowo (suma jednostek i średnia cena z tego samego dnia).
// Wpisy techniczne (automatyczne uzupełnienie środków, dywidendy zaksięgowane z harmonogramu) nie blokują
// prawdziwych operacji z pliku – są przeliczane / zastępowane automatycznie.

import { isSyntheticDeposit } from './engine.js';

const round = (v, d) => {
  const f = 10 ** d;
  return Math.round((Number(v) || 0) * f) / f;
};

// Ticker bez końcówki giełdy (PKO.PL / PKO.WA / PKO → PKO) – ten sam walor zapisany pod różnymi instrumentami
export function makeTickerOf(instruments) {
  const byId = Object.fromEntries(instruments.map((i) => [i.id, i]));
  return (instrumentId) => {
    const t = byId[instrumentId]?.ticker;
    return t ? String(t).toUpperCase().replace(/\..*$/, '') : String(instrumentId || '');
  };
}

export const tradeKey = (t, tickerOf) => `${t.accountId}|${t.date}|${t.side}|${tickerOf(t.instrumentId)}|${round(t.quantity, 6)}|${round(t.price, 4)}`;
export const cashflowKey = (c) => `${c.accountId}|${c.date}|${c.type}|${round(c.amount, 2)}`;
export const incomeKey = (i, tickerOf) => `${i.accountId}|${i.date}|${i.type}|${i.instrumentId ? tickerOf(i.instrumentId) : ''}|${round(i.gross, 2)}`;

const KEYS = { trades: tradeKey, cashflows: (c) => cashflowKey(c), income: incomeKey };

// Wpisy, które nie mogą zablokować operacji z pliku
function blocking(collection, x) {
  if (collection === 'cashflows') return !isSyntheticDeposit(x);
  if (collection === 'income') return !x.scheduleId;
  return true;
}

// Zlecenie zrealizowane w częściach: jedna transza w arkuszu pozycji = kilka realizacji w historii operacji
// (ta sama data, rodzaj, walor; suma liczby jednostek i średnia cena zgodne). Szukany podzbiór o tej sumie.
const lotKey = (t, tickerOf) => `${t.accountId}|${t.date}|${t.side}|${tickerOf(t.instrumentId)}`;
function subsetMatching(target, parts) {
  const q = Number(target.quantity) || 0;
  const px = Number(target.price) || 0;
  if (!(q > 0) || parts.length < 2 || parts.length > 14) return null;
  const tol = Math.max(1e-6, q * 1e-6);
  for (let mask = 3; mask < 1 << parts.length; mask += 1) {
    if ((mask & (mask - 1)) === 0) continue; // pojedyncze wpisy porównuje dopasowanie dokładne
    let sq = 0;
    let sv = 0;
    const pick = [];
    for (let i = 0; i < parts.length; i += 1) {
      if (!(mask & (1 << i))) continue;
      sq += Number(parts[i].quantity) || 0;
      sv += (Number(parts[i].quantity) || 0) * (Number(parts[i].price) || 0);
      pick.push(i);
    }
    if (Math.abs(sq - q) <= tol && sq > 0 && Math.abs(sv / sq - px) <= Math.max(0.0001, px * 0.005)) return pick;
  }
  return null;
}

function sameTime(a, b) {
  if (!a.time || !b.time || (a.source || '') !== (b.source || '')) return true;
  return a.time === b.time;
}

// items – operacje z pliku; ignoreIds – wpisy w danych, które ten import i tak usuwa (nie są duplikatami)
// → { fresh, byId, byContent } (byId: już zaimportowane wcześniej, byContent: rozpoznane po treści, np. wpis ręczny)
export function dedupeImport(state, collection, items, { extraInstruments = [], ignoreIds = null } = {}) {
  const tickerOf = makeTickerOf([...state.instruments, ...extraInstruments]);
  const keyOf = (x) => KEYS[collection](x, tickerOf);
  const existing = state[collection] || [];
  const existingIds = new Set(existing.map((x) => x.id));
  const importIds = new Set(items.map((x) => x.id));
  const pool = new Map();
  for (const x of existing) {
    if (importIds.has(x.id) || (ignoreIds && ignoreIds.has(x.id)) || !blocking(collection, x)) continue;
    const k = keyOf(x);
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k).push(x);
  }
  const fresh = [];
  const byId = [];
  const byContent = [];
  for (const item of items) {
    if (existingIds.has(item.id)) {
      byId.push(item);
      continue;
    }
    const list = pool.get(keyOf(item));
    const idx = list ? list.findIndex((x) => sameTime(item, x)) : -1;
    if (idx >= 0) {
      byContent.push({ item, match: list[idx] });
      list.splice(idx, 1);
    } else fresh.push(item);
  }
  if (collection !== 'trades' || !fresh.length) return { fresh, byId, byContent };

  // Transakcje: dopasowanie grupowe (realizacje częściowe) w obie strony – transza z pliku = kilka wpisów w danych
  // albo kilka realizacji z pliku = jedna transza w danych
  const left = [...pool.values()].flat();
  const groupBy = (list) => {
    const m = new Map();
    for (const x of list) {
      const k = lotKey(x, tickerOf);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    }
    return m;
  };
  const leftBy = groupBy(left);
  const matched = new Set();
  for (const item of fresh) {
    const parts = (leftBy.get(lotKey(item, tickerOf)) || []).filter((x) => !matched.has(x));
    const pick = subsetMatching(item, parts);
    if (!pick) continue;
    pick.forEach((i) => matched.add(parts[i]));
    byContent.push({ item, match: parts[pick[0]], parts: pick.length });
    item.__dup = true;
  }
  let rest = fresh.filter((x) => !x.__dup);
  const restBy = groupBy(rest);
  for (const lot of left) {
    if (matched.has(lot)) continue;
    const parts = (restBy.get(lotKey(lot, tickerOf)) || []).filter((x) => !x.__dup);
    const pick = subsetMatching(lot, parts);
    if (!pick) continue;
    matched.add(lot);
    for (const i of pick) {
      parts[i].__dup = true;
      byContent.push({ item: parts[i], match: lot, parts: pick.length });
    }
  }
  rest = fresh.filter((x) => !x.__dup);
  for (const x of fresh) delete x.__dup;
  return { fresh: rest, byId, byContent };
}
