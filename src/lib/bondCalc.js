// Kalkulator obligacji skarbowych: porównanie opłacalności OTS / ROR / DOR / TOS / COI / EDO przy zadanym
// horyzoncie (w miesiącach). Symulacja miesiąc po miesiącu na 100 zł nominału: oprocentowanie z oferty, inflacja
// z miesięcznych odczytów CPI (r/r, z opóźnieniem 2 miesięcy jak w liście emisyjnym), a dla przyszłych miesięcy
// z założenia; stopa NBP dla obligacji zmiennych. Przedterminowy wykup: opłata za każdą obligację, nie wyższa
// niż naliczone odsetki; podatek Belki od zysku po opłacie. Po wykupie w terminie opcjonalnie reinwestycja.

const NOMINAL = 100;

// Parametry ofert (edytowalne w kalkulatorze): oprocentowanie 1. okresu, marża, opłata za wcześniejszy wykup (zł / szt.)
export const BOND_CALC_TYPES = {
  OTS: { id: 'OTS', label: 'OTS – 3-miesięczne, stałe', months: 3, periodMonths: 3, mode: 'PAYOUT', indexed: 'FIXED', first: 3.0, margin: 0, fee: null },
  ROR: { id: 'ROR', label: 'ROR – roczne, zmienne', months: 12, periodMonths: 1, mode: 'PAYOUT', indexed: 'NBP', first: 4.25, margin: 0, fee: 0.5 },
  DOR: { id: 'DOR', label: 'DOR – 2-letnie, zmienne', months: 24, periodMonths: 1, mode: 'PAYOUT', indexed: 'NBP', first: 4.4, margin: 0.15, fee: 0.7 },
  TOS: { id: 'TOS', label: 'TOS – 3-letnie, stałe', months: 36, periodMonths: 12, mode: 'CAPITALIZE', indexed: 'FIXED', first: 4.65, margin: 0, fee: 0.7 },
  COI: { id: 'COI', label: 'COI – 4-letnie, inflacja', months: 48, periodMonths: 12, mode: 'PAYOUT', indexed: 'CPI', first: 5.0, margin: 1.5, fee: 0.7 },
  EDO: { id: 'EDO', label: 'EDO – 10-letnie, inflacja', months: 120, periodMonths: 12, mode: 'CAPITALIZE', indexed: 'CPI', first: 5.6, margin: 2.0, fee: 2.0 },
};

