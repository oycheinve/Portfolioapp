// Budżet miesięczny: tabela kategorii jak w arkuszu – plan, wydane, pozostało (plan − wydane), typ.
// Dane w localStorage (`wealth-app-budget-v1`: { 'RRRR-MM': [wiersze] }) – poza modelem portfela; prefiks
// „wealth-app-” sprawia, że budżet trafia do kopii zapasowej JSON i synchronizacji ustawień w chmurze.

export const BUDGET_KEY = 'wealth-app-budget-v1';

export const BUDGET_TYPES = ['Transport', 'Inwestycje', 'Stałe koszty', 'Zdrowie', 'Życie', 'Oszczędności', 'Inne'];

// Przykładowe kategorie miesiąca bez zapisanych danych (dla nowego użytkownika): ogólne kategorie z losowymi,
// zaokrąglonymi kwotami w podanych zakresach; losowanie zależne od miesiąca (stałe przy odświeżaniu), wydane = 0
export const DEMO_ROWS = [
  { name: 'Jedzenie', range: [800, 1400], step: 50, type: 'Życie' },
  { name: 'Mieszkanie i rachunki', range: [900, 2000], step: 50, type: 'Stałe koszty' },
  { name: 'Transport', range: [150, 400], step: 10, type: 'Transport' },
  { name: 'Zdrowie', range: [50, 200], step: 10, type: 'Zdrowie' },
  { name: 'Chemia i kosmetyki', range: [50, 150], step: 10, type: 'Życie' },
  { name: 'Rozrywka i subskrypcje', range: [60, 250], step: 10, type: 'Stałe koszty' },
  { name: 'Ubrania', range: [50, 250], step: 10, type: 'Życie' },
  { name: 'Inwestycje', range: [200, 800], step: 50, type: 'Inwestycje' },
  { name: 'Oszczędności', range: [100, 500], step: 50, type: 'Oszczędności' },
  { name: 'Nieprzewidziane wydatki', range: [100, 300], step: 10, type: 'Inne' },
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

// Zapis tylko przy faktycznej zmianie; zgłoszenie zmiany ustawień (`wealth-app-prefs-changed`) – synchronizacja
// z chmurą wysyła wtedy aktualny budżet, a po odświeżeniu nie nadpisuje go starszą kopią z chmury
export const PREFS_CHANGED_EVENT = 'wealth-app-prefs-changed';
export function writeBudget(data) {
  try {
    const json = JSON.stringify(data);
    if (localStorage.getItem(BUDGET_KEY) === json) return true;
    localStorage.setItem(BUDGET_KEY, json);
    window.dispatchEvent(new CustomEvent(PREFS_CHANGED_EVENT, { detail: { key: BUDGET_KEY } }));
    return true;
  } catch {
    return false;
  }
}

// Dziennik szybkich zakupów (`wealth-app-budget-log-v1`: { 'RRRR-MM': [{ id, rowId, name, amount, note, at }] }) –
// osobny klucz, by nie zmieniać kształtu danych budżetu; prefiks „wealth-app-” → kopia zapasowa i chmura
export const BUDGET_LOG_KEY = 'wealth-app-budget-log-v1';
export const LOG_LIMIT = 200;
export function readBudgetLog() {
  try {
    const v = JSON.parse(localStorage.getItem(BUDGET_LOG_KEY) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
export function writeBudgetLog(log) {
  try {
    const json = JSON.stringify(log);
    if ((localStorage.getItem(BUDGET_LOG_KEY) || '{}') === json) return true;
    localStorage.setItem(BUDGET_LOG_KEY, json);
    window.dispatchEvent(new CustomEvent(PREFS_CHANGED_EVENT, { detail: { key: BUDGET_LOG_KEY } }));
    return true;
  } catch {
    return false;
  }
}

// Prosty generator pseudolosowy z ziarnem (miesiąc „RRRR-MM”) – te same kwoty przy każdym otwarciu tego miesiąca
const seeded = (seed) => {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
};
export const demoRows = (seed = monthKey()) => {
  const rnd = seeded(seed);
  return DEMO_ROWS.map(({ range: [min, max], step, ...r }) => ({ id: newRowId(), ...r, planned: Math.round((min + rnd() * (max - min)) / step) * step, spent: 0 }));
};

// Kwota z tabeli budżetu: liczba albo tekst z przecinkiem dziesiętnym i spacjami („974,39”, „1 234,50”)
export const parseAmount = (v) => num(v);
function num(v) {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export function rowLeft(r) {
  return num(r.planned) - num(r.spent);
}

// Kategoria powiązana z kontem oszczędnościowym (row.savings = { accountId, dir: 'out' | 'in' }): wpis w budżecie
// zapisuje wypłatę ('out', domyślnie – odejmuje ze stanu konta) albo wpłatę ('in') na tym koncie. Taka kategoria to
// transfer – widoczna w tabeli, ale poza sumą wydatków bieżących (RAZEM, statystyki, podsumowania, koszty życia).
export const isTransferRow = (r) => !!r?.savings?.accountId;

export function budgetTotals(rows) {
  const all = rows || [];
  const cons = all.filter((r) => !isTransferRow(r));
  const tr = all.filter(isTransferRow);
  const planned = cons.reduce((s, r) => s + num(r.planned), 0);
  const spent = cons.reduce((s, r) => s + num(r.spent), 0);
  const byType = BUDGET_TYPES.map((t) => {
    const list = cons.filter((r) => (r.type || 'Inne') === t);
    return { type: t, planned: list.reduce((s, r) => s + num(r.planned), 0), spent: list.reduce((s, r) => s + num(r.spent), 0) };
  }).filter((x) => x.planned > 0 || x.spent > 0);
  const transfer = { planned: tr.reduce((s, r) => s + num(r.planned), 0), spent: tr.reduce((s, r) => s + num(r.spent), 0), count: tr.length };
  return { planned, spent, left: planned - spent, used: planned > 0 ? spent / planned : 0, over: cons.filter((r) => rowLeft(r) < -0.004).length, byType, transfer };
}

// Dzienna statystyka kategorii jedzeniowej: dni do końca miesiąca (z dzisiejszym) i średnia dzienna kwota do wydania
export const DAILY_KEY = 'wealth-app-budget-daily';
const FOOD_RE = /jedzeni|żywnoś|zywnos|spożyw|spozyw|zakupy spo|food/i;
export function defaultFoodRow(rows) {
  const named = rows.filter((r) => String(r.name || '').trim());
  return named.find((r) => FOOD_RE.test(r.name)) || named.find((r) => r.type === 'Życie') || named[0] || null;
}
export function dailyAllowance(row, month, now = new Date()) {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const current = monthKey(now);
  const daysLeft = month === current ? daysInMonth - now.getDate() + 1 : month > current ? daysInMonth : 0;
  const planned = row ? num(row.planned) : 0;
  const left = row ? rowLeft(row) : 0;
  return { daysInMonth, daysLeft, planned, left, perDay: daysLeft > 0 ? Math.max(0, left) / daysLeft : 0, planPerDay: planned / daysInMonth, past: month < current };
}

// Tempo wydatków w bieżącym miesiącu: prognoza na koniec miesiąca przy dotychczasowym średnim dziennym tempie
// (wydane / dni, które minęły, z dzisiejszym × dni w miesiącu). Liczona od 3. dnia miesiąca (wcześniej – za mało
// danych); dla innych miesięcy – null. over – prognoza ponad plan (z marginesem 1%).
export function spendingPace(row, month, now = new Date()) {
  if (!row || month !== monthKey(now)) return null;
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const elapsed = now.getDate();
  const spent = num(row.spent);
  const planned = num(row.planned);
  if (elapsed < 3 || spent <= 0) return null;
  const projected = Math.round((spent / elapsed) * daysInMonth);
  return { projected, planned, diff: projected - planned, over: planned > 0 && projected > planned * 1.01, elapsed, daysInMonth };
}
