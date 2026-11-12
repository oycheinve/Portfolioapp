// Paragony (BETA): kompresja zdjęcia w aplikacji (mniejsza rozdzielczość, skala szarości, JPEG) → skrót SHA-256 →
// lokalna pamięć wyników (ten sam paragon = koszt AI 0) → AI (OCR, czysty JSON) → kategorie pozycji najpierw z uczącej
// się pamięci produktów (shoppingCategories.js), potem z AI → ekran weryfikacji (albo zapis automatyczny) → zapis
// w budżecie i historii; poprawki kategorii zapisywane w pamięci (samouczenie). Dane per użytkownik.
import { categoryOf, normProduct, readCats, remember, resolveLocal, writeCats } from './shoppingCategories.js';
import { PREFS_CHANGED_EVENT, defaultFoodRow } from './budget.js';

export const RECEIPTS_KEY = 'wealth-app-receipts-v1';
const CACHE_KEY = 'fintrack-receipt-cache-v1';
// Limity obrazu wysyłanego do AI: szerokość ≤ 1100 px (tekst paragonu nadal czytelny), wysokość ≤ 2400 px (długie
// paragony), JPEG q 0.5 w skali szarości – zwykle 80–250 kB zamiast kilku MB z aparatu telefonu.
const MAX_WIDTH = 1100;
const MAX_HEIGHT = 2400;
const QUALITY = 0.5;

// Dekodowanie z od razu zmniejszoną rozdzielczością (createImageBitmap z resizeWidth) – przeglądarka nie trzyma
// w pamięci pełnych 12–48 Mpx z aparatu. Starsze przeglądarki: <img> + natychmiastowe zwolnienie zasobów.
async function decodeScaled(file, maxWidth) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { resizeWidth: maxWidth, resizeQuality: 'medium', imageOrientation: 'from-image' });
      // Część przeglądarek ignoruje resize* – wtedy bitmapa ma pełny rozmiar i zmniejszamy ją na płótnie
      return { source: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close?.() };
    } catch {
      // brak obsługi opcji / formatu – wariant z <img>
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Nie udało się wczytać zdjęcia'));
      img.src = url;
    });
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  return {
    source: img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    release: () => {
      img.onload = null;
      img.onerror = null;
      img.removeAttribute('src');
      URL.revokeObjectURL(url);
    },
  };
}

// Zdjęcie → JPEG w skali szarości (≤ 1100 × 2400 px). Płótno i bitmapa są zwalniane zaraz po użyciu (szerokość
// i wysokość 0 – iOS Safari inaczej trzyma pamięć płótna do odśmiecania i przy kilku skanach zgłasza jej brak).
export async function compressImage(file, { maxWidth = MAX_WIDTH, maxHeight = MAX_HEIGHT, quality = QUALITY } = {}) {
  const dec = await decodeScaled(file, maxWidth);
  const canvas = document.createElement('canvas');
  try {
    const scale = Math.min(1, maxWidth / dec.width, maxHeight / dec.height);
    const w = Math.max(1, Math.round(dec.width * scale));
    const h = Math.max(1, Math.round(dec.height * scale));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(dec.source, 0, 0, w, h);
    dec.release();
    // Skala szarości na pomniejszonym obrazie (mało danych)
    const px = ctx.getImageData(0, 0, w, h);
    const d = px.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0;
      d[i] = g;
      d[i + 1] = g;
      d[i + 2] = g;
    }
    ctx.putImageData(px, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    return { base64, mime: 'image/jpeg', width: w, height: h, bytes: Math.round((base64.length * 3) / 4), original: file.size };
  } finally {
    dec.release();
    canvas.width = 0;
    canvas.height = 0;
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

// ── Kaucja (system kaucyjny, od X 2025): 0,50 zł doliczane do każdego napoju w butelce / puszce ──
// Napój = kategoria „Napoje” bez produktów suchych i kartonów (kawa, herbata, kakao, syropy, napoje w proszku,
// soki / mleko w kartonie). Wiersze „KAUCJA” z paragonu są pomijane – zamiast nich kaucja trafia do napoju
// (bez podwójnego liczenia); it.deposit = doliczona kwota (podgląd i pamięć cen bez kaucji).
export const DEPOSIT = 0.5;
const NOT_DEPOSIT = /kaw|herbat|kakao|syrop|w proszku|rozpuszcz|karton|tetra|saszet|kapsuł|kapsul|instant/i;
export const isDepositName = (name) => /kaucj|opak(\.|owanie)? zwrotn/i.test(String(name || ''));
export const isDepositDrink = (it) => it?.category === 'Napoje' && !NOT_DEPOSIT.test(String(it.name || '')) && !isDepositName(it.name);
export const depositUnits = (q) => {
  const n = Number(q);
  return n >= 1 && Number.isInteger(n) ? Math.min(n, 99) : 1;
};
export function applyDeposits(receipt, on = true) {
  if (!on || !receipt?.items?.length) return receipt;
  const items = receipt.items
    .filter((it) => !isDepositName(it.name))
    .map((it) => {
      if (!isDepositDrink(it) || it.deposit) return it;
      const deposit = Math.round(DEPOSIT * depositUnits(it.quantity) * 100) / 100;
      return { ...it, price: Math.round(((Number(it.price) || 0) + deposit) * 100) / 100, deposit };
    });
  return { ...receipt, items };
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
// Udział użytkownika w pozycji: cała cena albo połowa (pozycja podzielona 50/50, np. ze współlokatorem)
const round2 = (v) => Math.round(v * 100) / 100;
export const itemShare = (it) => round2((Number(it.price) || 0) / (it.half ? 2 : 1));
// Podział paragonu na kategorie budżetu (kwoty po podziale 50/50): [{ id, amount }]
export function receiptParts(receipt) {
  const by = {};
  for (const it of receipt.items) {
    if (!it.rowId) continue;
    by[it.rowId] = round2((by[it.rowId] || 0) + itemShare(it));
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

// Sumy: sum – pełna suma pozycji (zgodność z „SUMA PLN” z paragonu), share – Twoja część (po podziale 50/50,
// trafia do budżetu), halved – kwota oddana drugiej osobie; byCategory – Twoja część per kategoria budżetu
export function receiptTotals(receipt, rows = []) {
  const by = {};
  let sum = 0;
  let share = 0;
  for (const it of receipt.items) {
    const p = round2(Number(it.price) || 0);
    const mine = itemShare(it);
    sum += p;
    share += mine;
    const key = rows.find((r) => r.id === it.rowId)?.name || it.category || 'Bez kategorii';
    by[key] = round2((by[key] || 0) + mine);
  }
  sum = round2(sum);
  share = round2(share);
  const printed = Number(receipt.total) || 0;
  return { sum, share, halved: round2(sum - share), byCategory: by, printed, diff: printed ? round2(printed - sum) : 0 };
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
