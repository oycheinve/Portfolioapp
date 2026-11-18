// ═══ MODUŁ ODPINANY: Statystyki budżetu (AI w tle) ═══
// Statystyki z Budżetu (`wealth-app-budget-v1` – plan / wydane, `wealth-app-budget-log-v1` – zakupy) i historii zmian
// planu w trakcie miesiąca (zapisywanej tu, `wealth-app-budget-plan-history-v1`), plus analiza AI odświeżana w tle
// (`wealth-app-budget-stats-ai-v1`). Jak usunąć cały moduł – README → „Statystyki budżetu” (lista plików i linii).
// Bez kategorii-transferów (Inwestycje / Oszczędności) i bez „Z oszczędności”. Kategorie łączone między miesiącami
// po nazwie. Kategorie stałe / opłacane z góry (typ „Stałe koszty” albo średnio ≤ 1,5 zakupu w miesiącu) – bez
// dziennych limitów i bez oceny tempa (np. bilet miesięczny, abonament); skokowe (< 6 zakupów w miesiącu, np. przejazdy
// w weekendy) – oceniane w skali miesiąca, bez limitów dziennych.
import { PREFS_CHANGED_EVENT, BUDGET_KEY, BUDGET_LOG_KEY, isTransferRow, monthKey, readBudget, readBudgetLog, shiftMonth } from './budget.js';

export const PLAN_HISTORY_KEY = 'wealth-app-budget-plan-history-v1';
export const STATS_AI_KEY = 'wealth-app-budget-stats-ai-v1';
const MAX_MONTHS = 12;
const AI_MIN_GAP_MS = 6 * 3600 * 1000; // analiza AI w tle najwyżej co 6 h (i tylko przy zmianie danych)

const num = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const r2 = (v) => Math.round(v * 100) / 100;
// Poza wydatkami: transfery na konta oszczędnościowe i kategorie typu Inwestycje / Oszczędności (to odkładanie, nie koszt)
const notSpending = (r) => isTransferRow(r) || r.type === 'Inwestycje' || r.type === 'Oszczędności';
const catKey = (name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
const daysIn = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo, 0).getDate();
};
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const stdev = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};
const quantile = (a, q) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
};
const read = (k, d) => {
  try {
    const v = JSON.parse(localStorage.getItem(k) || 'null');
    return v && typeof v === 'object' ? v : d;
  } catch {
    return d;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    window.dispatchEvent(new CustomEvent(PREFS_CHANGED_EVENT, { detail: { key: k } }));
  } catch {
    // brak localStorage
  }
};

// ── Historia zmian planu w trakcie miesiąca ──
// { [miesiąc]: { [kategoria]: [{ d: 'RRRR-MM-DD', p: plan }] } } – nowy punkt tylko przy zmianie planu kategorii
export const readPlanHistory = () => read(PLAN_HISTORY_KEY, {});
export function trackPlanChanges(budget = readBudget(), now = new Date()) {
  const hist = readPlanHistory();
  const today = now.toLocaleDateString('sv');
  const cur = monthKey(now);
  let changed = false;
  // śledzone: bieżący i poprzedni miesiąc (zmiany założeń „w trakcie”), wcześniejsze – bez zmian
  for (const m of [shiftMonth(cur, -1), cur]) {
    const rows = (budget[m] || []).filter((r) => String(r.name || '').trim() && !notSpending(r));
    if (!rows.length) continue;
    const mh = hist[m] || {};
    for (const r of rows) {
      const k = catKey(r.name);
      const p = r2(num(r.planned));
      const list = mh[k] || [];
      if (!list.length || list[list.length - 1].p !== p) {
        mh[k] = [...list, { d: today, p }].slice(-40);
        changed = true;
      }
    }
    hist[m] = mh;
  }
  if (changed) {
    const keep = Object.keys(hist).sort().slice(-MAX_MONTHS);
    write(PLAN_HISTORY_KEY, Object.fromEntries(keep.map((m) => [m, hist[m]])));
  }
  return changed;
}

