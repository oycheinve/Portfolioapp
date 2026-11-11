// Szacowanie cen na liście zakupów z historii przeskanowanych paragonów (`wealth-app-receipts-v1`).
// • Dopasowanie produktu z listy („szynka”) do pozycji paragonów („Szynka konserwowa 200 g”): każde słowo z listy
//   musi pasować do początku słowa z paragonu (bez wielkości liter i polskich znaków, z tolerancją końcówek:
//   szynka / szynki / szynkowa); pełna zgodność nazwy ma pierwszeństwo.
// • Cena za sztukę: wartość pozycji / ilość (dla ilości całkowitych, np. 2 × mleko); dla wagi (kg) – cała pozycja,
//   tak jak zwykle się ją kupuje. Szacunek: średnia z 3 ostatnich zakupów; podgląd pokazuje też ostatnią cenę.
// • Korekta użytkownika (`wealth-app-shopping-prices-v1`, per użytkownik – urządzenie + chmura) ma pierwszeństwo,
//   dopóki nie pojawi się nowszy paragon z tym produktem (wtedy wraca cena z paragonu).
// • AI (fallback, `wealth-app-shopping-ai-prices-v1`): gdy słowa nie pasują – dopasowanie semantyczne do nazwy z paragonów
//   (match → cena z historii tej pozycji), a gdy produktu nigdy nie kupowano – szacunek ceny rynkowej (source 'ai').
//   Wynik zapamiętany per produkt; szacunki rynkowe odświeżane po AI_TTL_DAYS.
import { PREFS_CHANGED_EVENT } from './budget.js';
import { readReceipts } from './receipts.js';

export const PRICES_KEY = 'wealth-app-shopping-prices-v1';
const RECENT = 3;
export const AI_PRICES_KEY = 'wealth-app-shopping-ai-prices-v1';
const AI_TTL_DAYS = 60;

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

export function readAiPrices() {
  try {
    const v = JSON.parse(localStorage.getItem(AI_PRICES_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
// Zapis odpowiedzi AI: { 'tytuł z listy': { match, price, unit } } (także produkty bez wyniku – by nie pytać w kółko)
export function writeAiPrices(titles, prices) {
  const all = readAiPrices();
  const at = new Date().toISOString().slice(0, 10);
  for (const t of titles) {
    const x = prices[t];
    all[priceKey(t)] = x ? { match: x.match || '', price: Number(x.price) > 0 ? round2(Number(x.price)) : null, unit: x.unit || '', at } : { match: '', price: null, unit: '', at };
  }
  try {
    localStorage.setItem(AI_PRICES_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent(PREFS_CHANGED_EVENT, { detail: { key: AI_PRICES_KEY } }));
  } catch {
    // brak localStorage
  }
  return all;
}
const fresh = (at, days) => !!at && (Date.now() - new Date(at).getTime()) / 86400000 < days;
// Produkty do zapytania AI: bez dopasowania słownego, bez Twojej ceny i bez świeżej odpowiedzi AI
export function needsAiPrice(title, index, overrides = readPriceOverrides(), ai = readAiPrices()) {
  const k = priceKey(title);
  if (!k || overrides[k] || matches(index, title).length) return false;
  const a = ai[k];
  if (!a) return true;
  if (a.match) return !index.some((x) => x.full === priceKey(a.match)); // dopasowany paragon zniknął z historii
  return !fresh(a.at, AI_TTL_DAYS);
}
// Nazwy produktów z paragonów (najnowsze najpierw, bez powtórzeń) – kontekst dopasowania semantycznego
export const knownProducts = (index, limit = 400) => [...new Set(index.map((x) => x.name))].slice(0, limit);

// Szacunek ceny produktu: { price, source: 'user' | 'receipts', last, lastDate, avg, count, factor, total }
export function estimatePrice(title, quantity, index, overrides = readPriceOverrides(), ai = {}) {
  const a = ai[priceKey(title)];
  let hits = matches(index, title);
  let semantic = false;
  if (!hits.length && a?.match) {
    hits = index.filter((x) => x.full === priceKey(a.match));
    semantic = hits.length > 0;
  }
  const recent = hits.slice(0, RECENT);
  const avg = recent.length ? round2(recent.reduce((s, x) => s + x.unit, 0) / recent.length) : null;
  const last = hits[0] || null;
  const ov = overrides[priceKey(title)];
  const useOverride = ov && (!last || String(ov.at) >= String(last.date));
  const aiPrice = !useOverride && avg === null && a?.price > 0 ? a.price : null;
  const price = useOverride ? ov.price : avg ?? aiPrice;
  if (price === null || price === undefined) return null;
  const factor = quantityFactor(quantity);
  return { price, source: useOverride ? 'user' : aiPrice !== null ? 'ai' : 'receipts', semantic, aiUnit: aiPrice !== null ? a.unit || '' : '', last: last?.unit ?? null, lastDate: last?.date || '', lastName: last?.name || '', avg, count: hits.length, factor, total: round2(price * factor) };
}

export const formatZl = (v) => `${Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
