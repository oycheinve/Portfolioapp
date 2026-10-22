// Etap 6: cele roczne – kategorie, postęp % (ręczny lub automatyczny z danych portfela) i wskaźnik zbiorczy
import { computeLimitUsage, incomeEventsWithTax, isSafeAccount, isoDay, livePriceLookup, otherAssetsValue, resolveAccountIds, valuePortfolio } from './engine.js';

export const GOAL_CATEGORIES = {
  FINANCIAL: { id: 'FINANCIAL', label: 'Finansowe', slot: 0 },
  GROWTH: { id: 'GROWTH', label: 'Rozwój', slot: 2 },
  OTHER: { id: 'OTHER', label: 'Inne', slot: 4 },
};

// Źródła automatyczne – wartość X liczona z danych aplikacji dla roku celu
export const GOAL_SOURCES = {
  MANUAL: { id: 'MANUAL', label: 'Ręcznie (+ / −)' },
  DEPOSITS: { id: 'DEPOSITS', label: 'Wpłaty netto na portfel inwestycyjny w roku', unit: 'zł' },
  INVEST_VALUE: { id: 'INVEST_VALUE', label: 'Wartość portfela inwestycyjnego (dziś)', unit: 'zł' },
  SAFE_VALUE: { id: 'SAFE_VALUE', label: 'Poduszka finansowa (dziś)', unit: 'zł' },
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
    case 'DEPOSITS': {
      // Tylko portfel inwestycyjny – wpłaty na poduszkę (oszczędności, obligacje) liczone osobno
      const safe = new Set(state.accounts.filter(isSafeAccount).map((a) => a.id));
      return state.cashflows
        .filter((c) => c.date.startsWith(y) && !safe.has(c.accountId))
        .reduce((s, c) => s + (c.type === 'DEPOSIT' ? 1 : -1) * (Number(c.amount) || 0), 0);
    }
    case 'INVEST_VALUE':
    case 'SAFE_VALUE': {
      const ids = resolveAccountIds(state, goal.source === 'INVEST_VALUE' ? 'INVEST' : 'SAFE');
      return valuePortfolio(state, { asOf: isoDay(new Date()), accountIds: ids, priceLookup: livePriceLookup(state) }).totals.total;
    }
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

// Kierunek celu: 'UP' (wartość ma rosnąć) albo 'DOWN' (ma spadać – docelowa niższa niż wartość na starcie).
// Jawny wybór w celu ma pierwszeństwo; „auto” – porównanie wartości docelowej z wartością startową.
export function goalDirection(goal) {
  if (goal.direction === 'UP' || goal.direction === 'DOWN') return goal.direction;
  const start = Number(goal.startValue);
  const target = Number(goal.target) || 0;
  return Number.isFinite(start) && goal.startValue !== undefined && goal.startValue !== null && target < start ? 'DOWN' : 'UP';
}

function measure(goal, current, target) {
  if (goalDirection(goal) === 'DOWN') {
    // Postęp = jaką część drogi od wartości startowej do docelowej już przebyto
    const start = Number.isFinite(Number(goal.startValue)) && goal.startValue !== undefined ? Number(goal.startValue) : Math.max(current, target);
    const span = start - target;
    const pct = span > 0 ? Math.max(0, (start - current) / span) : current <= target ? 1 : 0;
    return { current, target, start, pct, capped: Math.min(1, pct), done: current <= target, direction: 'DOWN' };
  }
  // Postęp liczony od wartości startowej (stan w chwili ustawienia celu = 0%): np. cel 450 przy starcie 435 –
  // 435 to 0%, 442,5 to 50%. Bez wartości startowej (lub gdy start ≥ cel) – od zera.
  const rawStart = Number(goal.startValue);
  const start = goal.startValue !== undefined && goal.startValue !== null && Number.isFinite(rawStart) && rawStart > 0 && rawStart < target ? rawStart : 0;
  const span = target - start;
  const pct = span > 0 ? Math.max(0, (current - start) / span) : 0;
  return { current, target, start, pct, capped: Math.min(1, pct), done: target > 0 && current >= target, direction: 'UP' };
}

export function goalProgress(state, goal) {
  const target = Number(goal.target) || 0;
  // Cel zarchiwizowany przy zamknięciu roku – wynik zamrożony
  if (goal.status === 'ARCHIVED' && goal.result) {
    return { ...measure(goal, Number(goal.result.current) || 0, target), archived: true };
  }
  const current = goal.source && goal.source !== 'MANUAL' ? autoGoalValue(state, goal) : Number(goal.current) || 0;
  return measure(goal, current, target);
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
