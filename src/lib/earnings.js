// Analityk wyników spółek (BETA) – dane wyłącznie od użytkownika (tekst, zrzuty, PDF). Dwa magazyny per użytkownik
// (urządzenie + chmura, ui_prefs po user_id):
// • `wealth-app-earnings-v1` – pełne analizy (opis, wskaźniki, ocena): retencja 12 miesięcy, unikalny klucz
//   [Spółka + Kwartał] – ponowna analiza tego samego kwartału nadpisuje wpis;
// • `wealth-app-earnings-history-v1` – własna historia liczb każdej spółki (kwartał po kwartale: przychody, zysk,
//   EBITDA, EPS i wskaźniki branżowe) – bez rotacji, rośnie z każdym wgranym raportem; źródło wykresów.
import { PREFS_CHANGED_EVENT } from './budget.js';

export const EARNINGS_KEY = 'wealth-app-earnings-v1';
export const RETENTION_DAYS = 365;

// Okres: „Q3 2026”, „3Q2026”, „III kw. 2026”, „2026 Q3”; rok obrotowy przesunięty (np. Synektik, X–IX): „1Q2025/26” →
// „Q1 2025/26” (sufiks roku obrotowego zachowany – inaczej Q1 2025/26 i Q1 2025 stałyby się tym samym okresem)
const normQuarter = (q) => {
  const t = String(q || '').toUpperCase().replace(/\s+/g, ' ').trim();
  const m = t.match(/(?:Q|KW\.?\s*)?([1-4])\s*(?:Q|KW\.?)?\s*[ /-]?\s*((?:19|20)\d{2})/) || t.match(/((?:19|20)\d{2})\s*[ /-]?\s*Q([1-4])/);
  if (!m) return t;
  const label = /^(19|20)\d{2}$/.test(m[1]) ? `Q${m[2]} ${m[1]}` : `Q${m[1]} ${m[2]}`;
  const fy = t.slice(m.index + m[0].length).match(/^\s*\/\s*(\d{4}|\d{2})\b/);
  return fy ? `${label}/${fy[1].slice(-2)}` : label;
};
const normCompany = (a) => String(a.ticker || a.company || '').toUpperCase().replace(/\.(WA|PL)$/, '').replace(/[^A-Z0-9ĄĆĘŁŃÓŚŹŻ]+/g, '');
export const earningsKey = (a) => `${normCompany(a)}|${normQuarter(a.quarter)}`;
export const companyKey = (a) => normCompany(a);
export const quarterLabel = normQuarter;

const fresh = (list, now = Date.now()) => list.filter((e) => e && e.key && now - new Date(e.at).getTime() < RETENTION_DAYS * 86400000);

export function readEarnings(now = Date.now()) {
  try {
    const v = JSON.parse(localStorage.getItem(EARNINGS_KEY) || '[]');
    return Array.isArray(v) ? fresh(v, now).sort((a, b) => String(b.at).localeCompare(String(a.at))) : [];
  } catch {
    return [];
  }
}
function writeEarnings(list) {
  try {
    localStorage.setItem(EARNINGS_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(PREFS_CHANGED_EVENT, { detail: { key: EARNINGS_KEY } }));
  } catch {
    // brak localStorage
  }
}
// Zapis analizy: rotacja (12 mies.) + nadpisanie wpisu o tym samym kluczu [Spółka + Kwartał]
export function saveEarnings({ analysis, sources = [], grounded = false, searchNote = '', model = '' }, now = Date.now()) {
  const key = earningsKey(analysis);
  const prev = readEarnings(now).find((e) => e.key === key);
  // Aktualizacja tych samych danych (np. nowa wersja danych startowych) zachowuje dopisaną wcześniej interpretację AI
  if (!analysis.interpretation && prev?.analysis?.interpretation && prev.model === model) analysis = { ...analysis, interpretation: prev.analysis.interpretation };
  const entry = { key, analysis, sources, grounded, ...(searchNote ? { searchNote } : {}), model, at: new Date(now).toISOString() };
  const list = readEarnings(now).filter((e) => e.key !== entry.key);
  writeEarnings([entry, ...list]);
  recordHistory(analysis, now);
  return entry;
}

