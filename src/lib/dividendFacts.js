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
    // Stały wpis w rejestrze przychodów (bezwarunkowo, bez sprawdzania transakcji) – fixedDividendPlan()
    fixedIncome: { gross: 9.42 },
    name: 'Grupa Kęty',
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

const isAutoBooked = (i) => String(i.id).startsWith('divsch_');

// Stałe wpisy dywidend (fixedIncome) – BEZWARUNKOWO, bez sprawdzania historii transakcji i stanu posiadania:
// instrument (utworzony, gdy go brak), wypłata w rejestrze przychodów (id `fact_<key>`, data wypłaty, kwota brutto)
// i zaksięgowana pozycja harmonogramu. Konto: z akcjami spółki (ostatnia transakcja), inaczej pierwsze IKE, inaczej
// pierwsze konto inwestycyjne. Wypłata tej transzy z importu (np. XTB) zastępuje stały wpis – bez duplikatu.
// Zwraca zmiany do zastosowania (puste, gdy stan jest już zgodny – wywołanie idempotentne).
export function fixedDividendPlan(state, today) {
  const out = { instruments: [], income: [], removeIncome: [], schedule: [] };
  for (const f of VERIFIED_DIVIDENDS) {
    if (!f.fixedIncome || today < f.payDate) continue;
    let inst = state.instruments.find((i) => factsFor(i).includes(f));
    if (!inst) {
      inst = { id: `inst_fact_${f.tickers[0].toLowerCase()}`, ticker: f.tickers[0], name: f.name || f.tickers[0], yahooSymbol: f.symbols[0], currency: f.currency, kind: 'STOCK', type: 'STOCK' };
      if (!state.instruments.some((i) => i.id === inst.id)) out.instruments.push(inst);
    }
    const incomeId = `fact_${f.key}`;
    const to = new Date(`${f.payDate}T12:00:00`);
    to.setDate(to.getDate() + 7);
    const toIso = `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, '0')}-${String(to.getDate()).padStart(2, '0')}`;
    const inWindow = state.income.filter((i) => i.type === 'DIVIDEND' && i.instrumentId === inst.id && i.date >= f.exDate && i.date <= toIso);
    const current = state.income.find((i) => i.id === incomeId);
    const imported = inWindow.filter((i) => i.id !== incomeId && !isAutoBooked(i));
    if (imported.length) {
      if (current) out.removeIncome.push(incomeId);
      continue;
    }
    const lastTrade = state.trades.filter((t) => t.instrumentId === inst.id).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const accounts = state.accounts.filter((a) => a.type !== 'SAVINGS' && a.type !== 'BONDS');
    const accountId = (current && state.accounts.some((a) => a.id === current.accountId) && current.accountId) || lastTrade?.accountId || accounts.find((a) => a.type === 'IKE')?.id || accounts[0]?.id;
    if (!accountId) continue;
    const entry = {
      id: incomeId,
      accountId,
      instrumentId: inst.id,
      date: f.payDate,
      type: 'DIVIDEND',
      gross: f.fixedIncome.gross,
      foreignTax: 0,
      dps: f.dps,
      dpsCurrency: f.currency,
      forcedShares: f.shares,
      source: 'VERIFIED',
      note: `${f.shares} szt. × ${f.dps.toFixed(2)} ${f.currency} – ${f.note}`,
    };
    const same = current && ['accountId', 'instrumentId', 'date', 'type', 'gross', 'dps', 'forcedShares'].every((k) => current[k] === entry[k]);
    if (!same) out.income.push(entry);
    // Pozycja harmonogramu (historia dywidend) – gdy brak pozycji tej spółki z tego terminu
    const near = state.dividendSchedule.some((it) => it.instrumentId === inst.id && it.exDate && Math.abs(new Date(it.exDate) - new Date(f.exDate)) <= 10 * 86400000);
    if (!near) {
      out.schedule.push({ id: `dfact_${f.key}`, instrumentId: inst.id, dps: f.dps, currency: f.currency, exDate: f.exDate, payDate: f.payDate, payDateEstimated: false, estimated: false, withholdingPct: 0, source: 'VERIFIED', verified: true, note: f.note, bookedAt: `${f.payDate}T12:00:00.000Z`, incomeIds: [incomeId], pairedWith: 'rejestr' });
    }
  }
  return out;
}
