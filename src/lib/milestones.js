// Automatyczne kamienie milowe (Cele): progi odhaczane same na podstawie portfela – wkład własny, zysk całkowity,
// stopa zwrotu i dywidendy netto z ostatnich 12 miesięcy. Bez górnego limitu: po ostatnim progu z listy kolejne
// są podwajane. Data pierwszego osiągnięcia progu zapisywana per użytkownik (`wealth-app-milestones-v1`, urządzenie
// + chmura) – osiągnięty próg zostaje odhaczony także po chwilowym spadku wartości.
import { PREFS_CHANGED_EVENT } from './budget.js';

export const MILESTONES_KEY = 'wealth-app-milestones-v1';

export const MILESTONE_TRACKS = [
  { id: 'contrib', label: 'Wartość wpłacona', hint: 'wkład własny w portfel inwestycyjny', unit: 'zł', steps: [10000, 25000, 50000, 100000, 250000, 500000, 1000000] },
  { id: 'gain', label: 'Zysk wygenerowany', hint: 'zysk całkowity od początku (kursy, dywidendy, odsetki)', unit: 'zł', steps: [1000, 5000, 10000, 25000, 50000, 100000, 250000] },
  { id: 'gainPct', label: 'Procent zysku', hint: 'stopa zwrotu portfela od początku', unit: '%', steps: [5, 10, 25, 50, 100, 200] },
  { id: 'dividends', label: 'Dywidendy roczne', hint: 'dywidendy netto z ostatnich 12 miesięcy', unit: 'zł/rok', steps: [500, 1000, 2500, 5000, 10000, 25000] },
];

// Progi do wyświetlenia: z listy, a powyżej ostatniego – podwajane, aż do pierwszego nieosiągniętego (bez limitu)
export function thresholds(track, value) {
  const out = [...track.steps];
  while (out.length < 200 && value >= out[out.length - 1]) out.push(out[out.length - 1] * 2);
  return out;
}

export function readMilestones() {
  try {
    const v = JSON.parse(localStorage.getItem(MILESTONES_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
function writeMilestones(all) {
  try {
    localStorage.setItem(MILESTONES_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent(PREFS_CHANGED_EVENT, { detail: { key: MILESTONES_KEY } }));
  } catch {
    // brak localStorage
  }
}

// Stan ścieżki: wartość, progi (osiągnięty / data), następny próg i postęp od poprzedniego progu do następnego
export function trackStatus(track, value, saved = {}) {
  const v = Number.isFinite(value) ? value : 0;
  const list = thresholds(track, v);
  const reached = saved[track.id] || {};
  const items = list.map((t) => ({ value: t, done: v >= t || !!reached[t], at: reached[t] || null }));
  const nextIdx = items.findIndex((x) => !x.done);
  const next = nextIdx >= 0 ? items[nextIdx] : null;
  const prev = nextIdx > 0 ? items[nextIdx - 1].value : 0;
  const progress = next ? Math.max(0, Math.min(1, (v - prev) / (next.value - prev))) : 1;
  return { track, value: v, items, next, prev, progress, doneCount: items.filter((x) => x.done).length };
}

// Zapis nowo osiągniętych progów (data pierwszego przekroczenia); zwraca listę nowych [{ track, value }]
export function recordReached(values, today = new Date().toISOString().slice(0, 10)) {
  const all = readMilestones();
  const fresh = [];
  for (const track of MILESTONE_TRACKS) {
    const v = values[track.id];
    if (!Number.isFinite(v)) continue;
    const saved = { ...(all[track.id] || {}) };
    for (const t of thresholds(track, v)) {
      if (v >= t && !saved[t]) {
        saved[t] = today;
        fresh.push({ track, value: t });
      }
    }
    all[track.id] = saved;
  }
  if (fresh.length) writeMilestones(all);
  return fresh;
}
