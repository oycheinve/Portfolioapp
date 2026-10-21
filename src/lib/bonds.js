import { BOND_NOMINAL, BOND_TYPES } from './constants.js';

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

// Oprocentowanie (ułamek) w danym okresie odsetkowym (index od 0).
// Rok 1 = oprocentowanie stałe z emisji; kolejne lata: inflacja + marża (COI/EDO),
// stałe (TOS), stopa referencyjna NBP + marża (ROR – pole „inflation” pełni rolę stopy NBP).
export function bondRateForPeriod(bond, periodIndex) {
  const type = BOND_TYPES[bond.type];
  const first = (Number(bond.firstYearRate) || 0) / 100;
  const margin = (Number(bond.margin) || 0) / 100;
  const inflation = (Number(bond.inflation) || 0) / 100;
  if (!type) return first;
  if (type.indexed === 'FIXED') return first;
  if (type.indexed === 'NBP') {
    return periodIndex === 0 ? first : Math.max(0, inflation + margin);
  }
  // CPI: okres liczony w latach
  const yearIndex = Math.floor((periodIndex * type.periodMonths) / 12);
  if (yearIndex === 0) return first;
  const override = bond.inflationByYear?.[yearIndex + 1];
  const inf = Number.isFinite(override) ? override / 100 : inflation;
  return Math.max(0, inf) + margin;
}

// Pełna wycena obligacji na dzień `asOf`.
// Zwraca wartość brutto/netto, naliczone odsetki oraz listę wypłaconych kuponów.
export function valueBond(bond, asOf, belkaRate = 0) {
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

  for (let i = 0; i < periods; i += 1) {
    const pStart = addMonths(purchase, i * type.periodMonths);
    const pEnd = addMonths(purchase, (i + 1) * type.periodMonths);
    if (pStart >= end && !(i === 0 && end.getTime() === purchase.getTime())) break;
    const rate = bondRateForPeriod(bond, i);
    currentRate = rate;
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
  };
}
