// Paragony (BETA): kompresja zdjęcia w aplikacji (mniejsza rozdzielczość, skala szarości, JPEG) → skrót SHA-256 →
// lokalna pamięć wyników (ten sam paragon = koszt AI 0) → AI (OCR, czysty JSON) → kategorie pozycji najpierw z uczącej
// się pamięci produktów (shoppingCategories.js), potem z AI → ekran weryfikacji (albo zapis automatyczny) → zapis
// w budżecie i historii; poprawki kategorii zapisywane w pamięci (samouczenie). Dane per użytkownik.
import { categoryOf, normProduct, readCats, remember, resolveLocal, writeCats } from './shoppingCategories.js';
import { PREFS_CHANGED_EVENT, defaultFoodRow } from './budget.js';

export const RECEIPTS_KEY = 'wealth-app-receipts-v1';
const CACHE_KEY = 'fintrack-receipt-cache-v1';
const MAX_SIDE = 1280;

// Zdjęcie → JPEG w skali szarości (dłuższy bok ≤ 1280 px) – mniej danych do przesłania i mniej tokenów
export async function compressImage(file, { maxSide = MAX_SIDE, quality = 0.6 } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Nie udało się wczytać zdjęcia'));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h);
    const d = px.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      d[i] = g;
      d[i + 1] = g;
      d[i + 2] = g;
    }
    ctx.putImageData(px, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    return { base64, mime: 'image/jpeg', width: w, height: h, bytes: Math.round((base64.length * 3) / 4), original: file.size };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function imageHash(base64) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base64));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readJson(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
export const cachedReceipt = (hash) => readJson(CACHE_KEY, {})[hash]?.receipt || null;
export function cacheReceipt(hash, receipt) {
  try {
    const all = readJson(CACHE_KEY, {});
    all[hash] = { receipt, at: Date.now() };
    const keep = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, 30);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(keep)));
  } catch {
    // brak localStorage
  }
}

// Kategorie pozycji: pamięć użytkownika (korekty, wcześniejsze zakupy, słownik) ma pierwszeństwo przed AI
export function applyMemory(receipt, mem = readCats()) {
  return {
    ...receipt,
    items: receipt.items.map((it, i) => {
      const local = resolveLocal(it.name, mem);
      const category = local?.category || it.category || categoryOf(it.name, mem).category;
      return { id: `ri${i}${Date.now().toString(36)}`, ...it, category, aiCategory: it.category, source: local ? local.source : 'ai' };
    }),
  };
}

