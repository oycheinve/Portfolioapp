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
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Doba limitów: dzienne limity Gemini odnawiają się o północy czasu pacyficznego (ok. 9:00 w Polsce) – liczniki dzienne
// w tej strefie, żeby „dziś” zgadzało się z limitem dostawcy
const dayKey = (d = new Date()) => {
  try {
    return d.toLocaleDateString('sv', { timeZone: 'America/Los_Angeles' });
  } catch {
    return localDay(d);
  }
};
export const usageMonthKey = (d = new Date()) => localDay(d).slice(0, 7);

export function readUsage() {
  try {
    const v = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
    return v && typeof v === 'object' ? { months: v.months || {}, days: v.days || {}, dayModels: v.dayModels || {}, learned: v.learned || {}, warned: v.warned || {}, limit: v.limit } : { months: {}, days: {}, dayModels: {}, learned: {}, warned: {} };
  } catch {
    return { months: {}, days: {}, dayModels: {}, learned: {}, warned: {} };
  }
}
function writeUsage(u) {
  const months = Object.fromEntries(Object.entries(u.months).sort().slice(-12));
  const days = Object.fromEntries(Object.entries(u.days).sort().slice(-40));
  const dayModels = Object.fromEntries(Object.entries(u.dayModels || {}).sort().slice(-3));
  const warned = Object.fromEntries(Object.entries(u.warned || {}).filter(([k]) => k.startsWith(dayKey())));
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify({ ...u, months, days, dayModels, warned }));
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
      // Per model dziś (dzienne limity) + rzeczywiste limity od dostawcy (nagłówki Groq, komunikat Google przy 429)
      const dm = (u.dayModels[d] ||= {});
      for (const b of Array.isArray(usage.byModel) ? usage.byModel : []) {
        const k = modelId(b.provider, b.model);
        const x = (dm[k] ||= { calls: 0, in: 0, out: 0 });
        x.calls += Number(b.calls) || 0;
        x.in += Number(b.in) || 0;
        x.out += Number(b.out) || 0;
        if (b.limits || b.limitHit) {
          const l = { ...(u.learned[k] || {}) };
          if (b.limits) Object.assign(l, { rpd: b.limits.rpd ?? l.rpd, rpdLeft: b.limits.rpdLeft, tpm: b.limits.tpm ?? l.tpm, leftAt: d });
          if (b.limitHit) {
            l.hitDay = d;
            l.hitKind = b.limitHit.kind;
            l.hitCertain = !!b.limitHit.certain; // Google podał rodzaj limitu (dzienny / minutowy)
            if (b.limitHit.kind === 'rpd' && b.limitHit.value) l.rpd = b.limitHit.value;
          }
          u.learned[k] = l;
        }
      }
    }
    month[catOf(mode)] = c;
    u.months[m] = month;
    // Ostrzeżenie raz dziennie per model: ≥ 80% dziennego limitu albo limit przekroczony (429)
    for (const st of modelStatus(u, now)) {
      const level = st.hit ? 'hit' : st.ratio >= 0.95 ? '95' : st.ratio >= 0.8 ? '80' : '';
      const wk = `${dayKey(now)}|${st.key}|${level}`;
      if (!level || u.warned[wk]) continue;
      u.warned[wk] = 1;
      notifier?.(st.hit ? `⚠️ AI: wyczerpany dzienny limit ${st.label} – aplikacja przełącza się na kolejne modele (limit odnawia się ok. 9:00 czasu polskiego)` : `⚠️ AI: ${st.label} – wykorzystano ${Math.round(st.ratio * 100)}% dziennego limitu (${st.used} z ${st.rpd})`, 'warn');
    }
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