// ── Statystyki ──
export function computeBudgetStats(now = new Date(), budget = readBudget(), log = readBudgetLog(), planHist = readPlanHistory()) {
  const cur = monthKey(now);
  const months = [...new Set([...Object.keys(budget), ...Object.keys(log)])]
    .filter((m) => /^\d{4}-\d{2}$/.test(m) && m <= cur)
    .sort()
    .slice(-MAX_MONTHS);
  const cats = new Map(); // key → { name, type, byMonth: { m: { planned, spent, purchases, logSum, days: {d: sum} } } }
  const monthRows = [];
  for (const m of months) {
    const rows = (budget[m] || []).filter((r) => String(r.name || '').trim());
    const spendRows = rows.filter((r) => !notSpending(r));
    const transferIds = new Set(rows.filter(notSpending).map((r) => r.id));
    const byId = Object.fromEntries(spendRows.map((r) => [r.id, r]));
    for (const r of spendRows) {
      const k = catKey(r.name);
      if (!cats.has(k)) cats.set(k, { key: k, name: r.name.trim(), type: r.type || '', byMonth: {} });
      const c = cats.get(k);
      c.name = r.name.trim();
      c.type = r.type || c.type;
      c.byMonth[m] = { planned: num(r.planned), spent: num(r.spent), purchases: 0, logSum: 0, days: {} };
    }
    let purchases = 0;
    for (const e of log[m] || []) {
      if (!e || e.rowId === '__savings' || transferIds.has(e.rowId)) continue;
      const row = byId[e.rowId];
      const c = row ? cats.get(catKey(row.name)) : cats.get(catKey(e.name));
      if (!c?.byMonth[m]) continue;
      const amount = num(e.amount);
      const b = c.byMonth[m];
      b.purchases += 1;
      b.logSum += amount;
      const d = e.at ? new Date(e.at).toLocaleDateString('sv') : '';
      if (d) b.days[d] = (b.days[d] || 0) + amount;
      purchases += 1;
    }
    const planned = spendRows.reduce((s, r) => s + num(r.planned), 0);
    const spent = spendRows.reduce((s, r) => s + num(r.spent), 0);
    // Zmiany planu w miesiącu (z historii zapisywanej przez trackPlanChanges)
    const ph = planHist[m] || {};
    let changes = 0;
    let firstTotal = 0;
    let lastTotal = 0;
    for (const list of Object.values(ph)) {
      changes += Math.max(0, list.length - 1);
      firstTotal += list[0]?.p || 0;
      lastTotal += list[list.length - 1]?.p || 0;
    }
    monthRows.push({ month: m, current: m === cur, planned: r2(planned), spent: r2(spent), diff: r2(spent - planned), purchases, avgPurchase: purchases ? r2(spent / purchases) : null, planChanges: Object.keys(ph).length ? { changes, from: r2(firstTotal), to: r2(lastTotal), delta: r2(lastTotal - firstTotal) } : null });
  }

  const elapsed = now.getDate();
  const daysCur = daysIn(cur);
  const daysLeft = daysCur - elapsed + 1; // z dzisiejszym
  const categories = [...cats.values()].map((c) => {
    const past = months.filter((m) => m !== cur && c.byMonth[m] && (c.byMonth[m].planned > 0 || c.byMonth[m].spent > 0));
    const spentArr = past.map((m) => c.byMonth[m].spent);
    const purchArr = past.map((m) => c.byMonth[m].purchases);
    const dayArr = past.flatMap((m) => Object.values(c.byMonth[m].days));
    const meanSpent = mean(spentArr);
    const sd = stdev(spentArr);
    const now0 = c.byMonth[cur] || null;
    const avgPurch = mean(purchArr.length ? purchArr : now0 ? [now0.purchases] : []);
    const fixed = c.type === 'Stałe koszty' || avgPurch <= 1.5;
    // Skokowe (kilka zakupów w miesiącu, np. weekendowe przejazdy) – oceniane w skali miesiąca, bez limitów dziennych
    const lumpy = !fixed && avgPurch < 6;
    const daily = !fixed && !lumpy;
    const overMonths = past.filter((m) => c.byMonth[m].spent > c.byMonth[m].planned + 0.01 && c.byMonth[m].planned > 0).length;
    const logSum = past.reduce((s, m) => s + c.byMonth[m].logSum, 0);
    const logCount = past.reduce((s, m) => s + c.byMonth[m].purchases, 0);
    const avgDaysPast = past.length ? mean(past.map(daysIn)) : 30;
    // Bieżący miesiąc: dzienny limit do końca miesiąca (z planu) – tylko kategorie zmienne
    let today = null;
    if (now0) {
      const left = now0.planned - now0.spent;
      today = {
        planned: r2(now0.planned),
        spent: r2(now0.spent),
        purchases: now0.purchases,
        left: r2(left),
        perDayLeft: daily && now0.planned > 0 ? r2(Math.max(0, left) / Math.max(1, daysLeft)) : null,
        // ponad typowy poziom: wydane już teraz > średnia + 1σ z poprzednich miesięcy (min. 3 miesiące historii)
        aboveTypical: past.length >= 3 && now0.spent > meanSpent + sd + 0.01,
        overPlan: now0.planned > 0 && now0.spent > now0.planned + 0.01,
      };
    }
    return {
      key: c.key,
      name: c.name,
      type: c.type,
      fixed,
      lumpy,
      months: past.length,
      meanSpent: r2(meanSpent),
      sd: r2(sd),
      cv: meanSpent > 0 ? r2(sd / meanSpent) : null, // zmienność względem średniej
      min: spentArr.length ? r2(Math.min(...spentArr)) : null,
      max: spentArr.length ? r2(Math.max(...spentArr)) : null,
      meanPlanned: r2(mean(past.map((m) => c.byMonth[m].planned))),
      overPlanRate: past.length ? r2(overMonths / past.length) : null,
      purchasesPerMonth: r2(avgPurch),
      avgPurchase: logCount ? r2(logSum / logCount) : null,
      perDayHistoric: daily && past.length ? r2(meanSpent / avgDaysPast) : null,
      bigDay: daily && dayArr.length >= 5 ? r2(quantile(dayArr, 0.9)) : null, // typowy „duży” dzień zakupów (90. percentyl)
      today,
    };
  });
  categories.sort((a, b) => (b.today?.spent ?? b.meanSpent) - (a.today?.spent ?? a.meanSpent));
  const pastMonths = monthRows.filter((m) => !m.current);
  const tracked = monthRows.filter((m) => m.planChanges);
  const curRow = monthRows.find((m) => m.current) || null;
  return {
    month: cur,
    elapsed,
    daysInMonth: daysCur,
    daysLeft,
    months: monthRows,
    categories,
    summary: {
      monthsWithData: pastMonths.length,
      meanSpent: r2(mean(pastMonths.map((m) => m.spent))),
      sdSpent: r2(stdev(pastMonths.map((m) => m.spent))),
      meanPurchases: r2(mean(pastMonths.map((m) => m.purchases))),
      meanPlanDelta: tracked.length ? r2(mean(tracked.map((m) => Math.abs(m.planChanges.delta)))) : null,
      meanPlanChanges: tracked.length ? r2(mean(tracked.map((m) => m.planChanges.changes))) : null,
      perDayLeft: curRow && curRow.planned > 0 ? r2(Math.max(0, curRow.planned - curRow.spent) / Math.max(1, daysLeft)) : null,
    },
  };
}

