// Budżet miesięczny (Demo): tabela kategorii jak w arkuszu – plan, wydane, pozostało (plan − wydane), typ.
// Dane w localStorage (`wealth-app-budget-v1`: { 'RRRR-MM': [wiersze] }) – poza modelem portfela; prefiks
// „wealth-app-” sprawia, że budżet trafia do kopii zapasowej JSON i synchronizacji ustawień w chmurze.

export const BUDGET_KEY = 'wealth-app-budget-v1';

export const BUDGET_TYPES = ['Transport', 'Inwestycje', 'Stałe koszty', 'Zdrowie', 'Życie', 'Oszczędności', 'Inne'];

// Przykładowe kategorie miesiąca bez zapisanych danych
export const DEMO_ROWS = [
  { name: 'Karta miejska', planned: 110, spent: 110, type: 'Transport' },
  { name: 'Pociągi', planned: 150, spent: 96.4, type: 'Transport' },
  { name: 'Czynsz i media', planned: 1800, spent: 1765.2, type: 'Stałe koszty' },
  { name: 'Telefon i internet', planned: 120, spent: 119.99, type: 'Stałe koszty' },
  { name: 'Jedzenie', planned: 1200, spent: 1034.55, type: 'Życie' },
  { name: 'Kosmetyki', planned: 150, spent: 182.3, type: 'Zdrowie' },
  { name: 'Leki i lekarz', planned: 100, spent: 40, type: 'Zdrowie' },
  { name: 'Rozrywka', planned: 250, spent: 210, type: 'Życie' },
  { name: 'Inwestycje (IKE / IKZE)', planned: 1500, spent: 1500, type: 'Inwestycje' },
  { name: 'Poduszka finansowa', planned: 500, spent: 500, type: 'Oszczędności' },
  { name: 'Inne', planned: 200, spent: 64, type: 'Inne' },
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
