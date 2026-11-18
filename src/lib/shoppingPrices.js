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
// • Waga: pozycja ważona na paragonie (unit „kg” od AI albo ilość niecałkowita, np. 0,734) daje też cenę za kg
//   (wartość / waga). Ilość na liście z jednostką wagi („1,5 kg”, „500 g”, „50 dag”) → koszt = cena za kg × waga
//   (z paragonów, Twojej ceny za kg albo szacunku AI za kg). Ilość w sztukach – jak dotąd (cena za sztukę / typowy
//   zakup na wagę × liczba sztuk). Brak ceny za kg przy ilości w wadze – cena jak bez ilości (bez przeliczenia).
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
      const net = price - (Number(it.deposit) || 0); // cena bez kaucji (kaucja doliczana przy szacunku)
      if (!(net > 0)) continue;
      const unit = q >= 1 && Number.isInteger(q) ? net / q : net;
      // Ważone: oznaczone przez AI („kg”) albo ilość niecałkowita (waga w kg)
      const weighed = q > 0 && q < 50 && (it.unit === 'kg' || !Number.isInteger(q));
      out.push({ name: it.name, words: words(it.name), full: priceKey(it.name), unit: round2(unit), ...(weighed ? { perKg: round2(net / q), kg: q } : {}), date });
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
// per: 'kg' – Twoja cena za kilogram (pozycja z ilością w wadze); bez – za sztukę / opakowanie
export function writePriceOverride(title, price, per) {
  const all = readPriceOverrides();
  const k = priceKey(title);
  if (price === null || price === undefined || !(Number(price) > 0)) delete all[k];
  else all[k] = { price: round2(Number(price)), ...(per === 'kg' ? { per: 'kg' } : {}), at: new Date().toISOString().slice(0, 10) };
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

// Ilość z listy: { kind: 'kg', kg } dla wagi („1,5 kg”, „0.5kg”, „500 g”, „50 dag”), { kind: 'szt', n } dla sztuk,
// null – brak / nieczytelna
export function parseQuantity(q) {
  const t = String(q || '').trim().toLowerCase().replace(',', '.');
  if (!t) return null;
  const w = t.match(/^(\d+(?:\.\d+)?)\s*(kg|kilo|g|gr|dag|dkg)\.?$/);
  if (w) {
    const v = Number(w[1]);
    const kg = w[2] === 'g' || w[2] === 'gr' ? v / 1000 : w[2] === 'dag' || w[2] === 'dkg' ? v / 100 : v;
    return kg > 0 && kg <= 100 ? { kind: 'kg', kg: Math.round(kg * 1000) / 1000 } : null;
  }
  const n = t.match(/^(\d+)\s*(szt\.?|x|×|op\.?|opak\.?)?$/);
  return n && Number(n[1]) >= 1 && Number(n[1]) <= 99 ? { kind: 'szt', n: Number(n[1]) } : null;
}
// Suma ilości tego samego produktu (ponowne dodanie): sztuki + sztuki, waga + waga; brak ilości = 1 szt.
// Różne jednostki (np. „2” i „500 g”) albo nieczytelny zapis – null (osobna pozycja)
export function mergeQuantity(a, b) {
  const pa = String(a || '').trim() ? parseQuantity(a) : { kind: 'szt', n: 1, implicit: true };
  const pb = String(b || '').trim() ? parseQuantity(b) : { kind: 'szt', n: 1, implicit: true };
  if (!pa || !pb || pa.kind !== pb.kind) return null;
  if (pa.kind === 'szt') {
    const n = pa.n + pb.n;
    return n <= 999 ? (/szt/i.test(`${a} ${b}`) ? `${n} szt` : String(n)) : null;
  }
  const kg = Math.round((pa.kg + pb.kg) * 1000) / 1000;
  return kg < 1 ? `${Math.round(kg * 1000)} g` : `${String(kg).replace('.', ',')} kg`;
}
export const formatKg = (kg) => (kg < 1 ? `${Math.round(kg * 1000)} g` : `${String(Math.round(kg * 1000) / 1000).replace('.', ',')} kg`);

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
    all[priceKey(t)] = x ? { match: x.match || '', price: Number(x.price) > 0 ? round2(Number(x.price)) : null, unit: x.unit || '', ...(x.per === 'kg' ? { per: 'kg' } : {}), at } : { match: '', price: null, unit: '', at };
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

// Cena AI za kg: oznaczona „per: kg” albo (starsze zapisy) jednostka „1 kg” / „kg”
const aiPerKg = (a) => !!a && (a.per === 'kg' || (a.per === undefined && /^\s*(1\s*)?kg\b/i.test(String(a.unit || ''))));

// Szacunek ceny produktu: { price, source: 'user' | 'receipts' | 'ai', last, lastDate, avg, count, factor, total,
//   mode: 'kg' (cena za kg × waga z listy) | 'szt', perKg, weightKg, typicalKg, noWeightPrice }
// deposit – kaucja za sztukę (napoje w butelce / puszce), doliczana do ceny z paragonów i z AI (nie do Twojej ceny)
export function estimatePrice(title, quantity, index, overrides = readPriceOverrides(), ai = {}, deposit = 0) {
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
  // Cena za kg z ostatnich ważonych zakupów (paragony) i typowa waga zakupu
  const weighed = hits.filter((x) => x.perKg > 0).slice(0, RECENT);
  const receiptsPerKg = weighed.length ? round2(weighed.reduce((s, x) => s + x.perKg, 0) / weighed.length) : null;
  const typicalKg = weighed.length ? Math.round((weighed.reduce((s, x) => s + x.kg, 0) / weighed.length) * 1000) / 1000 : null;
  const q = parseQuantity(quantity);

  // Ilość w wadze → cena za kg × waga
  if (q?.kind === 'kg') {
    const userKg = useOverride && ov.per === 'kg' ? ov.price : null;
    const aiKg = !useOverride && receiptsPerKg === null && avg === null && a?.price > 0 && aiPerKg(a) ? a.price : null;
    const perKg = userKg ?? (receiptsPerKg !== null && !(useOverride && ov.per !== 'kg') ? receiptsPerKg : null) ?? aiKg;
    if (perKg !== null) {
      const lastKg = weighed[0] || null;
      const source = userKg !== null ? 'user' : aiKg !== null ? 'ai' : 'receipts';
      return { price: perKg, source, mode: 'kg', perKg, weightKg: q.kg, typicalKg, deposit: 0, semantic, aiUnit: source === 'ai' ? a.unit || '1 kg' : '', last: lastKg?.perKg ?? null, lastDate: lastKg?.date || '', lastName: lastKg?.name || '', avg: receiptsPerKg, count: weighed.length, factor: 1, total: round2(perKg * q.kg) };
    }
  }

  const aiPrice = !useOverride && avg === null && a?.price > 0 ? a.price : null;
  const base = useOverride ? ov.price : avg ?? aiPrice;
  if (base === null || base === undefined) return null;
  const dep = useOverride ? 0 : Number(deposit) || 0;
  const price = round2(base + dep);
  const factor = quantityFactor(quantity);
  const unitKg = (useOverride && ov.per === 'kg') || (aiPrice !== null && aiPerKg(a));
  return {
    price,
    source: useOverride ? 'user' : aiPrice !== null ? 'ai' : 'receipts',
    mode: 'szt',
    perKg: unitKg ? price : receiptsPerKg,
    priceIsPerKg: unitKg, // cena dotyczy 1 kg (Twoja / AI), a ilość nie jest w wadze
    weightKg: null,
    typicalKg: !useOverride && aiPrice === null ? typicalKg : null, // „typowy zakup” na wagę z paragonów
    noWeightPrice: q?.kind === 'kg', // ilość w wadze, ale brak ceny za kg – bez przeliczenia
    deposit: dep,
    semantic,
    aiUnit: aiPrice !== null ? a.unit || '' : '',
    last: last?.unit ?? null,
    lastDate: last?.date || '',
    lastName: last?.name || '',
    avg,
    count: hits.length,
    factor,
    total: round2(price * factor),
  };
}

export const formatZl = (v) => `${Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
