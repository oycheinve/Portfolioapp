import {
  ACCOUNT_TYPES,
  BELKA_RATE,
  DEFAULT_CONTRIBUTION_LIMITS,
  IKZE_PAYOUT_TAX,
  SCALE_THRESHOLD,
  TAX_BRACKETS,
} from './constants.js';

// Stawka podatku Belki pobieranego dla danego konta.
// 0, gdy konto emerytalne (IKE/IKZE), gdy wyłączono „Wliczaj podatek Belki”, lub gdy podatek jest odroczony
// (np. Revolut – brak poboru u źródła, rozliczenie samodzielne w PIT-38).
export function belkaRateForAccount(account) {
  if (!account) return BELKA_RATE;
  const type = ACCOUNT_TYPES[account.type];
  if (!type) return BELKA_RATE;
  if (account.belkaEnabled === false || account.belkaDeferred) return 0;
  return type.belkaRate;
}

// Stawka dla transzy obligacji: przełącznik transzy ma pierwszeństwo przed ustawieniem konta
export function bondBelkaRate(bond, account) {
  if (bond?.belkaEnabled === false) return 0;
  return belkaRateForAccount(account);
}

// Podatek od dywidendy / odsetek:
// - konto opodatkowane: łącznie 19%, z zaliczeniem podatku pobranego za granicą (max do 19%)
// - IKE/IKZE (lub Belka wyłączona/odroczona): tylko ewentualny podatek u źródła za granicą
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

// Etap 6: limity wpłat. Kolejność: zapisane (oficjalne / ręczne) → z prognozowanego przeciętnego
// wynagrodzenia (IKE 3×, IKZE 1,2×, IKZE JDG 1,8×) → ekstrapolacja ostatniego znanego roku o % wzrostu.
export const LIMIT_MULTIPLIERS = { ike: 3, ikze: 1.2, ikzeSelfEmployed: 1.8 };

function round2(v) {
  return Math.round(v * 100) / 100;
}

export function knownLimits(settings) {
  return { ...DEFAULT_CONTRIBUTION_LIMITS, ...(settings?.contributionLimits || {}) };
}

export function limitsSource(settings, year) {
  const meta = settings?.contributionLimitsMeta?.[year];
  const stored = settings?.contributionLimits?.[year];
  const official = DEFAULT_CONTRIBUTION_LIMITS[year];
  if (stored && official && ['ike', 'ikze', 'ikzeSelfEmployed'].every((k) => Number(stored[k]) === official[k])) return 'official';
  if (stored) return meta || 'manual';
  if (DEFAULT_CONTRIBUTION_LIMITS[year]) return 'official';
  if (settings?.limitsPolicy?.projectedWages?.[year]) return 'wage';
  return 'estimate';
}

export function computeLimitsForYear(settings, year) {
  const all = knownLimits(settings);
  if (all[year]) return { ...all[year], source: limitsSource(settings, year) };
  const policy = settings?.limitsPolicy || {};
  const wage = Number(policy.projectedWages?.[year]);
  if (wage > 0) {
    return {
      ike: round2(wage * LIMIT_MULTIPLIERS.ike),
      ikze: round2(wage * LIMIT_MULTIPLIERS.ikze),
      ikzeSelfEmployed: round2(wage * LIMIT_MULTIPLIERS.ikzeSelfEmployed),
      source: 'wage',
    };
  }
  const years = Object.keys(all)
    .map(Number)
    .sort((a, b) => a - b);
  const base = years.filter((y) => y < year).at(-1) ?? years[0];
  const growth = (Number(policy.growthPct ?? 6) || 0) / 100;
  const k = Math.pow(1 + growth, Math.max(0, year - base));
  const b = all[base];
  return {
    ike: round2(b.ike * k),
    ikze: round2(b.ikze * k),
    ikzeSelfEmployed: round2(b.ikzeSelfEmployed * k),
    source: 'estimate',
  };
}

export function contributionLimitsForYear(settings, year) {
  const { source, ...limits } = computeLimitsForYear(settings, year);
  return limits;
}

export function limitForAccount(account, settings, year) {
  const limits = contributionLimitsForYear(settings, year);
  if (!account || !limits) return 0;
  if (account.type === 'IKE') return limits.ike || 0;
  if (account.type === 'IKZE') return settings?.selfEmployed ? limits.ikzeSelfEmployed || 0 : limits.ikze || 0;
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
