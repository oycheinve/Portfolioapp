// Stałe domenowe: typy kont (wrappery), klasy aktywów, obligacje skarbowe, limity.

export const BELKA_RATE = 0.19;
export const IKZE_PAYOUT_TAX = 0.1; // zryczałtowany podatek przy wypłacie z IKZE po 65. r.ż.

export const ACCOUNT_TYPES = {
  IKE: {
    id: 'IKE',
    label: 'IKE',
    fullName: 'Indywidualne Konto Emerytalne',
    belkaRate: 0,
    hasLimit: true,
    limitKey: 'ike',
    color: '#2a78d6',
  },
  IKZE: {
    id: 'IKZE',
    label: 'IKZE',
    fullName: 'Indywidualne Konto Zabezpieczenia Emerytalnego',
    belkaRate: 0,
    hasLimit: true,
    limitKey: 'ikze',
    taxDeductible: true,
    color: '#6250d6',
  },
  BROKERAGE: {
    id: 'BROKERAGE',
    label: 'Maklerskie',
    fullName: 'Zwykłe konto maklerskie',
    belkaRate: BELKA_RATE,
    hasLimit: false,
    color: '#eb6834',
  },
  BONDS: {
    id: 'BONDS',
    label: 'Obligacje skarbowe',
    fullName: 'Rachunek obligacji skarbowych (rejestr)',
    belkaRate: BELKA_RATE,
    hasLimit: false,
    isBonds: true,
    color: '#1baf7a',
  },
  SAVINGS: {
    id: 'SAVINGS',
    label: 'Oszczędnościowe',
    fullName: 'Konto oszczędnościowe / gotówka',
    belkaRate: BELKA_RATE,
    hasLimit: false,
    isSavings: true,
    color: '#eda100',
  },
};

export const ACCOUNT_TYPE_LIST = Object.values(ACCOUNT_TYPES);

// Banki dla kont oszczędnościowych; Revolut nie pobiera podatku Belki (rozliczenie samodzielne w PIT-38)
export const SAVINGS_BANKS = [
  { id: 'PKO BP', label: 'PKO BP' },
  { id: 'mBank', label: 'mBank' },
  { id: 'Santander', label: 'Santander Bank Polska' },
  { id: 'ING', label: 'ING Bank Śląski' },
  { id: 'Pekao', label: 'Bank Pekao' },
  { id: 'Millennium', label: 'Bank Millennium' },
  { id: 'Alior', label: 'Alior Bank' },
  { id: 'VeloBank', label: 'VeloBank' },
  { id: 'Revolut', label: 'Revolut (podatek odroczony)', belkaDeferred: true },
  { id: 'Inny', label: 'Inny bank' },
];

// Domyślna prowizja XTB za przewalutowanie na IKE (zakup i sprzedaż walorów w walutach obcych z rachunku PLN)
export const XTB_FX_FEE_PCT = 0.05;

export const INSTRUMENT_KINDS = {
  STOCK: { id: 'STOCK', label: 'Akcja' },
  ETF: { id: 'ETF', label: 'ETF' },
};

export const ASSET_CLASSES = {
  STOCKS: { id: 'STOCKS', label: 'Akcje', risk: 'market' },
  ETF: { id: 'ETF', label: 'ETF', risk: 'market' },
  BONDS: { id: 'BONDS', label: 'Obligacje skarbowe', risk: 'safe' },
  CASH: { id: 'CASH', label: 'Gotówka / Oszczędności', risk: 'safe' },
  OTHER: { id: 'OTHER', label: 'Nieruchomości / Inne', risk: 'other' },
};

export const OTHER_ASSET_CATEGORIES = {
  REAL_ESTATE: 'Nieruchomość',
  VEHICLE: 'Pojazd',
  MOVABLE: 'Ruchomość (sprzęt, wyposażenie)',
  COLLECTIBLE: 'Kolekcje / Złoto',
  OTHER: 'Inne',
};

// Obligacje skarbowe – parametry konstrukcyjne
// capitalization: ANNUAL = odsetki kapitalizowane co rok (wypłata przy wykupie)
// payout: ANNUAL / MONTHLY = odsetki wypłacane okresowo
export const BOND_TYPES = {
  ROR: {
    id: 'ROR',
    label: 'ROR – roczne, zmienne',
    years: 1,
    interestMode: 'PAYOUT',
    periodMonths: 1,
    indexed: 'NBP', // oprocentowanie zmienne (stopa referencyjna NBP + marża)
  },
  TOS: {
    id: 'TOS',
    label: 'TOS – 3-letnie, stałe',
    years: 3,
    interestMode: 'CAPITALIZE',
    periodMonths: 12,
    indexed: 'FIXED',
  },
  COI: {
    id: 'COI',
    label: 'COI – 4-letnie, indeksowane inflacją',
    years: 4,
    interestMode: 'PAYOUT',
    periodMonths: 12,
    indexed: 'CPI',
  },
  EDO: {
    id: 'EDO',
    label: 'EDO – 10-letnie, indeksowane inflacją',
    years: 10,
    interestMode: 'CAPITALIZE',
    periodMonths: 12,
    indexed: 'CPI',
  },
};

export const BOND_NOMINAL = 100;

