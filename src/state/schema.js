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
];

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
    snapshots: [],
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
  };
  for (const c of COLLECTIONS) out[c] = Array.isArray(raw[c]) ? raw[c] : [];
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
