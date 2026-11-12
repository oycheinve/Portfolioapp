// Tygodniowy przegląd portfela (AI, BETA): raz w tygodniu – w niedzielę albo w poniedziałek przy otwarciu aplikacji –
// zestaw danych z portfela inwestycyjnego (zmiana w tygodniu, największe ruchy spółek, dywidendy, kamienie milowe,
// nagłówki newsów z tygodnia bez szumu) trafia do AI, które pisze krótki komentarz. Zapis per użytkownik
// (`wealth-app-weekly-review-v1`, urządzenie + chmura), ostatnie 12 tygodni; klucz = data niedzieli kończącej tydzień.
import { PREFS_CHANGED_EVENT, budgetTotals, isTransferRow, monthKey, readBudget, readBudgetLog, shiftMonth } from './budget.js';
import { computeHoldings, computePeriodStats, incomeEventsWithTax, isoDay } from './engine.js';
import { createPriceResolver } from './history.js';
import { dividendKpis } from './dividends.js';
import { MILESTONE_TRACKS, readMilestones, trackStatus } from './milestones.js';
import { fetchNewsMany, heldNewsTopics } from './news.js';
import { isNoiseTitle } from './newsFilter.js';
import { GENERAL_ID, classifyArticle } from './newsSubject.js';
import { requestWeeklyReview } from './newsAi.js';

export const WEEKLY_KEY = 'wealth-app-weekly-review-v1';
const ATTEMPT_KEY = 'fintrack-weekly-review-attempt';
const KEEP = 12;

const pad = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Niedziela kończąca bieżący tydzień przeglądu: dziś (niedziela) albo ostatnia niedziela
export function reviewSunday(today = new Date()) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  d.setDate(d.getDate() - d.getDay());
  return local(d);
}
// Okres przeglądu do podpisu: zapisany okres danych („RRRR-MM-DD – RRRR-MM-DD”), a gdy brak – tydzień kończący się w niedzielę
export const periodLabel = (period) => {
  const [a, b] = String(period || '').split(' – ');
  if (!a || !b) return '';
  const f = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
  return `${f(a)} – ${f(b)}`;
};
export const weekLabel = (sunday) => {
  const end = new Date(`${sunday}T12:00:00`);
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  const f = (d) => d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
  return `${f(start)} – ${f(end)}`;
};

