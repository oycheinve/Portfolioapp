// Budżet miesięczny (Demo): tabela kategorii jak w arkuszu – plan, wydane, pozostało (plan − wydane), typ.
// Dane w localStorage (`wealth-app-budget-v1`: { 'RRRR-MM': [wiersze] }) – poza modelem portfela; prefiks
// „wealth-app-” sprawia, że budżet trafia do kopii zapasowej JSON i synchronizacji ustawień w chmurze.

export const BUDGET_KEY = 'wealth-app-budget-v1';

export const BUDGET_TYPES = ['Transport', 'Inwestycje', 'Stałe koszty', 'Zdrowie', 'Życie', 'Oszczędności', 'Inne'];

// Przykładowe kategorie miesiąca bez zapisanych danych (wzór z arkusza „Budżet na: Grudzień”)
export const DEMO_ROWS = [
  { name: 'Karta miejska', planned: 55, spent: 0, type: 'Transport' },
  { name: 'Pociągi', planned: 220, spent: 0, type: 'Transport' },
  { name: 'Inwestycje', planned: 300, spent: 0, type: 'Inwestycje' },
  { name: 'Canal+', planned: 35, spent: 0, type: 'Stałe koszty' },
  { name: 'Soczewki', planned: 48, spent: 0, type: 'Zdrowie' },
  { name: 'Ubery', planned: 40, spent: 0, type: 'Życie' },
  { name: 'Kosmetyki i chemia', planned: 50, spent: 0, type: 'Życie' },
  { name: 'Nieprzewidziane wydatki', planned: 200, spent: 53.35, type: 'Inne' },
  { name: 'Wakacje (odkładanie)', planned: 150, spent: 0, type: 'Oszczędności' },
  { name: 'S&P 500', planned: 300, spent: 0, type: 'Inwestycje' },
  { name: 'Suplementy', planned: 22, spent: 0, type: 'Oszczędności' },
  { name: 'Jedzenie (Reszta)', planned: 880, spent: 0, type: 'Życie' },
];

let seq = 0;
export const newRowId = () => `b${Date.now().toString(36)}${(seq += 1).toString(36)}`;

export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

export function readBudget() {
  try {
    const v = JSON.parse(localStorage.getItem(BUDGET_KEY) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export function writeBudget(data) {
  try {
    localStorage.setItem(BUDGET_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export const demoRows = () => DEMO_ROWS.map((r) => ({ id: newRowId(), ...r }));

const num = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export function rowLeft(r) {
  return num(r.planned) - num(r.spent);
}

export function budgetTotals(rows) {
  const planned = rows.reduce((s, r) => s + num(r.planned), 0);
  const spent = rows.reduce((s, r) => s + num(r.spent), 0);
  const byType = BUDGET_TYPES.map((t) => {
    const list = rows.filter((r) => (r.type || 'Inne') === t);
    return { type: t, planned: list.reduce((s, r) => s + num(r.planned), 0), spent: list.reduce((s, r) => s + num(r.spent), 0) };
  }).filter((x) => x.planned > 0 || x.spent > 0);
  return { planned, spent, left: planned - spent, used: planned > 0 ? spent / planned : 0, over: rows.filter((r) => rowLeft(r) < -0.004).length, byType };
}
