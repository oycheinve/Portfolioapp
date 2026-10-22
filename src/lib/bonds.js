import { BOND_NOMINAL, BOND_TYPES, CPI_PL_YOY } from './constants.js';

const DAY = 86400000;

function parseDate(d) {
  if (d instanceof Date) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const [y, m, day] = String(d).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, day || 1);
}

function addMonths(date, months) {
  const d = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(date.getDate(), lastDay));
  return d;
}

function iso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Tabela CPI r/r: wartości domyślne (GUS) nadpisane odczytami użytkownika z ustawień
export function getCpiTable(settings) {
  const table = {};
  for (const [k, v] of Object.entries(CPI_PL_YOY)) table[k] = { ...v };
  for (const [k, v] of Object.entries(settings?.cpiOverrides || {})) {
    if (Number.isFinite(Number(v)) && v !== '' && v !== null) table[k] = { value: Number(v), estimate: false, manual: true };
  }
  return table;
}

// Szczegóły oprocentowania w okresie odsetkowym (index od 0).
// Rok 1 = oprocentowanie stałe z emisji; kolejne lata COI/EDO: marża + inflacja CPI r/r
// z miesiąca poprzedzającego o 2 miesiące pierwszy miesiąc okresu (zasada z listu emisyjnego).
// Priorytet inflacji: ręczny odczyt w transzy (inflationByYear) → tabela CPI → założenie z transzy.
// TOS: stałe. ROR: stopa referencyjna NBP (pole „inflation”) + marża od 2. miesiąca.
export function bondRateDetails(bond, periodIndex, { periodStart = null, cpi = null } = {}) {
  const type = BOND_TYPES[bond.type];
  const first = (Number(bond.firstYearRate) || 0) / 100;
  const margin = (Number(bond.margin) || 0) / 100;
  const assumption = (Number(bond.inflation) || 0) / 100;
  if (!type || type.indexed === 'FIXED') return { rate: first, source: 'stałe', inflation: null };
  if (type.indexed === 'NBP') {
    if (periodIndex === 0) return { rate: first, source: '1. okres', inflation: null };
    return { rate: Math.max(0, assumption + margin), source: 'stopa NBP + marża', inflation: assumption };
  }
  const yearIndex = Math.floor((periodIndex * type.periodMonths) / 12);
  if (yearIndex === 0) return { rate: first, source: '1. rok', inflation: null };
  const override = bond.inflationByYear?.[yearIndex + 1];
  if (override !== undefined && override !== '' && Number.isFinite(Number(override))) {
    const inf = Number(override) / 100;
    return { rate: Math.max(0, inf) + margin, source: 'odczyt ręczny', inflation: inf };
  }
  if (periodStart && cpi) {
    const ref = new Date(periodStart.getFullYear(), periodStart.getMonth() - 2, 1);
    const reading = cpi[monthKey(ref)];
    if (reading) {
      const inf = reading.value / 100;
      return {
        rate: Math.max(0, inf) + margin,
        source: `CPI ${monthKey(ref)}${reading.estimate ? ' (szac.)' : ''}`,
        inflation: inf,
        cpiMonth: monthKey(ref),
        estimate: !!reading.estimate,
      };
    }
  }
  return { rate: Math.max(0, assumption) + margin, source: 'założenie', inflation: assumption, estimate: true };
}

// Zgodność wsteczna (Etap 1): sama stopa
export function bondRateForPeriod(bond, periodIndex, ctx) {
  return bondRateDetails(bond, periodIndex, ctx).rate;
}

// Kwota „na rękę” przy przedterminowym wykupie transzy na dany dzień: nominał + odsetki naliczone − opłata za
// wykup (zł za sztukę, nie wyższa niż naliczone odsetki) − podatek Belki od odsetek pomniejszonych o opłatę
export function earlyRedemption(bond, asOf, belkaRate = 0, cpi = null) {
  const type = BOND_TYPES[bond.type];
  const v = valueBond(bond, asOf, belkaRate, cpi);
  if (v.matured) return { fee: 0, tax: v.accruedGross - v.accruedNet, net: v.netValue, interestNet: v.accruedNet, matured: true };
  const qty = Number(bond.quantity) || 0;
  const interest = Math.max(0, v.accruedGross);
  const fee = Math.min((type?.earlyFee || 0) * qty, interest);
  const tax = (interest - fee) * belkaRate;
  return { fee, tax, net: v.nominal + interest - fee - tax, interestNet: interest - fee - tax, matured: false };
}

