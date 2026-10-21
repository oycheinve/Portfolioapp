// Godziny notowań GPW (czas polski): poniedziałek–piątek 9:00–16:50. Bez kalendarza świąt giełdowych.
export const MARKET_OPEN_MIN = 9 * 60;
export const MARKET_CLOSE_MIN = 16 * 60 + 50;

export function warsawClock(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return { weekday: parts.weekday, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function isWarsawMarketOpen(date = new Date()) {
  const { weekday, minutes } = warsawClock(date);
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  return minutes >= MARKET_OPEN_MIN && minutes <= MARKET_CLOSE_MIN;
}

// Automatyczne pobieranie danych (dywidendy, historia cen) przy wejściu do aplikacji: tylko w godzinach sesji,
// z wyjątkiem pierwszego pobrania, gdy danych jeszcze w ogóle nie ma
export function mayAutoFetch(lastFetchedAt, date = new Date()) {
  return !lastFetchedAt || isWarsawMarketOpen(date);
}
