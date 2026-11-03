// Dzisiejsze zmiany notowań posiadanych pozycji (akcje, ETF-y) do powiadomień o krytycznych zmianach – ta sama
// zmiana dzienna co na Pulpicie (quoteDayChangePct: notowanie z wcześniejszej sesji = brak ruchu dziś).
import { computeHoldings, isoDay, quoteDayChangePct } from './engine.js';

export function heldDayChanges(state, now = new Date()) {
  const quotes = state.prices?.quotes || {};
  const held = new Set(computeHoldings(state, isoDay(now), null).filter((h) => h.quantity > 1e-9).map((h) => h.instrumentId));
  return state.instruments
    .filter((i) => held.has(i.id))
    .map((i) => {
      const q = quotes[i.id];
      // notowania symulowane (tryb demo / offline) nie wywołują alarmów
      if (!q || /mock|symul|rekonstr/i.test(q.source || '')) return null;
      const pct = quoteDayChangePct(q, now);
      return Number.isFinite(pct) ? { id: i.id, label: i.ticker || i.name, title: i.name || i.ticker, pct } : null;
    })
    .filter(Boolean);
}