// Pamięć analiz spółki dla AI: skróty zapisanych analiz (najnowszy okres pierwszy, max 6), bez okresu `skipKey`
// i opcjonalnie tylko starsze niż `beforeQuarter` (interpretacja zapisanej analizy – bez „przyszłych” okresów)
export function analysisMemory(company, { skipKey = '', beforeQuarter = '', now = Date.now() } = {}) {
  if (!company) return [];
  const limit = beforeQuarter ? periodOrder(beforeQuarter) : Infinity;
  return readEarnings(now)
    .filter((e) => companyKey(e.analysis) === company && e.key !== skipKey && periodOrder(e.analysis.quarter) < limit)
    .sort((x, y) => periodOrder(y.analysis.quarter) - periodOrder(x.analysis.quarter))
    .slice(0, 6)
    .map(({ analysis: a }) => ({ quarter: a.quarter, verdict: a.verdict, headline: a.headline, takeaway: a.interpretation?.takeaway || '', highlights: (a.highlights || []).slice(0, 3), risks: (a.risks || []).slice(0, 3), outlook: a.outlook || '' }));
}

// Dopisanie interpretacji AI do zapisanej analizy (bez zmiany daty zapisu i historii liczb)
export function setInterpretation(key, interpretation, extra = {}) {
  const list = readEarnings();
  const i = list.findIndex((e) => e.key === key);
  if (i < 0) return null;
  list[i] = { ...list[i], analysis: { ...list[i].analysis, ...extra, interpretation } };
  writeEarnings(list);
  return list[i];
}

