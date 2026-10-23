// Model danych aplikacji – jedno źródło prawdy dla wszystkich modułów (etapy 1–6).
import { BUILTIN_BONDS_ID, DEFAULT_CONTRIBUTION_LIMITS, builtinBondsAccount } from '../lib/constants.js';

export const STATE_VERSION = 1;
export const STORAGE_KEY = 'wealth-app-state-v1';

export const COLLECTIONS = [
  'accounts', // konta / wrappery: IKE, IKZE, BROKERAGE, BONDS (obligacje skarbowe), SAVINGS
  'instruments', // akcje i ETF (ticker, symbol Yahoo, waluta, TER)
  'trades', // transakcje kupna/sprzedaży
  'cashflows', // wpłaty / wypłaty własne (wkład netto)
  'income', // dywidendy i odsetki (brutto + podatek u źródła)
  'bonds', // obligacje skarbowe EDO/COI/TOS/ROR
  'otherAssets', // nieruchomości / inne aktywa
  'goals', // cele roczne (etap późniejszy)
  'snapshots', // dzienne migawki wartości kont (historia, TWR)
  'dividendSchedule', // Etap 4: ogłoszone dywidendy (DPS, Ex-Date, data wypłaty, status księgowania)
  'journal', // Etap 6: dziennik decyzji inwestycyjnych
];

// Etap 2: wagi docelowe i ustawienia kalkulatora dopłat
export function defaultAllocation() {
  return {
    scope: 'INVEST', // filtr kont, jak w statystykach: 'INVEST' (bez poduszki) | 'ALL' | 'TYPE:IKE' | id konta
    scopeV2: true, // zakres domyślny zmieniony na portfel inwestycyjny
    classTargets: { STOCKS: 0, ETF: 0, BONDS: 0, CASH: 0 }, // % całego portfela (bez nieruchomości)
    instrumentTargets: {}, // { [instrumentId]: % } – wagi w części akcje + ETF, suma 100%
    driftThreshold: 5, // próg alertu w punktach procentowych
    calculator: {
      accountId: null,
      minOrder: 0,
      fractional: false,
      includeCash: false,
    },
  };
}

// Etap 4: parametry symulacji FIRE (kwoty docelowe w dzisiejszej sile nabywczej)
export function defaultFire() {
  return {
    targetYear: 2055,
    targetMonthlyIncome: 8000,
    targetNetWorth: 3000000,
    criterion: 'BOTH', // 'INCOME' | 'NETWORTH' | 'BOTH'
    monthlyContribution: 3000,
    contributionIndexed: true, // wpłata rośnie co roku o inflację
    scenario: 'BASE',
    returns: { PESSIMISTIC: 4, BASE: 7, OPTIMISTIC: 9 },
    dividendYield: 3.5,
    dgr: 5,
    inflation: 3,
    includeOtherAssets: false,
    realValues: true,
  };
}

export function defaultSettings() {
  return {
    theme: 'system', // 'light' | 'dark' | 'system'
    baseCurrency: 'PLN',
    includeOtherAssets: true,
    taxBracket: 'SCALE_12',
    annualIncome: 0,
    selfEmployed: false,
    contributionLimits: { ...DEFAULT_CONTRIBUTION_LIMITS },
    allocation: defaultAllocation(),
    fire: defaultFire(),
    // Etap 6: polityka limitów IKE/IKZE – automatyczne uzupełnienie po Nowym Roku
    limitsPolicy: { autoUpdate: true, growthPct: 6, projectedWages: {} },
    contributionLimitsMeta: {}, // { rok: 'official' | 'manual' | 'wage' | 'estimate' }
    goalsReview: { reviewedYears: [] }, // lata, dla których wykonano zamknięcie roku i przeniesienie celów
    dividendPrefs: { dgr: 6, years: 10, drip: true, reminderDays: 30, autoSync: true, autoBook: true, autoBookV2: true, lastSync: null }, // Etap 4 (+ automatyczne dane dywidend)
    customBenchmarks: [], // własne benchmarki o stałej stopie: [{ id: 'custom_…', name, ratePct }]
    cpiOverrides: {}, // Etap 3: ręczne odczyty CPI r/r { 'RRRR-MM': % }
    priceMode: 'auto', // 'auto' | 'mock'
    corsProxy: 'https://corsproxy.io/?url=',
    refreshOnEnter: true, // odświeżanie notowań przy wejściu do aplikacji w godzinach sesji GPW
  };
}

export function createEmptyState() {
  return {
    version: STATE_VERSION,
    meta: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      demo: false,
    },
    settings: defaultSettings(),
    accounts: [],
    instruments: [],
    trades: [],
    cashflows: [],
    income: [],
    bonds: [],
    otherAssets: [],
    goals: [],
    dividendSchedule: [],
    journal: [],
    snapshots: [],
    // Etap 3: tygodniowa historia cen instrumentów, benchmarków i kursów walut
    priceHistory: {
      series: {}, // { [symbol]: { points: [[RRRR-MM-DD, close]], currency, source, updatedAt } }
      status: 'idle',
      updatedAt: null,
      log: [],
    },
    prices: {
      quotes: {},
      fx: { rates: { PLN: 1, USD: 3.65, EUR: 4.25, GBP: 4.88, CHF: 4.55 }, source: 'domyślne', updatedAt: null },
      status: 'idle',
      lastRefresh: null,
      log: [],
    },
  };
}

