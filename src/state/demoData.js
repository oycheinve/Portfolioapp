// Dane demonstracyjne: kompletna historia wpłat, transakcji, dywidend, obligacji i migawek wyceny.
import { buildSnapshot, isoDay } from '../lib/engine.js';
import { createEmptyState } from './schema.js';

const DEMO_START = '2024-01-02';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const INSTRUMENTS = [
  { id: 'inst_vwce', ticker: 'VWCE', yahooSymbol: 'VWCE.DE', name: 'Vanguard FTSE All-World Acc', kind: 'ETF', currency: 'EUR', ter: 0.19, sector: 'Świat', mockPrice: 148.2, startPrice: 108 },
  { id: 'inst_cspx', ticker: 'CSPX', yahooSymbol: 'CSPX.L', name: 'iShares Core S&P 500 Acc', kind: 'ETF', currency: 'USD', ter: 0.07, sector: 'USA', mockPrice: 735.4, startPrice: 480 },
  { id: 'inst_eimi', ticker: 'EIMI', yahooSymbol: 'EIMI.L', name: 'iShares Core MSCI EM IMI Acc', kind: 'ETF', currency: 'USD', ter: 0.18, sector: 'Rynki wschodzące', mockPrice: 41.3, startPrice: 30.5 },
  { id: 'inst_wig20tr', ticker: 'ETFBW20TR', yahooSymbol: 'ETFBW20TR.WA', name: 'Beta ETF WIG20TR', kind: 'ETF', currency: 'PLN', ter: 0.5, sector: 'Polska', mockPrice: 152.6, startPrice: 98 },
  { id: 'inst_pko', ticker: 'PKO', yahooSymbol: 'PKO.WA', name: 'PKO Bank Polski', kind: 'STOCK', currency: 'PLN', ter: 0, sector: 'Banki', mockPrice: 74.1, startPrice: 51 },
  { id: 'inst_cdr', ticker: 'CDR', yahooSymbol: 'CDR.WA', name: 'CD Projekt', kind: 'STOCK', currency: 'PLN', ter: 0, sector: 'Gry', mockPrice: 268.5, startPrice: 116 },
  { id: 'inst_pzu', ticker: 'PZU', yahooSymbol: 'PZU.WA', name: 'PZU', kind: 'STOCK', currency: 'PLN', ter: 0, sector: 'Ubezpieczenia', mockPrice: 63.4, startPrice: 47 },
  { id: 'inst_dnp', ticker: 'DNP', yahooSymbol: 'DNP.WA', name: 'Dino Polska', kind: 'STOCK', currency: 'PLN', ter: 0, sector: 'Handel', mockPrice: 41.9, startPrice: 46 },
  { id: 'inst_pkn', ticker: 'PKN', yahooSymbol: 'PKN.WA', name: 'Orlen', kind: 'STOCK', currency: 'PLN', ter: 0, sector: 'Paliwa', mockPrice: 88.2, startPrice: 64 },
];

const FX = { PLN: 1, USD: 3.64, EUR: 4.24, GBP: 4.86, CHF: 4.56 };

const ACCOUNTS = [
  { id: 'acc_ike', name: 'IKE – XTB', type: 'IKE', institution: 'XTB', currency: 'PLN', openedAt: '2024-01-02' },
  { id: 'acc_ikze', name: 'IKZE – XTB', type: 'IKZE', institution: 'XTB', currency: 'PLN', openedAt: '2024-01-02' },
  { id: 'acc_brok', name: 'Konto maklerskie – mBank', type: 'BROKERAGE', institution: 'mBank eMakler', currency: 'PLN', openedAt: '2024-02-01' },
  { id: 'acc_bonds', name: 'Obligacje skarbowe – PKO BP', type: 'BROKERAGE', institution: 'PKO BP', currency: 'PLN', openedAt: '2024-03-01' },
  { id: 'acc_oki', name: 'OKI – (w przygotowaniu)', type: 'OKI', institution: '—', currency: 'PLN', openedAt: '2026-01-02', archived: false },
  { id: 'acc_sav', name: 'Konto oszczędnościowe – ING', type: 'SAVINGS', institution: 'ING', currency: 'PLN', openedAt: '2024-01-02', interestRate: 4.0, capitalization: 'MONTHLY' },
];