export function defaultBondCalc(today = new Date()) {
  return {
    amount: 10000,
    horizon: 36,
    inflation: 3.0,
    nbpRate: 4.0,
    belka: true,
    reinvest: true,
    start: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`,
    offers: Object.fromEntries(Object.values(BOND_CALC_TYPES).map((t) => [t.id, { first: t.first, margin: t.margin, fee: t.fee }])),
  };
}

function monthKey(y, m) {
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Inflacja r/r dla miesiąca: odczyt z tabeli CPI (GUS / ręczny) albo założenie
function cpiFor(cpi, key, assumption) {
  const r = cpi?.[key];
  return r && Number.isFinite(Number(r.value)) ? Number(r.value) / 100 : assumption;
}

// Oprocentowanie okresu i (od 0) jednej serii zakupionej w miesiącu startY/startM
function periodRate(type, offer, i, startY, startM, ctx) {
  const first = (Number(offer.first) || 0) / 100;
  const margin = (Number(offer.margin) || 0) / 100;
  if (type.indexed === 'FIXED') return first;
  if (type.indexed === 'NBP') return i === 0 ? first : Math.max(0, ctx.nbp + margin);
  const yearIndex = Math.floor((i * type.periodMonths) / 12);
  if (yearIndex === 0) return first;
  // Inflacja z miesiąca o 2 wcześniejszego niż początek okresu odsetkowego
  const key = monthKey(startY, startM + i * type.periodMonths - 2);
  return Math.max(0, cpiFor(ctx.cpi, key, ctx.inflation)) + margin;
}

// Wartość netto 1 obligacji (100 zł) po m miesiącach od zakupu (m ≤ czas trwania) przy wykupie w tym momencie:
// { value – kwota do wypłaty netto (z otrzymanymi kuponami netto), fee, tax, early }
export function bondValueAt(type, offer, m, startY, startM, ctx) {
  const belka = ctx.belka ? 0.19 : 0;
  const p = type.periodMonths;
  const full = Math.floor(m / p);
  const partial = m - full * p;
  let capital = NOMINAL;
  let couponsNet = 0;
  let couponsTax = 0;
  for (let i = 0; i < full; i += 1) {
    const r = periodRate(type, offer, i, startY, startM, ctx);
    if (type.mode === 'CAPITALIZE') capital *= 1 + (r * p) / 12;
    else {
      const gross = (NOMINAL * r * p) / 12;
      couponsNet += gross * (1 - belka);
      couponsTax += gross * belka;
    }
  }
  let accrued = 0;
  if (partial > 0) {
    const r = periodRate(type, offer, full, startY, startM, ctx);
    accrued = ((type.mode === 'CAPITALIZE' ? capital : NOMINAL) * r * partial) / 12;
  }
  const early = m < type.months;
  // Opłata za przedterminowy wykup – nie wyższa niż naliczone odsetki (dla obligacji kapitalizowanych: od początku)
  const interestBase = type.mode === 'CAPITALIZE' ? capital - NOMINAL + accrued : accrued;
  const fee = early ? Math.min(Number(offer.fee) || 0, Math.max(0, interestBase)) : 0;
  const taxable = Math.max(0, interestBase - fee);
  const tax = taxable * belka;
  const value = (type.mode === 'CAPITALIZE' ? capital : NOMINAL) + accrued - fee - tax + couponsNet;
  // Ta sama wartość bez opłaty (podatek od pełnych odsetek) – do pokazania, ile zysku zabiera opłata
  const valueNoFee = (type.mode === 'CAPITALIZE' ? capital : NOMINAL) + accrued - Math.max(0, interestBase) * belka + couponsNet;
  return { value, valueNoFee, fee, tax: tax + couponsTax, early };
}

// Symulacja typu na cały horyzont (z reinwestycją po wykupie w terminie): wartość netto co miesiąc dla kwoty `amount`
export function simulateBond(typeId, params, cpi) {
  const type = BOND_CALC_TYPES[typeId];
  const offer = params.offers?.[typeId] || type;
  const ctx = { cpi, inflation: (Number(params.inflation) || 0) / 100, nbp: (Number(params.nbpRate) || 0) / 100, belka: params.belka !== false };
  const [sy, sm] = String(params.start).split('-').map(Number);
  const H = Math.max(1, Math.round(Number(params.horizon) || 1));
  const amount = Number(params.amount) || 0;
  // OTS nie ma przedterminowego wykupu – porównanie tylko dla horyzontu będącego wielokrotnością okresu
  const unavailable = type.fee === null && H % type.months !== 0;
  let units = amount / NOMINAL;
  let idle = 0;
  let cycleStart = 0;
  let fees = 0;
  let taxes = 0;
  const points = [{ month: 0, value: amount }];
  let last = null;
  for (let m = 1; m <= H; m += 1) {
    const inCycle = m - cycleStart;
    const r = bondValueAt(type, offer, inCycle, sy, sm - 1 + cycleStart, ctx);
    last = r;
    points.push({ month: m, value: units * r.value + idle });
    if (inCycle === type.months && m < H) {
      // Wykup w terminie: reinwestycja (ta sama oferta) albo gotówka bez oprocentowania
      taxes += units * r.tax;
      if (params.reinvest) units = (units * r.value) / NOMINAL;
      else {
        idle += units * r.value;
        units = 0;
      }
      cycleStart = m;
    }
  }
  if (last) {
    fees += units * last.fee;
    taxes += units * last.tax;
  }
  const final = points[points.length - 1].value;
  const finalNoFee = last ? final + units * (last.valueNoFee - last.value) : final;
  const years = H / 12;
  const annual = amount > 0 && final > 0 ? Math.pow(final / amount, 1 / years) - 1 : 0;
  // Inflacja w horyzoncie (miesięcznie, z odczytów i założenia) – wynik realny
  let infl = 1;
  for (let m = 0; m < H; m += 1) infl *= Math.pow(1 + cpiFor(cpi, monthKey(sy, sm - 1 + m), ctx.inflation), 1 / 12);
  return {
    id: typeId,
    type,
    unavailable,
    final,
    // Zysk na rękę – po opłacie za przedterminowy wykup i podatku; zysk przed opłatą – dla porównania
    profit: final - amount,
    profitBeforeFee: finalNoFee - amount,
    feeCost: finalNoFee - final, // ile zysku na rękę zabiera opłata (z uwzględnieniem niższego podatku)
    annual,
    real: final / infl - amount,
    realAnnual: amount > 0 && final > 0 ? Math.pow(final / infl / amount, 1 / years) - 1 : 0,
    fees,
    taxes,
    early: !!last?.early,
    cycles: Math.floor(H / type.months),
    points,
  };
}

export function compareBonds(params, cpi) {
  const rows = Object.keys(BOND_CALC_TYPES).map((id) => simulateBond(id, params, cpi));
  const ranked = rows.filter((r) => !r.unavailable).sort((a, b) => b.final - a.final);
  return { rows: [...ranked, ...rows.filter((r) => r.unavailable)], best: ranked[0]?.id || null };
}
