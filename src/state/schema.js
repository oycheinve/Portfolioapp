// Model danych aplikacji – jedno źródło prawdy dla wszystkich modułów (etapy 1–6).
import { DEFAULT_CONTRIBUTION_LIMITS } from '../lib/constants.js';

export const STATE_VERSION = 1;
export const STORAGE_KEY = 'wealth-app-state-v1';

export const COLLECTIONS = [
  'accounts', // konta / wrappery: IKE, IKZE, OKI, BROKERAGE, SAVINGS
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
    scope: 'ALL', // filtr kont, jak w statystykach: 'ALL' | 'TYPE:IKE' | id konta
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
    oki: {
      belkaRate: 0,
      annualLimit: 0,
      note: 'Parametry OKI do uzupełnienia po wejściu w życie ustawy.',
    },
    allocation: defaultAllocation(),
    fire: defaultFire(),
    // Etap 6: polityka limitów IKE/IKZE – automatyczne uzupełnienie po Nowym Roku
    limitsPolicy: { autoUpdate: true, growthPct: 6, projectedWages: {} },
    contributionLimitsMeta: {}, // { rok: 'official' | 'manual' | 'wage' | 'estimate' }
    goalsReview: { reviewedYears: [] }, // lata, dla których wykonano zamknięcie roku i przeniesienie celów
    dividendPrefs: { dgr: 6, years: 10, drip: true, reminderDays: 30 }, // Etap 4
    cpiOverrides: {}, // Etap 3: ręczne odczyty CPI r/r { 'RRRR-MM': % }
    priceMode: 'auto', // 'auto' | 'mock'
    corsProxy: 'https://corsproxy.io/?url=',
    autoRefreshMinutes: 0,
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
    oki: { ...base.settings.oki, ...(raw.settings?.oki || {}) },
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
    dividendPrefs: { ...base.settings.dividendPrefs, ...(raw.settings?.dividendPrefs || {}) },
    goalsReview: {
      reviewedYears: Array.isArray(raw.settings?.goalsReview?.reviewedYears) ? raw.settings.goalsReview.reviewedYears : [],
    },
    limitsPolicy: {
      ...base.settings.limitsPolicy,
      ...(raw.settings?.limitsPolicy || {}),
      projectedWages: { ...(raw.settings?.limitsPolicy?.projectedWages || {}) },
    },
  };
  for (const c of COLLECTIONS) out[c] = Array.isArray(raw[c]) ? raw[c] : [];
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
  return out;
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