function progress(date, start, end) {
  const t = (new Date(date) - new Date(start)) / (new Date(end) - new Date(start));
  return Math.max(0, Math.min(1, t));
}

// Historyczna ścieżka ceny: geometryczny trend + fala zerująca się na końcach
function demoPrice(inst, date, today) {
  const p = progress(date, DEMO_START, today);
  const trend = inst.startPrice * Math.pow(inst.mockPrice / inst.startPrice, p);
  const wave = 1 + 0.07 * Math.sin(Math.PI * p * 5 + inst.ticker.length) * Math.sin(Math.PI * p);
  return Math.round(trend * wave * 100) / 100;
}

function monthDates(fromYear, fromMonth, toDate, day = 5) {
  const out = [];
  const end = new Date(toDate);
  let d = new Date(fromYear, fromMonth - 1, day);
  while (d <= end) {
    out.push(isoDay(d));
    d = new Date(d.getFullYear(), d.getMonth() + 1, day);
  }
  return out;
}

export function createDemoState(today = new Date()) {
  const todayIso = isoDay(today);
  const yesterday = isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
  const rand = rng(42);
  const state = createEmptyState();
  state.meta.demo = true;
  state.accounts = ACCOUNTS.map((a) => ({ ...a }));
  state.instruments = INSTRUMENTS.map(({ startPrice, ...i }) => ({ ...i }));
  const instById = Object.fromEntries(INSTRUMENTS.map((i) => [i.id, i]));

  let n = 0;
  const id = (p) => `${p}_demo_${(n += 1)}`;
  const cash = {};
  const deposit = (accountId, date, amount, note) => {
    if (date > todayIso) return;
    state.cashflows.push({ id: id('cf'), accountId, date, type: 'DEPOSIT', amount, note: note || '' });
    cash[accountId] = (cash[accountId] || 0) + amount;
  };
  const withdraw = (accountId, date, amount, note) => {
    if (date > todayIso) return;
    state.cashflows.push({ id: id('cf'), accountId, date, type: 'WITHDRAWAL', amount, note: note || '' });
    cash[accountId] = (cash[accountId] || 0) - amount;
  };
  const buyFor = (accountId, instId, date, budget, fee = 0) => {
    if (date > todayIso) return;
    const inst = instById[instId];
    const price = demoPrice(inst, date, todayIso);
    const fx = FX[inst.currency];
    const qty = Math.floor((budget - fee) / (price * fx));
    if (qty <= 0) return;
    state.trades.push({ id: id('tr'), accountId, instrumentId: instId, date, side: 'BUY', quantity: qty, price, fxRate: fx, fee });
    cash[accountId] = (cash[accountId] || 0) - qty * price * fx - fee;
  };
  const sell = (accountId, instId, date, qty, fee = 0) => {
    if (date > todayIso) return;
    const inst = instById[instId];
    const price = demoPrice(inst, date, todayIso);
    const fx = FX[inst.currency];
    state.trades.push({ id: id('tr'), accountId, instrumentId: instId, date, side: 'SELL', quantity: qty, price, fxRate: fx, fee });
    cash[accountId] = (cash[accountId] || 0) + qty * price * fx - fee;
  };

  // IKE: comiesięczne wpłaty i zakupy ETF (VWCE, co trzeci miesiąc WIG20TR)
  monthDates(2024, 1, todayIso, 5).forEach((date, idx) => {
    const year = Number(date.slice(0, 4));
    const amount = year === 2024 ? 1900 : year === 2025 ? 2150 : 2300;
    deposit('acc_ike', date, amount, 'Wpłata miesięczna');
    const target = idx % 3 === 2 ? 'inst_wig20tr' : 'inst_vwce';
    buyFor('acc_ike', target, date, cash.acc_ike * 0.995);
  });

  // IKZE: wpłaty roczne w 2024–2025, miesięczne w 2026; zakupy CSPX
  deposit('acc_ikze', '2024-12-10', 9300, 'Wpłata roczna 2024');
  buyFor('acc_ikze', 'inst_cspx', '2024-12-11', 9250);
  deposit('acc_ikze', '2025-12-09', 10300, 'Wpłata roczna 2025');
  buyFor('acc_ikze', 'inst_cspx', '2025-12-10', cash.acc_ikze * 0.99);
  monthDates(2026, 1, todayIso, 12).forEach((date) => {
    deposit('acc_ikze', date, 800, 'Wpłata miesięczna');
    buyFor('acc_ikze', 'inst_cspx', date, cash.acc_ikze * 0.97);
  });

  // Konto maklerskie: akcje GPW + EM ETF, jedna sprzedaż i jedna wypłata
  deposit('acc_brok', '2024-02-06', 30000, 'Zasilenie konta');
  buyFor('acc_brok', 'inst_pko', '2024-02-07', 7000, 5);
  buyFor('acc_brok', 'inst_cdr', '2024-02-07', 6000, 5);
  buyFor('acc_brok', 'inst_pzu', '2024-02-08', 6000, 5);
  buyFor('acc_brok', 'inst_dnp', '2024-02-08', 5000, 5);
  buyFor('acc_brok', 'inst_pkn', '2024-02-09', 5500, 5);
  deposit('acc_brok', '2025-03-04', 15000, 'Premia roczna');
  buyFor('acc_brok', 'inst_eimi', '2025-03-05', 9000, 10);
  buyFor('acc_brok', 'inst_pko', '2025-03-05', 5000, 5);
  sell('acc_brok', 'inst_cdr', '2025-08-19', 15, 5);
  withdraw('acc_brok', '2025-09-02', 5000, 'Wypłata na wakacje');
  deposit('acc_brok', '2026-02-10', 10000, 'Zasilenie konta');
  buyFor('acc_brok', 'inst_eimi', '2026-02-11', 6000, 10);
  buyFor('acc_brok', 'inst_pkn', '2026-02-11', 3500, 5);

  // Dywidendy (brutto na akcję) – podatek Belki liczony automatycznie
  const sharesAt = (instId, date) =>
    state.trades
      .filter((t) => t.accountId === 'acc_brok' && t.instrumentId === instId && t.date <= date)
      .reduce((s, t) => s + (t.side === 'BUY' ? t.quantity : -t.quantity), 0);
  const dividends = [
    ['inst_pko', '2024-07-03', 5.47],
    ['inst_pzu', '2024-10-10', 4.0],
    ['inst_pkn', '2024-08-12', 4.15],
    ['inst_pko', '2025-07-02', 5.85],
    ['inst_pzu', '2025-07-09', 4.5],
    ['inst_pkn', '2025-08-11', 6.0],
    ['inst_pko', '2026-07-01', 6.32],
    ['inst_pzu', '2026-07-08', 4.85],
    ['inst_pkn', '2026-08-10', 6.2],
  ];
  for (const [instId, date, dps] of dividends) {
    if (date > todayIso) continue;
    const shares = sharesAt(instId, date);
    if (shares <= 0) continue;
    state.income.push({
      id: id('inc'),
      accountId: 'acc_brok',
      instrumentId: instId,
      date,
      type: 'DIVIDEND',
      gross: Math.round(shares * dps * 100) / 100,
      foreignTax: 0,
      note: `${shares} szt. × ${dps.toFixed(2)} PLN`,
    });
  }

  // Obligacje skarbowe
  deposit('acc_bonds', '2024-03-11', 20000, 'Środki na obligacje');
  state.bonds.push({ id: 'bond_edo1', accountId: 'acc_bonds', type: 'EDO', series: 'EDO0334', purchaseDate: '2024-03-11', quantity: 120, firstYearRate: 6.8, margin: 2.0, inflation: 3.5 });
  state.bonds.push({ id: 'bond_coi1', accountId: 'acc_bonds', type: 'COI', series: 'COI0328', purchaseDate: '2024-03-11', quantity: 80, firstYearRate: 6.55, margin: 1.5, inflation: 3.5 });
  deposit('acc_bonds', '2025-06-16', 10000, 'Środki na obligacje');
  state.bonds.push({ id: 'bond_tos1', accountId: 'acc_bonds', type: 'TOS', series: 'TOS0628', purchaseDate: '2025-06-16', quantity: 60, firstYearRate: 5.65, margin: 0, inflation: 0 });
  deposit('acc_bonds', '2026-02-16', 5000, 'Środki na obligacje');
  state.bonds.push({ id: 'bond_ror1', accountId: 'acc_bonds', type: 'ROR', series: 'ROR0227', purchaseDate: '2026-02-16', quantity: 50, firstYearRate: 4.25, margin: 0, inflation: 4.0 });

  // Konto oszczędnościowe z miesięczną kapitalizacją odsetek
  deposit('acc_sav', '2024-01-02', 15000, 'Poduszka finansowa');
  deposit('acc_sav', '2025-01-03', 10000, 'Dopłata do poduszki');
  withdraw('acc_sav', '2026-05-06', 8000, 'Remont');
  let savBalance = 0;
  const savEvents = [...state.cashflows.filter((c) => c.accountId === 'acc_sav')];
  monthDates(2024, 2, todayIso, 1).forEach((date) => {
    savBalance = savEvents
      .filter((c) => c.date < date)
      .reduce((s, c) => s + (c.type === 'DEPOSIT' ? c.amount : -c.amount), 0);
    const earned = state.income
      .filter((i) => i.accountId === 'acc_sav' && i.date < date)
      .reduce((s, i) => s + i.gross * 0.81, 0);
    const year = Number(date.slice(0, 4));
    const rate = year === 2024 ? 0.05 : year === 2025 ? 0.045 : 0.04;
    const gross = Math.round(((savBalance + earned) * rate) / 12 * 100) / 100;
    if (gross > 0) {
      state.income.push({ id: id('inc'), accountId: 'acc_sav', date, type: 'INTEREST', gross, foreignTax: 0, note: `Kapitalizacja ${(rate * 100).toFixed(2)}%` });
    }
  });

  // Notowania początkowe (mock) – dzienne zmiany losowe
  const quotes = {};
  for (const inst of INSTRUMENTS) {
    const change = (rand() - 0.5) * 0.05;
    quotes[inst.id] = {
      price: inst.mockPrice,
      prevClose: Math.round((inst.mockPrice / (1 + change)) * 100) / 100,
      currency: inst.currency,
      source: 'Mock (dane demo)',
      updatedAt: today.toISOString(),
    };
  }
  state.prices = {
    quotes,
    fx: { rates: { ...FX }, source: 'Mock (dane demo)', updatedAt: today.toISOString() },
    status: 'mock',
    lastRefresh: today.toISOString(),
    log: [{ level: 'info', message: 'Załadowano dane demonstracyjne' }],
  };

  // Etap 3: automatyczne odsetki na koncie oszczędnościowym od bieżącego okresu kapitalizacji
  const sav = state.accounts.find((a) => a.id === 'acc_sav');
  sav.autoInterest = true;
  sav.autoInterestFrom = isoDay(new Date(today.getFullYear(), today.getMonth(), 1));

  // Etap 4: harmonogram ogłoszonych dywidend (daty względem dziś, aby demo zawsze pokazywało statusy)
  const rel = (days) => isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() + days));
  state.dividendSchedule = [
    { id: 'dsch_cdr', instrumentId: 'inst_cdr', dps: 1.0, currency: 'PLN', exDate: rel(-7), payDate: rel(7), withholdingPct: 0, note: 'Dywidenda z zysku (demo)' },
    { id: 'dsch_pkn', instrumentId: 'inst_pkn', dps: 2.0, currency: 'PLN', exDate: rel(12), payDate: rel(28), withholdingPct: 0, note: 'Zaliczka na poczet dywidendy (demo)' },
    { id: 'dsch_pzu', instrumentId: 'inst_pzu', dps: 1.2, currency: 'PLN', exDate: rel(45), payDate: rel(60), withholdingPct: 0, note: 'Dywidenda zaliczkowa (demo)' },
  ];
  const events = {
    inst_pko: { date: rel(14), label: 'Raport kwartalny' },
    inst_cdr: { date: rel(36), label: 'Raport kwartalny' },
    inst_pzu: { date: rel(37), label: 'Raport kwartalny' },
    inst_pkn: { date: rel(9), label: 'Raport kwartalny' },
    inst_dnp: { date: rel(20), label: 'Raport kwartalny' },
  };
  state.instruments = state.instruments.map((i) => (events[i.id] ? { ...i, dividend: { ...(i.dividend || {}), nextEvent: events[i.id] } } : i));

  // Etap 6: cele roczne i dziennik decyzji
  const y = today.getFullYear();
  state.goals = [
    { id: 'goal_ike', year: y, category: 'FINANCIAL', name: 'Wypełnić limit IKE', target: 28260, current: 0, unit: 'zł', step: 100, source: 'IKE_LIMIT' },
    { id: 'goal_ikze', year: y, category: 'FINANCIAL', name: 'Wypełnić limit IKZE', target: 11304, current: 0, unit: 'zł', step: 100, source: 'IKZE_LIMIT' },
    { id: 'goal_div', year: y, category: 'FINANCIAL', name: 'Dywidendy netto w roku', target: 3000, current: 0, unit: 'zł', step: 100, source: 'DIVIDENDS' },
    { id: 'goal_nw', year: y, category: 'FINANCIAL', name: 'Majątek 750 tys. zł', target: 750000, current: 0, unit: 'zł', step: 1000, source: 'NET_WORTH' },
    { id: 'goal_books', year: y, category: 'GROWTH', name: 'Przeczytać książki o inwestowaniu', target: 5, current: 2, unit: 'książek', step: 1, source: 'MANUAL' },
    { id: 'goal_course', year: y, category: 'GROWTH', name: 'Kurs analizy sprawozdań finansowych', target: 12, current: 9, unit: 'modułów', step: 1, source: 'MANUAL' },
    { id: 'goal_emergency', year: y, category: 'OTHER', name: 'Poduszka 6 miesięcy wydatków', target: 6, current: 4, unit: 'mies.', step: 1, source: 'MANUAL' },
    { id: 'goal_journal', year: y, category: 'OTHER', name: 'Wpis w dzienniku po każdej decyzji', target: 12, current: 7, unit: 'wpisów', step: 1, source: 'MANUAL' },
  ];
  const firstTrade = (instId, accId) => state.trades.find((t) => t.instrumentId === instId && t.accountId === accId);
  const sellCdr = state.trades.find((t) => t.instrumentId === 'inst_cdr' && t.side === 'SELL');
  state.journal = [
    { id: 'jr_1', date: '2024-01-05', title: 'Start IKE – strategia pasywna', instrumentId: 'inst_vwce', accountId: 'acc_ike', tradeId: firstTrade('inst_vwce', 'acc_ike')?.id || null, tags: ['#strategia', '#zakup'], body: 'Wybrałem VWCE jako trzon portfela: globalna dywersyfikacja, niski TER, akumulacja. Plan: co miesiąc stała wpłata, bez market timingu.' },
    { id: 'jr_2', date: '2024-02-07', title: 'Koszyk spółek dywidendowych GPW', instrumentId: 'inst_pko', accountId: 'acc_brok', tradeId: firstTrade('inst_pko', 'acc_brok')?.id || null, tags: ['#zakup', '#dywidenda'], body: 'Kupiłem PKO, PZU i Orlen pod przyszły dochód pasywny. Akceptuję podatek Belki – IKE zostawiam na ETF-y akumulujące.' },
    { id: 'jr_3', date: '2025-08-19', title: 'Częściowa realizacja zysku na CDR', instrumentId: 'inst_cdr', accountId: 'acc_brok', tradeId: sellCdr?.id || null, tags: ['#sprzedaż', '#emocje'], body: 'Pozycja urosła ponad wagę docelową. Sprzedałem część, żeby wrócić do planu – trochę FOMO, ale trzymam się zasad rebalancingu.' },
    { id: 'jr_4', date: '2025-12-10', title: 'Roczna wpłata na IKZE', instrumentId: 'inst_cspx', accountId: 'acc_ikze', tradeId: null, tags: ['#strategia', '#podatki'], body: 'Wpłata przed końcem roku = zwrot z PIT w kwietniu. Od 2026 przechodzę na wpłaty miesięczne, żeby uśrednić cenę.' },
  ];

  // Wagi docelowe (Etap 2)
  state.settings.allocation = {
    ...state.settings.allocation,
    classTargets: { STOCKS: 15, ETF: 55, BONDS: 15, CASH: 15 },
    instrumentTargets: {
      inst_vwce: 40,
      inst_cspx: 15,
      inst_eimi: 8,
      inst_wig20tr: 10,
      inst_pko: 7,
      inst_cdr: 5,
      inst_pzu: 5,
      inst_dnp: 4,
      inst_pkn: 6,
    },
    calculator: { ...state.settings.allocation.calculator, accountId: 'acc_ike' },
  };

  // Pozostałe aktywa
  state.otherAssets = [
    { id: 'oth_flat', name: 'Mieszkanie – Kraków', category: 'REAL_ESTATE', value: 780000, liabilities: 310000, includeInNetWorth: true, note: 'Wartość szacunkowa, hipoteka jako zobowiązanie' },
    { id: 'oth_car', name: 'Samochód', category: 'VEHICLE', value: 42000, liabilities: 0, includeInNetWorth: false, note: '' },
  ];

  // Historyczne migawki (co tydzień) wyliczone z historycznej ścieżki cen
  const snaps = [];
  let d = new Date(DEMO_START);
  const end = new Date(yesterday);
  while (d <= end) {
    const date = isoDay(d);
    const lookup = (inst) => {
      const full = instById[inst.id];
      return full ? demoPrice(full, date, todayIso) * FX[full.currency] : null;
    };
    snaps.push(buildSnapshot(state, date, lookup));
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
  }
  // Migawki na przełomie roku i miesiąca – precyzyjne punkty startowe dla YTD / 1M
  const extra = [
    isoDay(new Date(today.getFullYear() - 1, 11, 31)),
    isoDay(new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())),
  ];
  // Etap 5: migawki na koniec każdego miesiąca – precyzyjne podsumowania miesięczne i roczne
  for (let m = new Date(2024, 0, 31); m < today; m = new Date(m.getFullYear(), m.getMonth() + 2, 0)) extra.push(isoDay(m));
  // oraz dzienne migawki z ostatnich ~6 tygodni (jak przy codziennym korzystaniu z aplikacji)
  for (let k = 45; k >= 1; k -= 1) extra.push(isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - k)));
  for (const date of extra) {
    if (date >= todayIso || date < DEMO_START || snaps.some((s) => s.date === date)) continue;
    const lookup = (inst) => {
      const full = instById[inst.id];
      return full ? demoPrice(full, date, todayIso) * FX[full.currency] : null;
    };
    snaps.push(buildSnapshot(state, date, lookup));
  }
  snaps.sort((a, b) => (a.date < b.date ? -1 : 1));
  state.snapshots = snaps;
  return state;
}
