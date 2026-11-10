// Miesięczne podsumowanie budżetu (AI, BETA): zagregowane liczby miesiąca (plan i wydatki w kategoriach, największe
// zakupy z dziennika, paragony, porównanie z poprzednim miesiącem) → /api/news-summary (tryb „budget”, czysty JSON).
// Archiwum per użytkownik: `wealth-app-budget-ai-v1` { 'RRRR-MM': { summary, stats, at, seen } } (urządzenie + chmura).
// Generowane automatycznie przy pierwszym otwarciu aplikacji w nowym miesiącu (za miesiąc poprzedni).
import { PREFS_CHANGED_EVENT, budgetTotals, monthKey, parseAmount, readBudget, readBudgetLog, shiftMonth } from './budget.js';
import { readReceipts } from './receipts.js';
import { requestBudgetSummary } from './newsAi.js';

export const BUDGET_AI_KEY = 'wealth-app-budget-ai-v1';
const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
export const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
// Kwoty z tabeli bywają tekstem z przecinkiem („974,39”) – ten sam odczyt co w tabeli budżetu (inaczej plan = 0 zł)
const money = (v) => Math.round(parseAmount(v) * 100) / 100;

export function readBudgetAi() {
  try {
    const v = JSON.parse(localStorage.getItem(BUDGET_AI_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
export function writeBudgetAi(all) {
  try {
    localStorage.setItem(BUDGET_AI_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent(PREFS_CHANGED_EVENT, { detail: { key: BUDGET_AI_KEY } }));
  } catch {
    // brak localStorage
  }
}

// Statystyki miesiąca (także do wysłania do AI – tylko liczby i nazwy kategorii)
export function monthStats(month, data = readBudget(), log = readBudgetLog(), receipts = readReceipts()) {
  const rows = data[month] || [];
  if (!rows.length) return null;
  const t = budgetTotals(rows);
  const prevRows = data[shiftMonth(month, -1)] || [];
  const prev = prevRows.length ? budgetTotals(prevRows) : null;
  const categories = rows.map((r) => ({ name: r.name || '(bez nazwy)', type: r.type || '', planned: money(r.planned), spent: money(r.spent) }));
  const top = [...(log[month] || [])].sort((a, b) => b.amount - a.amount).slice(0, 10).map((e) => ({ name: e.name, amount: money(e.amount), note: e.note || '' }));
  // Przekroczenie tylko, gdy wydano więcej niż plan (równe lub mniejsze – w planie)
  const overspent = categories.filter((c) => c.spent > c.planned + 0.005).map((c) => ({ ...c, over: money(c.spent - c.planned) }));
  return {
    month,
    label: monthLabel(month),
    planned: money(t.planned),
    spent: money(t.spent),
    left: money(t.planned - t.spent),
    categories,
    top,
    overspent,
    receipts: receipts.filter((r) => (r.month || String(r.date || '').slice(0, 7)) === month).length,
    entries: (log[month] || []).length,
    previous: prev ? { planned: money(prev.planned), spent: money(prev.spent) } : null,
  };
}

export async function generateMonthSummary(month) {
  const stats = monthStats(month);
  if (!stats) throw new Error('Brak budżetu w tym miesiącu');
  const res = await requestBudgetSummary({ month, label: stats.label, planned: stats.planned, spent: stats.spent, categories: stats.categories, top: stats.top, receipts: stats.receipts, previous: stats.previous });
  const all = readBudgetAi();
  all[month] = { summary: res.summary, stats, at: new Date().toISOString(), seen: false };
  writeBudgetAi(all);
  return all[month];
}

// Start aplikacji w nowym miesiącu: podsumowanie poprzedniego (raz – próba zapisana także przy błędzie na dany dzień)
const ATTEMPT_KEY = 'fintrack-budget-ai-attempt';
export async function autoMonthlySummary(today = new Date()) {
  const prev = shiftMonth(monthKey(today), -1);
  if (readBudgetAi()[prev]) return null;
  if (!(readBudget()[prev] || []).length) return null;
  const stamp = `${prev}|${today.toISOString().slice(0, 10)}`;
  try {
    if (localStorage.getItem(ATTEMPT_KEY) === stamp) return null;
    localStorage.setItem(ATTEMPT_KEY, stamp);
  } catch {
    // brak localStorage
  }
  return { month: prev, entry: await generateMonthSummary(prev) };
}