// ── Historia spółek (bez rotacji) ──
export const EARNINGS_HISTORY_KEY = 'wealth-app-earnings-history-v1';
const BASE_FIELDS = ['revenue', 'netIncome', 'ebitda', 'eps'];
// Kolejność okresów (jak na serwerze): rok*10 + kwartał; H1 → 2, H2 / FY → 4
export function periodOrder(q) {
  const t = String(q || '').toUpperCase();
  const y4 = (t.match(/(?:19|20)\d{2}/) || [])[0];
  if (!y4) return 1e9;
  const rom = { I: 1, II: 2, III: 3, IV: 4 };
  const n = Number((t.match(/Q\s*([1-4])|([1-4])\s*Q/) || []).slice(1).find(Boolean)) || rom[(t.match(/\b(IV|III|II|I)\b/) || [])[1]] || (/\bH1\b|1H/.test(t) ? 2 : /\bH2\b|2H|\bFY\b|ROK/.test(t) ? 4 : 0);
  return Number(y4) * 10 + n;
}
const prevYearLabel = (q) => {
  const t = normQuarter(q);
  const fy = t.match(/^(.*?)((?:19|20)\d{2})\/(\d{2})$/); // rok obrotowy: Q1 2025/26 → Q1 2024/25
  if (fy) return `${fy[1]}${Number(fy[2]) - 1}/${String((Number(fy[3]) + 99) % 100).padStart(2, '0')}`;
  const m = t.match(/^(.*?)((?:19|20)\d{2})$/);
  return m ? `${m[1]}${Number(m[2]) - 1}` : '';
};
function readHistoryRaw() {
  try {
    const v = JSON.parse(localStorage.getItem(EARNINGS_HISTORY_KEY) || 'null');
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}
export function writeHistory(h) {
  try {
    localStorage.setItem(EARNINGS_HISTORY_KEY, JSON.stringify(h));
    window.dispatchEvent(new CustomEvent(PREFS_CHANGED_EVENT, { detail: { key: EARNINGS_HISTORY_KEY } }));
  } catch {
    // brak localStorage
  }
}
// Scalenie okresu: nowa wartość liczbowa zastępuje starą, brak danych (null) nie kasuje zapisanej
function mergePeriod(prev = {}, next = {}) {
  const out = { ...prev, quarter: next.quarter || prev.quarter };
  for (const f of BASE_FIELDS) if (next[f] !== null && next[f] !== undefined) out[f] = next[f];
  out.metrics = { ...(prev.metrics || {}) };
  for (const [name, m] of Object.entries(next.metrics || {})) if (m.value !== null && m.value !== undefined) out.metrics[name] = m;
  if (next.at) out.at = next.at;
  return out;
}
export function recordHistory(analysis, now = Date.now()) {
  const key = companyKey(analysis);
  if (!key) return null;
  const all = readHistory();
  const c = all[key] || { company: '', ticker: '', industry: '', unit: '', periods: {} };
  const at = new Date(now).toISOString();
  const upd = { company: analysis.company || c.company, ticker: analysis.ticker || c.ticker, industry: analysis.industry || c.industry, unit: analysis.unit || c.unit, periods: { ...c.periods } };
  const put = (label, data) => {
    const k = normQuarter(label);
    if (!k) return;
    upd.periods[k] = mergePeriod(upd.periods[k], { ...data, quarter: k });
  };
  for (const q of analysis.quarters || []) put(q.quarter, { revenue: q.revenue ?? null, netIncome: q.netIncome ?? null, ebitda: q.ebitda ?? null, eps: q.eps ?? null });
  const cur = {};
  const prev = {};
  // Ta sama pozycja co we wcześniejszych raportach (inna drobna różnica w nazwie) – zapis pod dotychczasową nazwą
  const known = new Map();
  for (const p of Object.values(c.periods || {})) for (const n of Object.keys(p.metrics || {})) if (!known.has(metricKey(n))) known.set(metricKey(n), n);
  const canon = (n) => known.get(metricKey(n)) || n;
  for (const m0 of analysis.metrics || []) {
    const m = { ...m0, name: canon(m0.name) };
    if (m.actual !== null && m.actual !== undefined) cur[m.name] = { value: m.actual, unit: m.unit || '', lowerIsBetter: !!m.lowerIsBetter };
    if (m.previous !== null && m.previous !== undefined) prev[m.name] = { value: m.previous, unit: m.unit || '', lowerIsBetter: !!m.lowerIsBetter };
  }
  put(analysis.quarter, { metrics: cur, at });
  const py = prevYearLabel(analysis.quarter);
  if (py && Object.keys(prev).length) put(py, { metrics: prev });
  all[key] = upd;
  writeHistory(all);
  return upd;
}
// Odczyt historii; przy pierwszym użyciu – zbudowana z zapisanych wcześniej analiz (zgodność wstecz)
export function readHistory() {
  const h = readHistoryRaw();
  if (h) return h;
  const built = {};
  writeHistory(built);
  for (const e of [...readEarnings()].reverse()) recordHistory(e.analysis, new Date(e.at).getTime());
  return readHistoryRaw() || {};
}
// Klucz wskaźnika niezależny od drobnych różnic w nazwie, które AI daje w kolejnych raportach: „Przychody ze sprzedaży”
// = „Przychody” = „Przychody netto ze sprzedaży”, „Marża EBITDA (%)” = „Marża EBITDA”, „EBITDA raportowana” = „EBITDA”
// (bez łączenia różnych pojęć: „EBITDA skorygowana”, „Zysk netto” i „Zysk operacyjny” zostają osobno)
export function metricKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/%/g, ' ')
    .replace(/\b(ze sprzedazy|skonsolidowan\w*|raportowan\w*|ogolem|lacznie|razem|grupy|gk|w mln \w+|mln \w+|tys \w+)\b/g, ' ')
    .replace(/^(\s*przychody)\s+netto\b/, '$1')
    .replace(/[^a-z0-9/]+/g, ' ')
    .trim();
}
// Nazwy wskaźników spółki scalone po kluczu: dla każdego klucza – nazwa najczęstsza w historii
function metricAliases(periods) {
  const byKey = new Map();
  for (const p of periods) for (const n of Object.keys(p.metrics || {})) {
    const k = metricKey(n) || n;
    if (!byKey.has(k)) byKey.set(k, new Map());
    const m = byKey.get(k);
    m.set(n, (m.get(n) || 0) + 1);
  }
  const alias = {};
  for (const m of byKey.values()) {
    const best = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
    for (const n of m.keys()) alias[n] = best;
  }
  return alias;
}
const BASE_FROM_METRIC = { revenue: 'przychody', netIncome: 'zysk netto', ebitda: 'ebitda' };
// Okresy spółki od najstarszego; wskaźniki o tym samym znaczeniu pod jedną nazwą (wykresy KPI ciągłe także dla starszych
// zapisów), a brakujące przychody / zysk netto / EBITDA okresu uzupełnione z jego wskaźników
export function companyPeriods(company) {
  const periods = Object.values(company?.periods || {}).sort((a, b) => periodOrder(a.quarter) - periodOrder(b.quarter));
  const alias = metricAliases(periods);
  return periods.map((p) => {
    const metrics = {};
    // nazwa kanoniczna ma pierwszeństwo przed wariantem w tym samym okresie
    const names = Object.keys(p.metrics || {}).sort((a, b) => (alias[a] === a ? 1 : 0) - (alias[b] === b ? 1 : 0));
    for (const n of names) metrics[alias[n] || n] = p.metrics[n];
    const out = { ...p, metrics };
    for (const [f, key] of Object.entries(BASE_FROM_METRIC)) {
      if (out[f] !== null && out[f] !== undefined) continue;
      const hit = Object.entries(metrics).find(([n, m]) => metricKey(n) === key && m?.unit !== '%' && Number.isFinite(Number(m?.value)));
      if (hit) out[f] = Number(hit[1].value);
    }
    return out;
  });
}
// Nazwy wskaźników z historii spółki (najczęstsze najpierw) – AI używa ich dla tych samych pozycji w kolejnych raportach
export function companyMetricNames(company, limit = 40) {
  const count = {};
  for (const p of companyPeriods(company)) for (const n of Object.keys(p.metrics || {})) count[n] = (count[n] || 0) + 1;
  return Object.entries(count)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([n]) => n);
}
export function deleteCompanyHistory(key) {
  const all = readHistory();
  delete all[key];
  writeHistory(all);
}
export function deleteEarnings(key) {
  writeEarnings(readEarnings().filter((e) => e.key !== key));
}
// Punkt odniesienia wiersza: konsensus, a gdy go brak – ten sam okres rok wcześniej (ocena r/r: > 2%, dla % > 0,5 p.p.;
// „mniej = lepiej” odwrotnie). Dzięki temu pozycje bez konsensusu (np. przychody, marże) nie zostają „bez oceny”.
export function metricRef(m) {
  const has = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));
  if (has(m.consensus)) return { ref: Number(m.consensus), kind: 'consensus', verdict: m.verdict };
  if (!has(m.previous) || !has(m.actual)) return { ref: null, kind: null, verdict: m.verdict };
  const prev = Number(m.previous);
  let verdict = m.verdict;
  if (!verdict || verdict === 'unknown') {
    const pct = m.unit === '%';
    const d = pct ? m.actual - prev : prev ? (m.actual - prev) / Math.abs(prev) : null;
    const better = d === null ? null : m.lowerIsBetter ? -d : d;
    const th = pct ? 0.5 : 0.02;
    verdict = better === null ? 'unknown' : better > th ? 'beat' : better < -th ? 'miss' : 'inline';
  }
  return { ref: prev, kind: 'previous', verdict };
}
// Odchylenie od konsensusu (%), gdy oba znane
export const surprise = (actual, consensus) => (actual === null || consensus === null || !consensus ? null : ((actual - consensus) / Math.abs(consensus)) * 100);
