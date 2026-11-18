// Zużycie AI (Ustawienia → Powiadomienia i AI → Zużycie AI): liczba zapytań i tokeny (wejściowe / wyjściowe – z odpowiedzi
// modeli, pole `aiUsage` od serwera) per funkcja i miesiąc, wywołania modelu per dzień (stopień wykorzystania dziennego
// limitu darmowego klucza). Zapis na tym urządzeniu (`fintrack-ai-usage-v1`), 12 miesięcy / 40 dni. Odpowiedzi z pamięci
// serwera (cached) liczone osobno – bez tokenów.
export const USAGE_KEY = 'fintrack-ai-usage-v1';
export const USAGE_EVENT = 'fintrack-ai-usage';

export const USAGE_CATEGORIES = [
  { id: 'earnings', label: 'Analityk spółek', hint: 'analizy wyników, esencje PDF, interpretacje', modes: ['earnings', 'earnings-interpret'] },
  { id: 'shopping', label: 'Zakupy', hint: 'inteligentne ceny i kategorie produktów', modes: ['shopping-prices', 'shopping'] },
  { id: 'budget', label: 'Budżet i paragony', hint: 'paragony, podsumowania, statystyki budżetu', modes: ['receipt', 'budget', 'budget-stats'] },
  { id: 'news', label: 'Newsy', hint: 'podsumowania artykułów i dnia', modes: ['article', 'digest'] },
  { id: 'other', label: 'Zadania i przegląd tygodnia', hint: 'kategorie zadań, tygodniowy przegląd portfela', modes: ['tasks', 'weekly-review'] },
];
const catOf = (mode) => USAGE_CATEGORIES.find((c) => c.modes.includes(mode))?.id || 'other';

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const usageMonthKey = (d = new Date()) => dayKey(d).slice(0, 7);

export function readUsage() {
  try {
    const v = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
    return v && typeof v === 'object' ? { months: v.months || {}, days: v.days || {}, limit: v.limit } : { months: {}, days: {} };
  } catch {
    return { months: {}, days: {} };
  }
}
function writeUsage(u) {
  const months = Object.fromEntries(Object.entries(u.months).sort().slice(-12));
  const days = Object.fromEntries(Object.entries(u.days).sort().slice(-40));
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify({ ...u, months, days }));
    window.dispatchEvent(new CustomEvent(USAGE_EVENT));
  } catch {
    // brak localStorage – bez statystyk
  }
}

// Zapis jednej odpowiedzi serwera AI: mode – tryb zapytania, body – odpowiedź (aiUsage, cached), ok – czy udana
export function recordAiUsage(mode, body = {}, ok = true, now = new Date()) {
  try {
    const u = readUsage();
    const m = usageMonthKey(now);
    const month = u.months[m] || {};
    const c = month[catOf(mode)] || { requests: 0, cached: 0, errors: 0, calls: 0, in: 0, out: 0 };
    const usage = body?.aiUsage;
    if (!ok) c.errors += 1;
    else if (body?.cached) c.cached += 1;
    else c.requests += 1;
    if (usage) {
      c.calls += Number(usage.calls) || 0;
      c.in += Number(usage.in) || 0;
      c.out += Number(usage.out) || 0;
      const models = month._models || {};
      if (usage.model) models[`${usage.provider || ''}:${usage.model}`] = (models[`${usage.provider || ''}:${usage.model}`] || 0) + (Number(usage.calls) || 1);
      month._models = models;
      const d = dayKey(now);
      u.days[d] = (u.days[d] || 0) + (Number(usage.calls) || 0);
    }
    month[catOf(mode)] = c;
    u.months[m] = month;
    writeUsage(u);
  } catch {
    // licznik nigdy nie przeszkadza w działaniu AI
  }
}

export function setDailyLimit(limit) {
  const u = readUsage();
  writeUsage({ ...u, limit: Math.max(1, Math.round(Number(limit) || 0)) || undefined });
}
export function clearUsage() {
  writeUsage({ months: {}, days: {}, limit: readUsage().limit });
}

// Podsumowanie miesiąca: { total: { requests, cached, errors, calls, in, out }, byCat: [{ ...kategoria, ...liczby }], models }
export function monthUsage(u, month) {
  const data = u.months[month] || {};
  const zero = { requests: 0, cached: 0, errors: 0, calls: 0, in: 0, out: 0 };
  const byCat = USAGE_CATEGORIES.map((c) => ({ ...c, ...zero, ...(data[c.id] || {}) }));
  const total = byCat.reduce((t, c) => Object.fromEntries(Object.keys(zero).map((k) => [k, t[k] + c[k]])), zero);
  return { total, byCat, models: data._models || {} };
}
export const todayCalls = (u, now = new Date()) => u.days[dayKey(now)] || 0;

// Orientacyjny koszt w płatnym planie (USD): stawki jak Gemini 2.5 Flash – 0,30 $ / 1 mln tokenów wejściowych,
// 2,50 $ / 1 mln wyjściowych (z „myśleniem”). Przy darmowym kluczu faktyczny koszt = 0.
export const PAID_RATES = { in: 0.3, out: 2.5 };
export const estimateCostUsd = (t) => (t.in * PAID_RATES.in + t.out * PAID_RATES.out) / 1e6;
