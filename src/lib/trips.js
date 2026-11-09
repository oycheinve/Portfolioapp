// Budżet Wakacyjny (BETA): dowolna liczba wyjazdów, każdy z budżetem ogólnym, kategoriami (domyślne podróżne
// + własne) i wydatkami. Dane per użytkownik: klucz `wealth-app-budget-trips-v1` – lokalnie w przestrzeni
// zalogowanego (u:<id>:…), w chmurze w wierszu użytkownika (ui_prefs, po user_id) – bez limitu wyjazdów i kont.
import { PREFS_CHANGED_EVENT } from './budget.js';

export const TRIPS_KEY = 'wealth-app-budget-trips-v1';
export const TRIP_CATEGORIES = ['Loty', 'Mieszkanie', 'e-SIM', 'Pamiątki', 'Transport', 'Atrakcje', 'Jedzenie'];

let seq = 0;
export const tripId = (p = 't') => `${p}${Date.now().toString(36)}${(seq += 1).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const money = (v) => Math.round((Number(v) || 0) * 100) / 100;

export function readTrips() {
  try {
    const v = JSON.parse(localStorage.getItem(TRIPS_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
export function writeTrips(trips) {
  try {
    const json = JSON.stringify(trips);
    if (localStorage.getItem(TRIPS_KEY) === json) return;
    localStorage.setItem(TRIPS_KEY, json);
    window.dispatchEvent(new CustomEvent(PREFS_CHANGED_EVENT, { detail: { key: TRIPS_KEY } }));
  } catch {
    // brak localStorage
  }
}

export function makeTrip({ name, budget, from = '', to = '' }) {
  return {
    id: tripId('trip'),
    name: String(name || '').trim().slice(0, 60) || 'Wyjazd',
    budget: money(budget),
    from,
    to,
    createdAt: new Date().toISOString(),
    categories: TRIP_CATEGORIES.map((n) => ({ id: tripId('c'), name: n, planned: 0, builtin: true })),
    expenses: [],
  };
}

// Podsumowanie wyjazdu: wydane per kategoria i łącznie, zaplanowane w kategoriach, nieprzydzielone, pozostało
export function tripTotals(trip) {
  const spentBy = {};
  for (const e of trip.expenses || []) spentBy[e.catId] = money((spentBy[e.catId] || 0) + money(e.amount));
  const cats = (trip.categories || []).map((c) => ({ ...c, spent: spentBy[c.id] || 0, left: money(money(c.planned) - (spentBy[c.id] || 0)) }));
  const spent = money(Object.values(spentBy).reduce((s, v) => s + v, 0));
  const planned = money(cats.reduce((s, c) => s + money(c.planned), 0));
  const budget = money(trip.budget);
  return { cats, spent, planned, budget, left: money(budget - spent), unallocated: money(budget - planned), progress: budget > 0 ? spent / budget : null };
}
