// Zweryfikowane dywidendy (fakty o spółkach, wspólne dla wszystkich użytkowników) – nadpisują dane z Yahoo, które
// nie podaje dnia wypłaty (aplikacja szacuje go wtedy na „dzień dywidendy + 14 dni”) i bywa nieaktualne przy
// wypłatach w transzach. Synchronizacja dywidend (dividendSync.js) poprawia z tej tabeli pozycję harmonogramu
// i po dniu wypłaty księguje ją według liczby akcji na każdym koncie w dniu przed dniem dywidendy
// (także ułamkowych), o ile wypłaty nie ma już w rejestrze (np. z importu XTB).
//
// exDate – dzień dywidendy (ustalenia prawa), payDate – dzień wypłaty, dps – stawka brutto na akcję,
// shares – stan posiadania na dzień ustalenia prawa podany ręcznie: zapas, gdy transakcji nie da się odtworzyć
// na ten dzień (np. import samych otwartych pozycji z późniejszą datą); liczba akcji z historii ma pierwszeństwo.
export const VERIFIED_DIVIDENDS = [
  {
    key: 'KTY-2026-II',
    tickers: ['KTY'],
    symbols: ['KTY.WA'],
    exDate: '2026-08-18',
    payDate: '2026-11-04',
    dps: 32.64,
    shares: 0.2887,
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
