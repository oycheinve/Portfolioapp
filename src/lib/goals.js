// Etap 6: cele roczne – kategorie, postęp % (ręczny lub automatyczny z danych portfela) i wskaźnik zbiorczy
import { computeLimitUsage, incomeEventsWithTax, isoDay, livePriceLookup, otherAssetsValue, valuePortfolio } from './engine.js';

export const GOAL_CATEGORIES = {
  FINANCIAL: { id: 'FINANCIAL', label: 'Finansowe', slot: 0 },
  GROWTH: { id: 'GROWTH', label: 'Rozwój', slot: 2 },
  OTHER: { id: 'OTHER', label: 'Inne', slot: 4 },
};

// Źródła automatyczne – wartość X liczona z danych aplikacji dla roku celu
export const GOAL_SOURCES = {
  MANUAL: { id: 'MANUAL', label: 'Ręcznie (+ / −)' },
  DEPOSITS: { id: 'DEPOSITS', label: 'Wpłaty netto w roku', unit: 'zł' },
  DIVIDENDS: { id: 'DIVIDENDS', label: 'Dywidendy netto w roku', unit: 'zł' },
  PASSIVE: { id: 'PASSIVE', label: 'Dochód pasywny netto w roku', unit: 'zł' },
  NET_WORTH: { id: 'NET_WORTH', label: 'Majątek całkowity (dziś)', unit: 'zł' },
  IKE_LIMIT: { id: 'IKE_LIMIT', label: 'Wpłaty na IKE w roku', unit: 'zł' },
  IKZE_LIMIT: { id: 'IKZE_LIMIT', label: 'Wpłaty na IKZE w roku', unit: 'zł' },
};

export function autoGoalValue(state, goal) {
  const year = Number(goal.year) || new Date().getFullYear();
  const y = String(year);
  switch (goal.source) {
    case 'DEPOSITS':
      return state.cashflows.filter((c) => c.date.startsWith(y)).reduce((s, c) => s + (c.type === 'DEPOSIT' ? 1 : -1) * (Number(c.amount) || 0), 0);
    case 'DIVIDENDS':
      return incomeEventsWithTax(state)
        .filter((i) => i.type === 'DIVIDEND' && i.date.startsWith(y) && i.date <= isoDay(new Date()))
        .reduce((s, i) => s + i.net, 0);
    case 'PASSIVE':
      return incomeEventsWithTax(state)
        .filter((i) => i.date.startsWith(y) && i.date <= isoDay(new Date()))
        .reduce((s, i) => s + i.net, 0);
    case 'NET_WORTH': {
      const v = valuePortfolio(state, { asOf: isoDay(new Date()), accountIds: null, priceLookup: livePriceLookup(state) });
      return v.totals.total + otherAssetsValue(state).includedValue;
    }
    case 'IKE_LIMIT':
    case 'IKZE_LIMIT': {
      const type = goal.source === 'IKE_LIMIT' ? 'IKE' : 'IKZE';
      return computeLimitUsage(state, year)
        .filter((u) => u.account.type === type)
        .reduce((s, u) => s + u.deposited, 0);
    }
    default:
      return Number(goal.current) || 0;
  }
}

export function goalProgress(state, goal) {
  // Cel zarchiwizowany przy zamknięciu roku – wynik zamrożony
  if (goal.status === 'ARCHIVED' && goal.result) {
    const target = Number(goal.target) || 0;
    const current = Number(goal.result.current) || 0;
    const pct = target > 0 ? Math.max(0, current / target) : 0;
    return { current, target, pct, capped: Math.min(1, pct), done: target > 0 && current >= target, archived: true };
  }
  const current = goal.source && goal.source !== 'MANUAL' ? autoGoalValue(state, goal) : Number(goal.current) || 0;
  const target = Number(goal.target) || 0;
  const pct = target > 0 ? Math.max(0, current / target) : 0;
  return { current, target, pct, capped: Math.min(1, pct), done: target > 0 && current >= target };
}

// Wskaźnik zbiorczy: średnia postępu celów (każdy maks. 100%)
export function goalsSummary(state, year) {
  const goals = state.goals.filter((g) => Number(g.year) === Number(year));
  const rows = goals.map((g) => ({ goal: g, ...goalProgress(state, g) }));
  const byCategory = Object.values(GOAL_CATEGORIES).map((c) => {
    const list = rows.filter((r) => (r.goal.category || 'OTHER') === c.id);
    return { ...c, rows: list, pct: list.length ? list.reduce((s, r) => s + r.capped, 0) / list.length : 0, done: list.filter((r) => r.done).length };
  });
  return {
    rows,
    byCategory,
    overall: rows.length ? rows.reduce((s, r) => s + r.capped, 0) / rows.length : 0,
    done: rows.filter((r) => r.done).length,
    total: rows.length,
  };
}