// ── Darmowe limity modeli ──
// Orientacyjne limity darmowych kluczy wg zestawień z 10.2026 (Google nie gwarantuje ich i zmienia bez zapowiedzi;
// Groq – na koncie). Rzeczywiste wartości odczytane od dostawcy (nagłówki Groq, komunikat Google przy przekroczeniu)
// mają pierwszeństwo. rpd – zapytania / doba, rpm – na minutę, tpm – tokeny / minutę, tpd – tokeny / doba.
export const FREE_LIMITS = [
  { test: /^gemini:gemini-2\.5-flash-lite/, label: 'Gemini 2.5 Flash-Lite', rpd: 20, rpm: 10, tpm: 250000 },
  { test: /^gemini:gemini-2\.5-flash/, label: 'Gemini 2.5 Flash', rpd: 20, rpm: 5, tpm: 250000 },
  { test: /^gemini:gemini-.*flash-lite/, label: 'Gemini Flash-Lite', rpd: 500, rpm: 15, tpm: 250000 },
  { test: /^gemini:gemini-.*flash/, label: 'Gemini Flash', rpd: 20, rpm: 5, tpm: 250000 },
  { test: /^gemini:gemini-.*pro/, label: 'Gemini Pro', rpd: 0, rpm: 0 },
  { test: /^groq:llama-3\.1-8b-instant/, label: 'Groq Llama 3.1 8B', rpd: 14400, rpm: 30, tpm: 6000, tpd: 500000 },
  { test: /^groq:openai\/gpt-oss-120b/, label: 'Groq GPT-OSS 120B', rpd: 1000, rpm: 30, tpm: 8000, tpd: 200000 },
  { test: /^groq:openai\/gpt-oss-20b/, label: 'Groq GPT-OSS 20B', rpd: 1000, rpm: 30, tpm: 8000, tpd: 200000 },
  { test: /^groq:meta-llama\/llama-4-scout/, label: 'Groq Llama 4 Scout', rpd: 1000, rpm: 30, tpm: 30000, tpd: 500000 },
  { test: /^groq:llama-3\.3-70b/, label: 'Groq Llama 3.3 70B', rpd: 1000, rpm: 30, tpm: 12000 },
  { test: /^openrouter:/, label: 'OpenRouter (darmowe)', rpd: 50, rpm: 20 },
];
export const LIMITS_AS_OF = '10.2026';
const modelId = (provider, model) => `${provider || ''}:${String(model || '').replace(/^models\//, '')}`;
export const knownLimit = (key) => FREE_LIMITS.find((l) => l.test.test(key)) || null;
let notifier = null;
export const setUsageNotifier = (fn) => {
  notifier = fn;
};

// Stan modeli używanych dziś (i w tym miesiącu): wykorzystanie dziennego limitu, przekroczenie, źródło limitu
export function modelStatus(u, now = new Date()) {
  const d = dayKey(now);
  const today = u.dayModels?.[d] || {};
  const monthModels = Object.keys(u.months?.[usageMonthKey(now)]?._models || {});
  const keys = [...new Set([...Object.keys(today), ...monthModels, ...Object.keys(u.learned || {}).filter((k) => u.learned[k].hitDay === d)])];
  return keys
    .map((key) => {
      const known = knownLimit(key);
      const l = u.learned?.[key] || {};
      const used = today[key]?.calls || 0;
      const tokens = (today[key]?.in || 0) + (today[key]?.out || 0);
      // Groq: pozostało wg nagłówka z dzisiejszej odpowiedzi – dokładniejsze niż własny licznik (inne urządzenia)
      const rpd = l.rpd || known?.rpd || null;
      const usedReal = l.leftAt === d && l.rpd && l.rpdLeft !== null && l.rpdLeft !== undefined ? Math.max(used, l.rpd - l.rpdLeft) : used;
      // „Wyczerpany” tylko, gdy Google wprost wskazał limit dzienny (wcześniejsze niepewne oznaczenia – ignorowane)
      const hit = l.hitDay === d && l.hitKind === 'rpd' && l.hitCertain === true;
      const fromProvider = l.rpd && (l.hitCertain || l.leftAt);
      return { key, label: known?.label || key.split(':').slice(1).join(':'), provider: key.split(':')[0], used: usedReal, tokens, rpd: fromProvider ? l.rpd : known?.rpd ?? l.rpd ?? null, rpm: known?.rpm ?? null, tpm: l.tpm || known?.tpm || null, tpd: known?.tpd || null, ratio: hit ? 1 : (fromProvider ? l.rpd : known?.rpd) ? usedReal / (fromProvider ? l.rpd : known.rpd) : 0, hit, minuteLimit: l.hitDay === d && (l.hitKind === 'rpm' || l.hitKind === 'tpm'), source: fromProvider ? 'od dostawcy' : known ? `zestawienia ${LIMITS_AS_OF}` : 'nieznany' };
    })
    // Ten sam model pod aliasem i nazwą wersji (np. gemini-flash-latest → gemini-3.5-flash) – jeden wiersz
    .reduce((acc, m) => {
      const same = acc.find((x) => x.label === m.label && x.provider === m.provider);
      if (!same) return [...acc, m];
      same.used += m.used;
      same.tokens += m.tokens;
      same.hit = same.hit || m.hit;
      if (m.source === 'od dostawcy') Object.assign(same, { rpd: m.rpd || same.rpd, source: m.source });
      same.ratio = same.hit ? 1 : same.rpd ? same.used / same.rpd : 0;
      return acc;
    }, [])
    .sort((a, b) => b.ratio - a.ratio || b.used - a.used);
}
