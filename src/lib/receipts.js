// Paragony (BETA): kompresja zdjęcia w aplikacji (mniejsza rozdzielczość, skala szarości, JPEG) → skrót SHA-256 →
// lokalna pamięć wyników (ten sam paragon = koszt AI 0) → AI (OCR, czysty JSON) → kategorie pozycji najpierw z uczącej
// się pamięci produktów (shoppingCategories.js), potem z AI → ekran weryfikacji (albo zapis automatyczny) → zapis
// w budżecie i historii; poprawki kategorii zapisywane w pamięci (samouczenie). Dane per użytkownik.
import { categoryOf, readCats, remember, resolveLocal, writeCats } from './shoppingCategories.js';
import { PREFS_CHANGED_EVENT } from './budget.js';

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

// Sumy: pozycji, częściowe per kategoria; zgodność z „SUMA PLN” z paragonu
export function receiptTotals(receipt) {
  const by = {};
  let sum = 0;
  for (const it of receipt.items) {
    const p = Math.round((Number(it.price) || 0) * 100) / 100;
    sum += p;
    by[it.category] = Math.round(((by[it.category] || 0) + p) * 100) / 100;
  }
  sum = Math.round(sum * 100) / 100;
  const printed = Number(receipt.total) || 0;
  return { sum, byCategory: by, printed, diff: printed ? Math.round((printed - sum) * 100) / 100 : 0 };
}

// Samouczenie: zapis kategorii pozycji w pamięci produktów – poprawione przez użytkownika jako 'user'
export function learnFromReceipt(receipt) {
  let mem = readCats();
  for (const it of receipt.items) {
    const corrected = it.edited || (it.aiCategory && it.category !== it.aiCategory && it.source === 'ai');
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