// Uzupełnia brakujące pola (np. po imporcie starszej wersji pliku) i zwraca poprawny stan.
export function migrateState(raw) {
  const base = createEmptyState();
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base, ...raw };
  out.version = STATE_VERSION;
  out.meta = { ...base.meta, ...(raw.meta || {}) };
  out.settings = {
    ...base.settings,
    ...(raw.settings || {}),
    contributionLimits: { ...base.settings.contributionLimits, ...(raw.settings?.contributionLimits || {}) },
    allocation: {
      ...base.settings.allocation,
      ...(raw.settings?.allocation || {}),
      classTargets: { ...base.settings.allocation.classTargets, ...(raw.settings?.allocation?.classTargets || {}) },
      instrumentTargets: { ...(raw.settings?.allocation?.instrumentTargets || {}) },
      calculator: { ...base.settings.allocation.calculator, ...(raw.settings?.allocation?.calculator || {}) },
    },
    fire: {
      ...base.settings.fire,
      ...(raw.settings?.fire || {}),
      returns: { ...base.settings.fire.returns, ...(raw.settings?.fire?.returns || {}) },
    },
    // Automatyczne księgowanie dywidend włączane jednorazowo także w starszych danych (bez ręcznego „Zaksięguj”)
    dividendPrefs: {
      ...base.settings.dividendPrefs,
      ...(raw.settings?.dividendPrefs || {}),
      ...(raw.settings?.dividendPrefs && !raw.settings.dividendPrefs.autoBookV2 ? { autoBook: true, autoBookV2: true } : {}),
    },
    goalsReview: {
      reviewedYears: Array.isArray(raw.settings?.goalsReview?.reviewedYears) ? raw.settings.goalsReview.reviewedYears : [],
    },
    limitsPolicy: {
      ...base.settings.limitsPolicy,
      ...(raw.settings?.limitsPolicy || {}),
      projectedWages: { ...(raw.settings?.limitsPolicy?.projectedWages || {}) },
    },
  };
  delete out.settings.oki;
  // Alokacja dotyczy portfela inwestycyjnego – dotychczasowy zakres „wszystkie konta” zamieniany jednorazowo
  if (raw.settings?.allocation && !raw.settings.allocation.scopeV2) {
    out.settings.allocation = { ...out.settings.allocation, scope: out.settings.allocation.scope === 'ALL' ? 'INVEST' : out.settings.allocation.scope, scopeV2: true };
  }
  out.settings.customBenchmarks = Array.isArray(raw.settings?.customBenchmarks)
    ? raw.settings.customBenchmarks.filter((b) => b && b.id && b.name)
    : [];
  for (const c of COLLECTIONS) out[c] = Array.isArray(raw[c]) ? raw[c] : [];
  // Dawne wpłaty „na zakup” z importu otwartych pozycji XTB (pełny koszt każdej transzy) zawyżały sumę wpłat, gdy zakup
  // opłacono z wolnych środków – usuwane; rzeczywisty niedobór gotówki pokrywa automatyczne „Uzupełnienie środków”
  out.cashflows = out.cashflows.filter((c) => !String(c?.id || '').startsWith('xtbposfund_'));
  out.accounts = migrateAccounts(out);
  migrateBonds(out);
  // Konto oszczędnościowe – uniwersalny instrument poduszki: nazwa bez banku („Konto oszczędnościowe”, przy kilku – z numerem)
  let savingsNo = 0;
  out.accounts = out.accounts.map((a) => {
    if (a?.type !== 'SAVINGS') return a;
    savingsNo += 1;
    const name = savingsNo === 1 ? 'Konto oszczędnościowe' : `Konto oszczędnościowe ${savingsNo}`;
    return a.name === name ? a : { ...a, name, bankName: a.bankName || a.institution || a.name };
  });
  // Nieruchomości/ruchomości: dawny przełącznik „wliczaj do majątku” = widoczność w Portfelu (do majątku zawsze)
  out.otherAssets = out.otherAssets.map((a) => (a && a.showInPortfolio === undefined ? { ...a, showInPortfolio: a.includeInNetWorth !== false } : a));
  out.priceHistory = {
    ...base.priceHistory,
    ...(raw.priceHistory || {}),
    series: { ...(raw.priceHistory?.series || {}) },
  };
  out.prices = {
    ...base.prices,
    ...(raw.prices || {}),
    fx: { ...base.prices.fx, ...(raw.prices?.fx || {}), rates: { ...base.prices.fx.rates, ...(raw.prices?.fx?.rates || {}) } },
    quotes: { ...(raw.prices?.quotes || {}) },
  };
  // Stan „loading” zapisany przy zamknięciu aplikacji w trakcie pobierania (lub z chmury) blokowałby kolejne odświeżenia
  if (out.prices.status === 'loading') out.prices.status = 'offline';
  if (out.priceHistory.status === 'loading') out.priceHistory.status = 'offline';
  return out;
}