export const CAPITALIZATION = {
  DAILY: { id: 'DAILY', label: 'Dzienna', periodsPerYear: 365 },
  MONTHLY: { id: 'MONTHLY', label: 'Miesięczna', periodsPerYear: 12 },
  QUARTERLY: { id: 'QUARTERLY', label: 'Kwartalna', periodsPerYear: 4 },
  YEARLY: { id: 'YEARLY', label: 'Roczna', periodsPerYear: 1 },
};

// Roczne limity wpłat (PLN). Edytowalne w ustawieniach.
export const DEFAULT_CONTRIBUTION_LIMITS = {
  2024: { ike: 23472, ikze: 9388.8, ikzeSelfEmployed: 14083.2, oki: 0 },
  2025: { ike: 26019, ikze: 10407.6, ikzeSelfEmployed: 15611.4, oki: 0 },
  2026: { ike: 28260, ikze: 11304, ikzeSelfEmployed: 16956, oki: 0 },
};

export const TAX_BRACKETS = {
  SCALE_12: { id: 'SCALE_12', label: 'Skala – 12%', rate: 0.12 },
  SCALE_32: { id: 'SCALE_32', label: 'Skala – 32%', rate: 0.32 },
  SCALE_AUTO: { id: 'SCALE_AUTO', label: 'Skala – wylicz z dochodu', rate: null },
  LINEAR_19: { id: 'LINEAR_19', label: 'Liniowy – 19%', rate: 0.19 },
  LUMP_SUM: { id: 'LUMP_SUM', label: 'Ryczałt (brak odliczenia)', rate: 0 },
};

export const SCALE_THRESHOLD = 120000;

export const CASHFLOW_TYPES = {
  DEPOSIT: { id: 'DEPOSIT', label: 'Wpłata' },
  WITHDRAWAL: { id: 'WITHDRAWAL', label: 'Wypłata' },
};

export const INCOME_TYPES = {
  DIVIDEND: { id: 'DIVIDEND', label: 'Dywidenda' },
  INTEREST: { id: 'INTEREST', label: 'Odsetki' },
};

export const SUPPORTED_CURRENCIES = ['PLN', 'USD', 'EUR', 'GBP', 'CHF'];

// Etap 3: inflacja CPI w Polsce (r/r, %, GUS). Odczyty oznaczone jako szacunek należy zweryfikować –
// można je nadpisać w module Obligacji (settings.cpiOverrides).
const CPI_RAW = {
  2023: [16.6, 18.4, 16.1, 14.7, 13.0, 11.5, 10.8, 10.1, 8.2, 6.6, 6.6, 6.2],
  2024: [3.7, 2.8, 2.0, 2.4, 2.5, 2.6, 4.2, 4.3, 4.9, 5.0, 4.7, 4.7],
  2025: [4.9, 4.9, 4.9, 4.3, 4.0, 4.1, 3.1, 2.9, 2.9, 2.8, 2.6, 2.5],
  2026: [2.5, 2.4, 2.4, 2.5, 2.6, 2.6, 2.7, 2.7, 2.8],
};
const CPI_ESTIMATE_FROM = '2025-11';

export const CPI_PL_YOY = Object.fromEntries(
  Object.entries(CPI_RAW).flatMap(([year, values]) =>
    values.map((v, i) => {
      const key = `${year}-${String(i + 1).padStart(2, '0')}`;
      return [key, { value: v, estimate: key >= CPI_ESTIMATE_FROM }];
    }),
  ),
);

// Benchmarki: symbol Yahoo + waluta; proxy = symbol instrumentu z portfela użyty offline do rekonstrukcji
export const BENCHMARKS = {
  SP500: { id: 'SP500', label: 'S&P 500', yahooSymbol: '^GSPC', currency: 'USD', proxySymbols: ['CSPX.L', 'SXR8.DE', 'VUAA.DE'] },
  WIG20TR: { id: 'WIG20TR', label: 'WIG20TR', yahooSymbol: 'ETFBW20TR.WA', currency: 'PLN', proxySymbols: ['ETFBW20TR.WA'] },
  WIG: { id: 'WIG', label: 'WIG', yahooSymbol: 'WIG.WA', currency: 'PLN', proxySymbols: ['ETFBW20TR.WA'] },
  MSCI_WORLD: { id: 'MSCI_WORLD', label: 'MSCI World', yahooSymbol: 'IWDA.AS', currency: 'EUR', proxySymbols: ['IWDA.AS', 'VWCE.DE', 'SWDA.L'] },
  CPI: { id: 'CPI', label: 'Inflacja CPI', yahooSymbol: null, currency: 'PLN', proxySymbols: [] },
};

// Własne benchmarki o stałej stopie (np. „Inflacja własna 5%”, „Moja lokata 4%”) – zapisywane w settings.customBenchmarks
export function isCustomBenchmark(id) {
  return typeof id === 'string' && id.startsWith('custom_');
}

export function benchmarkDefs(settings) {
  const out = { ...BENCHMARKS };
  for (const c of settings?.customBenchmarks || []) {
    out[c.id] = { id: c.id, label: c.name, custom: true, ratePct: Number(c.ratePct) || 0, yahooSymbol: null, currency: 'PLN', proxySymbols: [] };
  }
  return out;
}

export function benchmarkLabel(settings, id) {
  return benchmarkDefs(settings)[id]?.label || id;
}

export const FX_HISTORY_SYMBOLS = { USD: 'USDPLN=X', EUR: 'EURPLN=X', GBP: 'GBPPLN=X', CHF: 'CHFPLN=X' };