// Harmonogram okresów odsetkowych transzy (do tabeli szczegółów)
export function bondSchedule(bond, cpi) {
  const type = BOND_TYPES[bond.type];
  if (!type) return [];
  const purchase = parseDate(bond.purchaseDate);
  const periods = Math.round((type.years * 12) / type.periodMonths);
  const out = [];
  for (let i = 0; i < periods; i += 1) {
    const pStart = addMonths(purchase, i * type.periodMonths);
    const pEnd = addMonths(purchase, (i + 1) * type.periodMonths);
    out.push({ index: i, start: iso(pStart), end: iso(pEnd), ...bondRateDetails(bond, i, { periodStart: pStart, cpi }) });
  }
  return out;
}

// Pełna wycena obligacji na dzień `asOf`.
// Zwraca wartość brutto/netto, naliczone odsetki oraz listę wypłaconych kuponów.
export function valueBond(bond, asOf, belkaRate = 0, cpi = null) {
  const type = BOND_TYPES[bond.type];
  const qty = Number(bond.quantity) || 0;
  const purchase = parseDate(bond.purchaseDate);
  const date = parseDate(asOf);
  const empty = {
    nominal: 0,
    grossValue: 0,
    netValue: 0,
    accruedGross: 0,
    accruedNet: 0,
    coupons: [],
    matured: false,
    maturityDate: null,
    currentRate: 0,
    currentRateSource: null,
  };
  if (!type || qty <= 0 || date < purchase) return empty;

  const nominal = qty * BOND_NOMINAL;
  const maturity = addMonths(purchase, type.years * 12);
  const end = date >= maturity ? maturity : date;
  const periods = Math.round((type.years * 12) / type.periodMonths);
  const coupons = [];

  let capitalized = BOND_NOMINAL; // wartość 1 obligacji po kapitalizacji
  let accruedPerBond = 0;
  let currentRate = 0;
  let currentRateSource = null;

  for (let i = 0; i < periods; i += 1) {
    const pStart = addMonths(purchase, i * type.periodMonths);
    const pEnd = addMonths(purchase, (i + 1) * type.periodMonths);
    if (pStart >= end && !(i === 0 && end.getTime() === purchase.getTime())) break;
    const details = bondRateDetails(bond, i, { periodStart: pStart, cpi });
    const rate = details.rate;
    currentRate = rate;
    currentRateSource = details.source;
    const periodFraction = type.periodMonths / 12;
    if (end >= pEnd) {
      // pełny okres zakończony
      if (type.interestMode === 'CAPITALIZE') {
        capitalized *= 1 + rate * periodFraction;
      } else {
        const couponPerBond = BOND_NOMINAL * rate * periodFraction;
        coupons.push({ date: iso(pEnd), gross: couponPerBond * qty, rate, periodIndex: i });
      }
    } else {
      // okres w trakcie – naliczenie liniowe wg dni
      const totalDays = Math.max(1, (pEnd - pStart) / DAY);
      const elapsed = Math.max(0, (end - pStart) / DAY);
      const base = type.interestMode === 'CAPITALIZE' ? capitalized : BOND_NOMINAL;
      accruedPerBond = base * rate * periodFraction * (elapsed / totalDays);
      break;
    }
  }

  const capitalGainPerBond = capitalized - BOND_NOMINAL;
  const accruedGross = (capitalGainPerBond + accruedPerBond) * qty;
  const accruedNet = accruedGross * (1 - belkaRate);
  return {
    nominal,
    grossValue: nominal + accruedGross,
    netValue: nominal + accruedNet,
    accruedGross,
    accruedNet,
    coupons,
    matured: date >= maturity,
    maturityDate: iso(maturity),
    currentRate,
    currentRateSource,
  };
}