// ── Kategorie budżetu: pozycje trafiają WYŁĄCZNIE do kategorii zdefiniowanych przez użytkownika w Budżecie ──
// Kolejność: pamięć produktu (poprawki użytkownika i wcześniejsze paragony) → wskazanie AI (enum z listy użytkownika)
// → reguły słownikowe (kategoria sklepowa → nazwa kategorii budżetu) → kategoria jedzeniowa / „Nieprzewidziane”.
// Pamięć dotyczy pojedynczych produktów (poprawka jednej pozycji nie przenosi całej grupy) i przechowuje nazwę
// kategorii budżetu (stabilną między miesiącami), nie jej id. Klucz per użytkownik (urządzenie + chmura).
export const RECEIPT_BUDGET_KEY = 'wealth-app-receipt-budget-v1';
const FOOD_CATS = new Set(['Warzywa i owoce', 'Pieczywo', 'Nabiał i jajka', 'Mięso i ryby', 'Wędliny', 'Mrożonki', 'Produkty sypkie i makarony', 'Przyprawy', 'Konserwy i przetwory', 'Słodycze i przekąski', 'Napoje']);
const RULES = {
  'Chemia gospodarcza': [/chemi/i, /kosmet/i, /drogeri/i, /środk|srodk|czysto|sprząt|sprzat/i, /\bdom\b|domow/i],
  'Kosmetyki i higiena': [/kosmet/i, /higien/i, /drogeri/i, /chemi/i, /pielęgn|pielegn|uroda/i],
  Apteka: [/aptek/i, /\blek/i, /zdrow/i, /suplement/i],
  'Dla dziecka': [/dzieck|dzieci|maluch|niemowl/i],
  'Dla zwierząt': [/zwierz|\bpsa\b|\bpies|\bkot|karma/i],
  'Ubrania i obuwie': [/ubra|odzie|obuw|ciuch/i],
  'Dom i inne': [/\bdom\b|domow|mieszkan/i, /nieprzewidz|różne|rozne|\binne\b/i],
};
const FOOD_RE = [/jedzeni|żywnoś|zywnos|spożyw|spozyw|food/i, /zakupy/i];
const OTHER_RE = /nieprzewidz|różne|rozne|\binne\b/i;
const NO_RECEIPT_TYPES = new Set(['Inwestycje', 'Oszczędności']);
const named = (rows) => (rows || []).filter((r) => String(r.name || '').trim());
const byName = (rows, name) => {
  const n = String(name || '').trim().toLowerCase();
  return n ? named(rows).find((r) => r.name.trim().toLowerCase() === n) || null : null;
};
// Kategorie, do których mogą trafiać zakupy z paragonu (bez inwestycji / oszczędności, chyba że nie ma innych)
export function receiptRows(rows) {
  const all = named(rows);
  const spend = all.filter((r) => !NO_RECEIPT_TYPES.has(r.type));
  return spend.length ? spend : all;
}
export function readBudgetMap() {
  const v = readJson(RECEIPT_BUDGET_KEY, {});
  return { p: v?.p && typeof v.p === 'object' ? v.p : {} };
}
function writeBudgetMap(map) {
  try {
    localStorage.setItem(RECEIPT_BUDGET_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(PREFS_CHANGED_EVENT, { detail: { key: RECEIPT_BUDGET_KEY } }));
  } catch {
    // brak localStorage
  }
}
// Dopasowanie jednej pozycji: { rowId, budgetSource: 'memory' | 'ai' | 'rule' }
export function resolveBudgetRow(item, rows, map = readBudgetMap()) {
  const pool = receiptRows(rows);
  if (!pool.length) return { rowId: '', budgetSource: 'rule' };
  const mem = map.p[normProduct(item.name)];
  const fromMem = mem && byName(rows, mem.r);
  if (fromMem) return { rowId: fromMem.id, budgetSource: 'memory' };
  const fromAi = byName(pool, item.budget);
  if (fromAi) return { rowId: fromAi.id, budgetSource: 'ai' };
  const tests = FOOD_CATS.has(item.category) ? FOOD_RE : RULES[item.category] || [];
  for (const re of tests) {
    const hit = pool.find((r) => re.test(r.name));
    if (hit) return { rowId: hit.id, budgetSource: 'rule' };
  }
  const food = defaultFoodRow(pool);
  const other = pool.find((r) => OTHER_RE.test(r.name));
  const fallback = FOOD_CATS.has(item.category) ? food || other : other || food;
  return { rowId: (fallback || pool[0]).id, budgetSource: 'rule' };
}
export function assignBudgetRows(receipt, rows, map = readBudgetMap()) {
  return { ...receipt, items: receipt.items.map((it) => (it.rowId && rows.some((r) => r.id === it.rowId) ? it : { ...it, ...resolveBudgetRow(it, rows, map) })) };
}
// Podział paragonu na kategorie budżetu: [{ id, amount }]
export function receiptParts(receipt) {
  const by = {};
  for (const it of receipt.items) {
    if (!it.rowId) continue;
    by[it.rowId] = Math.round(((by[it.rowId] || 0) + (Number(it.price) || 0)) * 100) / 100;
  }
  return Object.entries(by).map(([id, amount]) => ({ id, amount }));
}
// Samouczenie przypisań: poprawka użytkownika → produkt zapamiętany (pierwszeństwo przed AI i regułami)
export function learnBudget(receipt, rows) {
  const map = readBudgetMap();
  let changed = false;
  for (const it of receipt.items) {
    const row = rows.find((r) => r.id === it.rowId);
    const key = normProduct(it.name);
    if (!row || !key) continue;
    const prev = map.p[key];
    if (it.budgetEdited || !prev) {
      map.p[key] = { r: row.name.trim(), s: it.budgetEdited ? 'user' : 'auto', t: Date.now() };
      changed = true;
    }
  }
  if (changed) writeBudgetMap(map);
  return map;
}

// Sumy: pozycji, częściowe per kategoria budżetu (nazwa); zgodność z „SUMA PLN” z paragonu
export function receiptTotals(receipt, rows = []) {
  const by = {};
  let sum = 0;
  for (const it of receipt.items) {
    const p = Math.round((Number(it.price) || 0) * 100) / 100;
    sum += p;
    const key = rows.find((r) => r.id === it.rowId)?.name || it.category || 'Bez kategorii';
    by[key] = Math.round(((by[key] || 0) + p) * 100) / 100;
  }
  sum = Math.round(sum * 100) / 100;
  const printed = Number(receipt.total) || 0;
  return { sum, byCategory: by, printed, diff: printed ? Math.round((printed - sum) * 100) / 100 : 0 };
}

// Samouczenie: zapis kategorii pozycji w pamięci produktów – poprawione przez użytkownika jako 'user'
export function learnFromReceipt(receipt) {
  let mem = readCats();
  for (const it of receipt.items) {
    const corrected = it.edited === 'category';
    mem = remember(mem, it.name, { category: it.category, source: corrected ? 'user' : it.source === 'ai' ? 'ai' : undefined });
  }
  writeCats(mem);
  return mem;
}

export function readReceipts() {
  const v = readJson(RECEIPTS_KEY, []);
  return Array.isArray(v) ? v : [];
}
export function writeReceipts(list) {
  try {
    localStorage.setItem(RECEIPTS_KEY, JSON.stringify(list.slice(0, 500)));
    window.dispatchEvent(new CustomEvent(PREFS_CHANGED_EVENT, { detail: { key: RECEIPTS_KEY } }));
  } catch {
    // brak localStorage
  }
}
