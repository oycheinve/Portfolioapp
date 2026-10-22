// Kalkulator IKZE: zwrot podatku (oszczędność podatkowa) z wpłat odliczanych od dochodu / przychodu oraz wieloletnia
// projekcja kapitału. Formy opodatkowania: skala (12% / 32% – próg 120 tys. zł liczony z dochodu), liniowy 19%,
// ryczałt (wpłata odliczana od przychodu – oszczędność = stawka ryczałtu). Wypłata po 65. r.ż.: 10% zryczałtowanego
// podatku od całości. Porównanie z tymi samymi wpłatami na zwykłym koncie maklerskim (Belka 19% od zysku).
import { computeIkzeRefund } from './tax.js';
import { IKZE_PAYOUT_TAX } from './constants.js';

export const IKZE_TAX_FORMS = {
  SCALE: { id: 'SCALE', label: 'Skala podatkowa (12% / 32%)' },
  LINEAR: { id: 'LINEAR', label: 'Podatek liniowy 19%' },
  LUMP_SUM: { id: 'LUMP_SUM', label: 'Ryczałt (od przychodu)' },
};

const BELKA = 0.19;

// Zwrot podatku za jeden rok przy wpłacie `amount`
export function ikzeYearRefund({ form, amount, income, lumpRate }) {
  if (form === 'LINEAR') return { refund: amount * 0.19, rate: 0.19, note: 'odliczenie od dochodu – 19%' };
  if (form === 'LUMP_SUM') {
    const r = (Number(lumpRate) || 0) / 100;
    return { refund: amount * r, rate: r, note: `odliczenie od przychodu – ryczałt ${String(lumpRate).replace('.', ',')}%` };
  }
  const res = computeIkzeRefund({ amount, bracket: 'SCALE_AUTO', annualIncome: income });
  const parts = res.breakdown.map((b) => `${Math.round(b.rate * 100)}%`).join(' + ');
  return { refund: res.refund, rate: res.effectiveRate, note: parts ? `skala – ${parts}` : 'skala – brak podatku do odliczenia' };
}

export function defaultIkzeCalc(settings = {}, limit = 11304) {
  const bracket = settings.taxBracket;
  return {
    form: bracket === 'LINEAR_19' ? 'LINEAR' : bracket === 'LUMP_SUM' ? 'LUMP_SUM' : 'SCALE',
    income: Number(settings.annualIncome) || 100000,
    incomeGrowth: 3,
    lumpRate: 12,
    selfEmployed: !!settings.selfEmployed,
    contributionMode: 'LIMIT',
    amount: limit,
    years: 25,
    returnPct: 7,
    limitGrowth: Number(settings.limitsPolicy?.growthPct ?? 6) || 6,
    reinvestRefund: true,
  };
}

// limit0 – limit IKZE w bieżącym roku (zwykły lub JDG); zwraca wiersze roczne i podsumowanie
export function simulateIkze(p, limit0) {
  const years = Math.max(1, Math.round(Number(p.years) || 1));
  const r = (Number(p.returnPct) || 0) / 100;
  const g = (Number(p.limitGrowth) || 0) / 100;
  const ig = (Number(p.incomeGrowth) || 0) / 100;
  let ikze = 0;
  let broker = 0; // te same wpłaty na zwykłym koncie
  let side = 0; // zwroty podatku reinwestowane na koncie maklerskim
  let sideContrib = 0;
  let contributions = 0;
  let refunds = 0;
  const rows = [];
  for (let y = 1; y <= years; y += 1) {
    const limit = limit0 * Math.pow(1 + g, y - 1);
    const amount = p.contributionMode === 'LIMIT' ? limit : Math.min(Math.max(0, Number(p.amount) || 0), limit);
    const income = (Number(p.income) || 0) * Math.pow(1 + ig, y - 1);
    const { refund, rate } = ikzeYearRefund({ form: p.form, amount, income, lumpRate: p.lumpRate });
    // Wpłata na początku roku, wzrost w ciągu roku; zwrot z PIT otrzymany po rozliczeniu (koniec roku)
    ikze = (ikze + amount) * (1 + r);
    broker = (broker + amount) * (1 + r);
    side *= 1 + r;
    if (p.reinvestRefund) {
      side += refund;
      sideContrib += refund;
    }
    contributions += amount;
    refunds += refund;
    const ikzeNet = ikze * (1 - IKZE_PAYOUT_TAX);
    const sideNet = side - Math.max(0, side - sideContrib) * BELKA;
    const brokerNet = broker - Math.max(0, broker - contributions) * BELKA;
    rows.push({
      year: y,
      limit,
      amount,
      refund,
      rate,
      contributions,
      refunds,
      ikze,
      gain: ikze - contributions,
      ikzeNet,
      sideNet,
      // IKZE + zwroty (reinwestowane lub zachowane) po podatkach
      totalNet: ikzeNet + (p.reinvestRefund ? sideNet : refunds),
      brokerNet,
    });
  }
  const last = rows[rows.length - 1];
  return {
    rows,
    contributions: last.contributions,
    refunds: last.refunds,
    ikze: last.ikze,
    payoutTax: last.ikze * IKZE_PAYOUT_TAX,
    ikzeNet: last.ikzeNet,
    totalNet: last.totalNet,
    brokerNet: last.brokerNet,
    advantage: last.totalNet - last.brokerNet,
    firstYear: rows[0],
  };
}
