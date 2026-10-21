import {
  ACCOUNT_TYPES,
  BELKA_RATE,
  DEFAULT_CONTRIBUTION_LIMITS,
  IKZE_PAYOUT_TAX,
  SCALE_THRESHOLD,
  TAX_BRACKETS,
} from './constants.js';

// Stawka podatku Belki właściwa dla danego konta (z uwzględnieniem nadpisań OKI w ustawieniach).
export function belkaRateForAccount(account, settings) {
  if (!account) return BELKA_RATE;
  const type = ACCOUNT_TYPES[account.type];
  if (!type) return BELKA_RATE;
  if (account.type === 'OKI' && settings?.oki) {
    return Number.isFinite(settings.oki.belkaRate) ? settings.oki.belkaRate : 0;
  }
  return type.belkaRate;
}

// Podatek od dywidendy / odsetek:
// - konto opodatkowane: łącznie 19%, z zaliczeniem podatku pobranego za granicą (max do 19%)
// - IKE/IKZE/OKI: tylko ewentualny podatek u źródła za granicą
export function computeIncomeTax({ gross, foreignTax = 0 }, account, settings) {
  const g = Number(gross) || 0;
  const foreign = Math.max(0, Number(foreignTax) || 0);
  const rate = belkaRateForAccount(account, settings);
  if (rate <= 0) {
    return { tax: foreign, polishTax: 0, foreignTax: foreign, net: g - foreign };
  }
  const total = Math.max(g * rate, foreign);
  const polishTax = Math.max(0, total - foreign);
  return { tax: total, polishTax, foreignTax: foreign, net: g - total };
}

export function contributionLimitsForYear(settings, year) {
  const all = { ...DEFAULT_CONTRIBUTION_LIMITS, ...(settings?.contributionLimits || {}) };
  if (all[year]) return all[year];
  const years = Object.keys(all)
    .map(Number)
    .sort((a, b) => a - b);
  const last = years[years.length - 1];
  return all[last];
}

export function limitForAccount(account, settings, year) {
  const limits = contributionLimitsForYear(settings, year);
  if (!account || !limits) return 0;
  if (account.type === 'IKE') return limits.ike || 0;
  if (account.type === 'IKZE') return settings?.selfEmployed ? limits.ikzeSelfEmployed || 0 : limits.ikze || 0;
  if (account.type === 'OKI') return settings?.oki?.annualLimit || limits.oki || 0;
  return 0;
}

// Kalkulator zwrotu PIT z tytułu wpłat na IKZE.
// bracket: klucz z TAX_BRACKETS; annualIncome: roczny dochód do opodatkowania (dla SCALE_AUTO).
export function computeIkzeRefund({ amount, bracket = 'SCALE_12', annualIncome = 0 }) {
  const deduction = Math.max(0, Number(amount) || 0);
  const b = TAX_BRACKETS[bracket] || TAX_BRACKETS.SCALE_12;
  let refund = 0;
  let breakdown = [];
  if (bracket === 'SCALE_AUTO') {
    const income = Math.max(0, Number(annualIncome) || 0);
    const aboveThreshold = Math.max(0, income - SCALE_THRESHOLD);
    const at32 = Math.min(deduction, aboveThreshold);
    const at12 = Math.min(Math.max(0, deduction - at32), Math.max(0, income - at32));
    refund = at32 * 0.32 + at12 * 0.12;
    breakdown = [
      { label: 'Część odliczenia w progu 32%', base: at32, rate: 0.32, value: at32 * 0.32 },
      { label: 'Część odliczenia w progu 12%', base: at12, rate: 0.12, value: at12 * 0.12 },
    ].filter((x) => x.base > 0);
  } else {
    refund = deduction * (b.rate || 0);
    breakdown = [{ label: b.label, base: deduction, rate: b.rate || 0, value: refund }];
  }
  const futurePayoutTax = deduction * IKZE_PAYOUT_TAX;
  const netBenefit = refund - futurePayoutTax;
  return {
    deduction,
    refund,
    effectiveRate: deduction > 0 ? refund / deduction : 0,
    futurePayoutTax,
    netBenefit,
    breakdown,
  };
}