// Dane dla AI – same liczby (bez notatek i nazw sklepów)
export function statsForAi(s) {
  return {
    miesiac: s.month,
    dzien: s.elapsed,
    dni_w_miesiacu: s.daysInMonth,
    miesiace: s.months.map((m) => ({ miesiac: m.month, plan: m.planned, wydano: m.spent, zakupy: m.purchases, ...(m.planChanges ? { zmiany_planu: m.planChanges.changes, plan_poczatkowy: m.planChanges.from, plan_koncowy: m.planChanges.to } : {}) })),
    kategorie: s.categories.slice(0, 30).map((c) => ({
      nazwa: c.name,
      typ: c.type,
      stala_lub_z_gory: c.fixed,
      skokowa: c.lumpy,
      miesiecy_historii: c.months,
      srednio_mies: c.meanSpent,
      odch_std: c.sd,
      min: c.min,
      max: c.max,
      sredni_plan: c.meanPlanned,
      ponad_plan_proc: c.overPlanRate === null ? null : Math.round(c.overPlanRate * 100),
      zakupow_mies: c.purchasesPerMonth,
      sredni_zakup: c.avgPurchase,
      ...(c.perDayHistoric !== null ? { srednio_dziennie: c.perDayHistoric } : {}),
      ...(c.bigDay !== null ? { duzy_dzien_p90: c.bigDay } : {}),
      ...(c.today ? { ten_miesiac: { plan: c.today.planned, wydano: c.today.spent, zakupy: c.today.purchases, pozostalo: c.today.left, ...(c.today.perDayLeft !== null ? { limit_dzienny_do_konca: c.today.perDayLeft } : {}), ponad_typowy: c.today.aboveTypical, ponad_plan: c.today.overPlan } } : {}),
    })),
    srednie: s.summary,
  };
}

// ── Analiza AI (zapis + odświeżanie w tle) ──
export const readStatsAi = () => read(STATS_AI_KEY, null);
const hashOf = (str) => {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return String(h >>> 0);
};
export async function runStatsAi(now = new Date(), { force = false } = {}) {
  const stats = computeBudgetStats(now);
  if (!stats.categories.length) return null;
  const data = statsForAi(stats);
  // dzień miesiąca poza hashem – nowa analiza tylko przy zmianie danych, nie co dzień
  const hash = hashOf(JSON.stringify({ ...data, dzien: 0 }));
  const prev = readStatsAi();
  if (!force && prev && (prev.hash === hash || Date.now() - new Date(prev.at).getTime() < AI_MIN_GAP_MS)) return null;
  const { requestBudgetStats } = await import('./newsAi.js');
  const res = await requestBudgetStats(data);
  if (!res.analysis) throw new Error(res.error || 'Brak analizy');
  const entry = { analysis: res.analysis, hash, month: stats.month, at: new Date().toISOString(), model: res.model || '' };
  write(STATS_AI_KEY, entry);
  return entry;
}
export const STATS_WATCH_KEYS = [BUDGET_KEY, BUDGET_LOG_KEY];
