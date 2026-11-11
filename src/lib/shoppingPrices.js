// Szacowanie cen na liście zakupów z historii przeskanowanych paragonów (`wealth-app-receipts-v1`).
// • Dopasowanie produktu z listy („szynka”) do pozycji paragonów („Szynka konserwowa 200 g”): każde słowo z listy
//   musi pasować do początku słowa z paragonu (bez wielkości liter i polskich znaków, z tolerancją końcówek:
//   szynka / szynki / szynkowa); pełna zgodność nazwy ma pierwszeństwo.
// • Cena za sztukę: wartość pozycji / ilość (dla ilości całkowitych, np. 2 × mleko); dla wagi (kg) – cała pozycja,
//   tak jak zwykle się ją kupuje. Szacunek: średnia z 3 ostatnich zakupów; podgląd pokazuje też ostatnią cenę.
// • Korekta użytkownika (`wealth-app-shopping-prices-v1`, per użytkownik – urządzenie + chmura) ma pierwszeństwo,
//   dopóki nie pojawi się nowszy paragon z tym produktem (wtedy wraca cena z paragonu).
import { PREFS_CHANGED_EVENT } from './budget.js';
import { readReceipts } from './receipts.js';

export const PRICES_KEY = 'wealth-app-shopping-prices-v1';
const RECENT = 3;

const fold = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
const words = (s) => fold(s).split(/[^a-z]+/).filter((w) => w.length >= 3);
export const priceKey = (title) => fold(title).replace(/\s+/g, ' ').trim();
const stem = (w) => w.slice(0, Math.max(3, w.length - 2)); // szynka → szyn, mleko → mle(ko)
const round2 = (v) => Math.round(v * 100) / 100;

// Indeks pozycji ze wszystkich paragonów: [{ name, words, full, unit, date }]
export function buildPriceIndex(receipts = readReceipts()) {
  const out = [];
  for (const r of receipts) {
    const date = r.date || String(r.savedAt || '').slice(0, 10);
    for (const it of r.items || []) {
      const price = Number(it.price);
      if (!it.name || !(price > 0)) continue;
      const q = Number(it.quantity);
      const unit = q >= 1 && Number.isInteger(q) ? price / q : price;
      out.push({ name: it.name, words: words(it.name), full: priceKey(it.name), unit: round2(unit), date });
    }
  }
  return out.sort((a, b) => String(b.date).localeCompare(String(a.date))); // najnowsze najpierw
}

function matches(index, title) {
  const key = priceKey(title);
  const exact = index.filter((x) => x.full === key);
  if (exact.length) return exact;
  const ws = words(title);
  if (!ws.length) return [];
  return index.filter((x) => ws.every((w) => x.words.some((r) => r.startsWith(stem(w)))));
}

export function readPriceOverrides() {
  try {
    const v = JSON.parse(localStorage.getItem(PRICES_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
export function writePriceOverride(title, price) {
  const all = readPriceOverrides();
  const k = priceKey(title);
  if (price === null || price === undefined || !(Number(price) > 0)) delete all[k];
  else all[k] = { price: round2(Number(price)), at: new Date().toISOString().slice(0, 10) };
  try {
    localStorage.setItem(PRICES_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent(PREFS_CHANGED_EVENT, { detail: { key: PRICES_KEY } }));
  } catch {
    // brak localStorage
  }
  return all;
}

// Ilość z listy („2”, „3 szt”, „2x”) → mnożnik; waga i inne jednostki („1 kg”, „500 g”) → 1 (cena jak w historii)
export function quantityFactor(q) {
  const m = String(q || '')
    .trim()
    .toLowerCase()
    .match(/^(\d+)\s*(szt\.?|x|×|op\.?|opak\.?)?$/);
  const n = m ? Number(m[1]) : 1;
  return n >= 1 && n <= 99 ? n : 1;
}

// Szacunek ceny produktu: { price, source: 'user' | 'receipts', last, lastDate, avg, count, factor, total }
export function estimatePrice(title, quantity, index, overrides = readPriceOverrides()) {
  const hits = matches(index, title);
  const recent = hits.slice(0, RECENT);
  const avg = recent.length ? round2(recent.reduce((s, x) => s + x.unit, 0) / recent.length) : null;
  const last = hits[0] || null;
  const ov = overrides[priceKey(title)];
  const useOverride = ov && (!last || String(ov.at) >= String(last.date));
  const price = useOverride ? ov.price : avg;
  if (price === null || price === undefined) return null;
  const factor = quantityFactor(quantity);
  return { price, source: useOverride ? 'user' : 'receipts', last: last?.unit ?? null, lastDate: last?.date || '', lastName: last?.name || '', avg, count: hits.length, factor, total: round2(price * factor) };
}

export const formatZl = (v) => `${Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