export function readWeekly() {
  try {
    const v = JSON.parse(localStorage.getItem(WEEKLY_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
function writeWeekly(all) {
  const kept = Object.fromEntries(Object.entries(all).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, KEEP));
  try {
    localStorage.setItem(WEEKLY_KEY, JSON.stringify(kept));
    window.dispatchEvent(new CustomEvent(PREFS_CHANGED_EVENT, { detail: { key: WEEKLY_KEY } }));
  } catch {
    // brak localStorage
  }
  return kept;
}

const r1 = (v) => Math.round(v * 10) / 10;
const r0 = (v) => Math.round(v);

// Dane tygodnia (ostatnie 7 dni do dziś) – liczby z aplikacji, bez danych osobowych
export async function weeklyData(state, now = new Date()) {
  const today = isoDay(now);
  const start = isoDay(new Date(now.getTime() - 7 * 86400000));
  const resolver = createPriceResolver(state);
  const week = computePeriodStats(state, { period: '1W', filter: 'INVEST', priceAt: resolver.instrumentPLN, preferHistory: true });
  const all = computePeriodStats(state, { period: 'ALL', filter: 'INVEST', priceAt: resolver.instrumentPLN, preferHistory: true });
  // Ruchy spółek / ETF-ów: cena dziś vs 7 dni temu (PLN), ilość z wszystkich kont
  const qty = new Map();
  for (const h of computeHoldings(state, today, null)) if (h.quantity > 1e-9 && h.instrument) qty.set(h.instrument.id, { inst: h.instrument, q: (qty.get(h.instrument.id)?.q || 0) + h.quantity });
  const moves = [];
  for (const { inst, q } of qty.values()) {
    const p0 = resolver.instrumentPLN(inst, start);
    const p1 = resolver.instrumentPLN(inst, today);
    if (!(p0 > 0) || !(p1 > 0)) continue;
    moves.push({ ticker: inst.ticker || inst.name, name: inst.name, zmiana_proc: r1(((p1 - p0) / p0) * 100), zmiana_zl: r0((p1 - p0) * q) });
  }
  moves.sort((a, b) => Math.abs(b.zmiana_zl) - Math.abs(a.zmiana_zl));
  const dividends = incomeEventsWithTax(state)
    .filter((i) => i.type === 'DIVIDEND' && i.date > start && i.date <= today)
    .map((i) => ({ spolka: state.instruments.find((x) => x.id === i.instrumentId)?.ticker || '', netto_zl: r0(i.net) }));
  const values = { contrib: all.contributionsAll || 0, gain: Math.max(0, all.totalReturn || 0), gainPct: Math.max(0, (all.totalReturnPct || 0) * 100), dividends: dividendKpis(state).last12Net || 0 };
  const saved = readMilestones();
  const milestones = MILESTONE_TRACKS.map((t) => {
    const s = trackStatus(t, values[t.id], saved);
    return { sciezka: t.label, wartosc: r0(s.value), nastepny_prog: s.next ? s.next.value : null, postep_proc: r0(s.progress * 100) };
  });
  let news = [];
  try {
    const topics = heldNewsTopics(state);
    const byId = Object.fromEntries(topics.map((t) => [t.id, t.label]));
    const { items } = await fetchNewsMany(topics, { force: false });
    // Spółka = główny podmiot tytułu (jak w Newsach), bez „Analiz ogólnych” i szumu konsumenckiego
    news = items
      .filter((it) => it.pubDate && it.pubDate.slice(0, 10) > start && !isNoiseTitle(it.title))
      .map((it) => ({ it, main: classifyArticle(it, topics).mainId }))
      .filter((x) => x.main !== GENERAL_ID && byId[x.main])
      .slice(0, 20)
      .map(({ it, main }) => ({ spolka: byId[main], tytul: String(it.title).slice(0, 160) }));
  } catch {
    // bez newsów – przegląd z samych liczb
  }
  const budget = budgetWeek(state, now);
  return {
    okres: `${start} – ${today}`,
    ...(budget ? { budzet: budget } : {}),
    portfel: { wartosc_zl: r0(week.endValue || 0), zysk_tydzien_zl: r0(week.totalReturn || 0), stopa_tydzien_proc: r1((week.twr ?? week.totalReturnPct ?? 0) * 100), wplaty_tydzien_zl: r0(week.flowsInPeriod || 0), zysk_od_poczatku_zl: r0(all.totalReturn || 0) },
    ruchy_spolek: moves.slice(0, 8),
    dywidendy_w_tygodniu: dividends,
    kamienie_milowe: milestones,
    newsy: news,
  };
}

// Budżet w tygodniu: wydatki z dziennika (ostatnie 7 dni, także z końcówki poprzedniego miesiąca) według kategorii,
// i stan bieżącego miesiąca (plan / wydane / dni) – same fakty, bez prognoz kategorii (część opłacana z góry albo
// skokowo, środki bywają przesuwane między kategoriami). Bez
// „Z oszczędności” i kategorii-transferów. null – moduł Budżet ukryty albo brak danych.
export function budgetWeek(state, now = new Date()) {
  if (state?.settings?.modules?.budget === false) return null;
  const month = monthKey(now);
  const rows = readBudget()[month] || [];
  const log = readBudgetLog();
  const from = now.getTime() - 7 * 86400000;
  const transferIds = new Set(rows.filter(isTransferRow).map((r) => r.id));
  const entries = [...(log[month] || []), ...(log[shiftMonth(month, -1)] || [])].filter((e) => e && e.rowId !== '__savings' && !transferIds.has(e.rowId) && Date.parse(e.at) >= from);
  if (!rows.length && !entries.length) return null;
  const byCat = {};
  for (const e of entries) byCat[e.name || '?'] = (byCat[e.name || '?'] || 0) + (Number(e.amount) || 0);
  const t = budgetTotals(rows);
  const [y, m] = month.split('-').map(Number);
  return {
    wydane_w_tygodniu_zl: r0(entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)),
    wpisow_w_tygodniu: entries.length,
    kategorie_tygodnia: Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([kategoria, zl]) => ({ kategoria, zl: r0(zl) })),
    miesiac: { plan_zl: r0(t.planned), wydane_zl: r0(t.spent), pozostalo_zl: r0(t.left), dzien: now.getDate(), dni_w_miesiacu: new Date(y, m, 0).getDate() },
  };
}

export async function generateWeeklyReview(state, now = new Date()) {
  const data = await weeklyData(state, now);
  const res = await requestWeeklyReview(data);
  if (!res.review) throw new Error(res.error || 'Brak przeglądu');
  const key = reviewSunday(now);
  const entry = { review: res.review, period: data.okres, data: { portfel: data.portfel, ruchy: data.ruchy_spolek.slice(0, 4) }, at: new Date().toISOString() };
  writeWeekly({ ...readWeekly(), [key]: entry });
  return { key, entry };
}

// Automatycznie: w niedzielę albo poniedziałek, gdy przeglądu tego tygodnia jeszcze nie ma (próba raz dziennie)
export async function autoWeeklyReview(state, now = new Date()) {
  if (![0, 1].includes(now.getDay())) return null;
  const key = reviewSunday(now);
  if (readWeekly()[key]) return null;
  if (!state.trades?.length) return null;
  const stamp = `${key}|${isoDay(now)}`;
  try {
    if (localStorage.getItem(ATTEMPT_KEY) === stamp) return null;
    localStorage.setItem(ATTEMPT_KEY, stamp);
  } catch {
    // brak localStorage
  }
  return generateWeeklyReview(state, now);
}
