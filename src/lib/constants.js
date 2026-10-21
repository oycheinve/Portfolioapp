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
  OKI: {
    id: 'OKI',
    label: 'OKI',
    fullName: 'Osobiste Konto Inwestycyjne',
    // Parametry OKI są konfigurowalne w ustawieniach (rozwiązanie w trakcie legislacji).
    belkaRate: 0,
    hasLimit: true,
    limitKey: 'oki',
    color: '#1baf7a',
  },
  BROKERAGE: {
    id: 'BROKERAGE',
    label: 'Maklerskie',
    fullName: 'Zwykłe konto maklerskie',
    belkaRate: BELKA_RATE,
    hasLimit: false,
    color: '#eb6834',
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
