// Zweryfikowane dywidendy (fakty o spółkach, wspólne dla wszystkich użytkowników) – nadpisują dane z Yahoo, które
// nie podaje dnia wypłaty (aplikacja szacuje go wtedy na „dzień dywidendy + 14 dni”) i bywa nieaktualne przy
// wypłatach w transzach. Synchronizacja dywidend (dividendSync.js) poprawia z tej tabeli pozycję harmonogramu
// i po dniu wypłaty księguje ją według liczby akcji na każdym koncie w dniu przed dniem dywidendy
// (także ułamkowych), o ile wypłaty nie ma już w rejestrze (np. z importu XTB).
//
// exDate – dzień dywidendy (ustalenia prawa), payDate – dzień wypłaty, dps – stawka brutto na akcję,
// shares + forceShares – JEDNORAZOWY WYJĄTEK: stała liczba akcji uprawnionych do tej jednej wypłaty (niezależnie od
// historii transakcji). Obowiązuje wyłącznie pozycję o dokładnie tym samym instrumencie, dniu dywidendy, dniu wypłaty
// i stawce (forcedShares) – inne spółki i kolejne dywidendy (także KTY) liczą się standardowo z posiadanych akcji.
export const VERIFIED_DIVIDENDS = [
  {
    key: 'KTY-2026-II',
    tickers: ['KTY'],
    symbols: ['KTY.WA'],
    exDate: '2026-08-18',
    payDate: '2026-11-04',
    dps: 32.64,
    shares: 0.2887,
    forceShares: true,
    currency: 'PLN',
    note: 'Grupa Kęty – II transza dywidendy: dzień dywidendy 18.08.2026, wypłata 4.11.2026, 32,64 zł na akcję (0,2887 akcji × 32,64 zł = 9,42 zł brutto)',
  },
];

const norm = (s) =>
  String(s || '')
    .trim()
    .toUpperCase();

// Fakty dotyczące instrumentu (po tickerze albo symbolu Yahoo)
export function factsFor(inst) {
  const t = norm(inst?.ticker);
  const y = norm(inst?.yahooSymbol);
  return VERIFIED_DIVIDENDS.filter((f) => (t && f.tickers.includes(t)) || (y && f.symbols.includes(y)));
}

// Liczba akcji z jednorazowego wyjątku dla pozycji harmonogramu (null – brak wyjątku, liczenie standardowe)
export function forcedShares(inst, item) {
  if (!item?.exDate) return null;
  const f = factsFor(inst).find((x) => x.forceShares && x.shares > 0 && x.exDate === item.exDate && x.payDate === item.payDate && Math.abs((Number(item.dps) || 0) - x.dps) < 1e-9 && (item.currency || 'PLN') === x.currency);
  return f ? f.shares : null;
}