// Porządki w kontach: OKI usunięte z systemu (puste konto znika, z historią → konto maklerskie),
// konto maklerskie zawierające wyłącznie obligacje → typ „Obligacje skarbowe”.
function migrateAccounts(state) {
  const used = (id, collections) => collections.some((c) => state[c].some((x) => x.accountId === id));
  const out = [];
  for (const a of state.accounts) {
    if (!a || typeof a !== 'object') continue;
    if (a.type === 'OKI') {
      if (!used(a.id, ['trades', 'cashflows', 'income', 'bonds'])) continue;
      out.push({ ...a, type: 'BROKERAGE' });
      continue;
    }
    if (a.type === 'BROKERAGE' && !a.typeMigrated && used(a.id, ['bonds']) && !used(a.id, ['trades', 'income'])) {
      out.push({ ...a, type: 'BONDS', typeMigrated: true });
      continue;
    }
    out.push(a);
  }
  return out;
}

// Obligacje skarbowe jako wbudowany instrument: wszystkie transze w jednym rejestrze „Obligacje skarbowe”.
// Kilka kont obligacji → scalane w jedno; transze z IKE/IKZE/konta maklerskiego przenoszone do rejestru
// (z wypłatą kosztu zakupu z konta źródłowego albo przeniesieniem powiązanej wpłaty). Wywoływane przy każdym
// wczytaniu – po migracji nic już nie zmienia.
function migrateBonds(state) {
  const bondAccounts = state.accounts.filter((a) => a.type === 'BONDS');
  if (!bondAccounts.length && !state.bonds.length) return;
  let target = bondAccounts.find((a) => a.id === BUILTIN_BONDS_ID) || bondAccounts[0];
  if (!target) {
    const first = state.bonds.reduce((m, b) => (!m || (b.purchaseDate && b.purchaseDate < m) ? b.purchaseDate : m), null);
    target = builtinBondsAccount(first || new Date().toISOString().slice(0, 10));
    if (state.accounts.some((a) => a.id === target.id)) target = { ...target, id: `${BUILTIN_BONDS_ID}_builtin` };
    state.accounts = [...state.accounts, target];
  } else if (!target.builtin) {
    state.accounts = state.accounts.map((a) => (a.id === target.id ? { ...a, builtin: true } : a));
  }
  const merged = new Set(bondAccounts.filter((a) => a.id !== target.id).map((a) => a.id));
  const remap = (x) => (merged.has(x.accountId) ? { ...x, accountId: target.id } : x);
  if (merged.size) {
    for (const c of ['cashflows', 'income', 'trades', 'bonds']) state[c] = state[c].map(remap);
    state.accounts = state.accounts.filter((a) => !merged.has(a.id));
  }
  const accById = Object.fromEntries(state.accounts.map((a) => [a.id, a]));
  // Rejestr obligacji bez gotówki: wpłaty/wypłaty na koncie obligacji (np. „Środki na obligacje”) i dawne
  // automatyczne wypłaty z wykupu są zbędne – kapitałem są wyłącznie aktywne transze (zakup = wpływ kapitału)
  state.cashflows = state.cashflows.filter((c) => accById[c.accountId]?.type !== 'BONDS' && !String(c.id).startsWith('bondredeem_'));
  const moved = state.bonds.filter((b) => b.accountId !== target.id);
  if (!moved.length) return;
  const extraFlows = [];
  const linked = new Set(moved.map((b) => b.linkedCashflowId).filter(Boolean));
  // Powiązana wpłata na zakup transzy jest zbędna – zakup transzy sam jest wpływem kapitału do rejestru
  state.cashflows = state.cashflows.filter((c) => !linked.has(c.id));
  for (const b of moved) {
    const origin = accById[b.accountId];
    if (origin && origin.type !== 'SAVINGS' && !b.linkedCashflowId) {
      extraFlows.push({
        id: `bondmove_${b.id}`,
        accountId: origin.id,
        date: b.purchaseDate,
        type: 'WITHDRAWAL',
        amount: (Number(b.quantity) || 0) * 100,
        note: `Przeniesienie obligacji ${b.series || b.type || ''} do rejestru „Obligacje skarbowe”`.replace('  ', ' '),
        source: 'BOND_MOVE',
      });
    }
  }
  const movedIds = new Set(moved.map((b) => b.id));
  state.bonds = state.bonds.map((b) => (movedIds.has(b.id) ? { ...b, accountId: target.id, movedFrom: b.accountId } : b));
  state.cashflows = [...state.cashflows.filter((c) => !extraFlows.some((x) => x.id === c.id)), ...extraFlows];
}

export function validateImported(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') errors.push('Plik nie zawiera obiektu JSON.');
  else {
    if (!Array.isArray(raw.accounts)) errors.push('Brak listy kont (accounts).');
    if (!Array.isArray(raw.cashflows)) errors.push('Brak rejestru wpłat (cashflows).');
    if (raw.version && raw.version > STATE_VERSION) errors.push(`Plik pochodzi z nowszej wersji aplikacji (v${raw.version}).`);
  }
  return errors;
}
