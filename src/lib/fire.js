// Etap 4: symulacja FIRE – ścieżka majątku i miesięcznego dochodu pasywnego do roku docelowego,
// scenariusze stóp zwrotu, kwoty realne (siła nabywcza dziś), data osiągnięcia celu i wymagana wpłata.

export const SCENARIOS = {
  PESSIMISTIC: { id: 'PESSIMISTIC', label: 'Pesymistyczny' },
  BASE: { id: 'BASE', label: 'Bazowy' },
  OPTIMISTIC: { id: 'OPTIMISTIC', label: 'Optymistyczny' },
};

const MAX_YEAR_SEARCH = 2100;

/**
 * Symulacja miesięczna.
 * - Majątek rośnie w tempie stopy zwrotu (total return), co miesiąc dochodzi wpłata własna
 *   (indeksowana inflacją raz w roku, jeśli contributionIndexed).
 * - Roczny dochód pasywny netto: dochód z obecnych aktywów rośnie o DGR, nowe wpłaty i reinwestowane
 *   dywidendy kupują aktywa ze stopą dywidendy `dividendYield` (kula śnieżna dywidend).
 * - Kwoty realne = nominalne / (1 + inflacja)^t.
 */
export function simulateFire({
  startValue,
  startAnnualIncome,
  monthlyContribution,
  contributionIndexed = true,
  annualReturn,
  dividendYield,
  dgr,
  inflation,
  untilYear,
  startDate = new Date(),
}) {
  const r = Math.pow(1 + annualReturn, 1 / 12) - 1;
  const g = Math.pow(1 + dgr, 1 / 12) - 1;
  const infM = Math.pow(1 + inflation, 1 / 12) - 1;
  let value = startValue;
  let income = startAnnualIncome; // roczny dochód pasywny netto (nominalnie)
  let contribution = monthlyContribution;
  let deflator = 1;
  let contributed = 0;
  const points = [];
  const startYear = startDate.getFullYear();
  const startMonth = startDate.getMonth();
  const push = (y, m) =>
    points.push({
      year: y,
      month: m,
      label: `${y}`,
      value,
      valueReal: value / deflator,
      monthlyIncome: income / 12,
      monthlyIncomeReal: income / 12 / deflator,
      contributed,
    });
  push(startYear, startMonth);
  let y = startYear;
  let m = startMonth;
  while (y < untilYear || (y === untilYear && m < 11)) {
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
      if (contributionIndexed) contribution *= 1 + inflation;
    }
    const reinvested = income / 12;
    value = value * (1 + r) + contribution;
    income = income * (1 + g) + (contribution + reinvested) * dividendYield;
    deflator *= 1 + infM;
    contributed += contribution;
    push(y, m);
  }
  return points;
}

export function isGoalMet(p, fire) {
  const income = fire.realValues === false ? p.monthlyIncome : p.monthlyIncomeReal;
  const value = fire.realValues === false ? p.value : p.valueReal;
  const incomeOk = income >= fire.targetMonthlyIncome;
  const valueOk = value >= fire.targetNetWorth;
  if (fire.criterion === 'INCOME') return incomeOk;
  if (fire.criterion === 'NETWORTH') return valueOk;
  return incomeOk && valueOk;
}

// Postęp „dziś” względem celu (kwoty dzisiejsze)
export function fireProgress({ value, monthlyIncome }, fire) {
  const income = fire.targetMonthlyIncome > 0 ? monthlyIncome / fire.targetMonthlyIncome : 0;
  const worth = fire.targetNetWorth > 0 ? value / fire.targetNetWorth : 0;
  const main = fire.criterion === 'INCOME' ? income : fire.criterion === 'NETWORTH' ? worth : Math.min(income, worth);
  return { income, worth, main };
}

export function firstMet(points, fire) {
  // Cel oceniany w kwotach realnych (dzisiejsza siła nabywcza)
  const p = points.find((x) => isGoalMet({ ...x }, { ...fire, realValues: true }));
  return p ? { year: p.year, month: p.month } : null;
}

export function runScenarios(base, fire) {
  const out = {};
  for (const key of Object.keys(SCENARIOS)) {
    const annualReturn = (Number(fire.returns?.[key]) || 0) / 100;
    const points = simulateFire({ ...base, annualReturn, untilYear: MAX_YEAR_SEARCH });
    out[key] = {
      points: points.filter((p) => p.year <= fire.targetYear),
      reached: firstMet(points, fire),
      atTarget: points.filter((p) => p.year <= fire.targetYear).at(-1),
    };
  }
  return out;
}

// Wymagana miesięczna wpłata (dziś), by osiągnąć cel w roku docelowym – bisekcja
export function requiredContribution(base, fire, scenario = fire.scenario) {
  const annualReturn = (Number(fire.returns?.[scenario]) || 0) / 100;
  const meets = (c) => {
    const pts = simulateFire({ ...base, monthlyContribution: c, annualReturn, untilYear: fire.targetYear });
    return isGoalMet(pts[pts.length - 1], { ...fire, realValues: true });
  };
  if (meets(0)) return 0;
  let lo = 0;
  let hi = 1000;
  while (!meets(hi) && hi < 1e7) hi *= 2;
  if (hi >= 1e7) return null;
  for (let k = 0; k < 40; k += 1) {
    const mid = (lo + hi) / 2;
    if (meets(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

// Coast FIRE: kwota potrzebna dziś, by bez wpłat dojść do celu majątkowego w roku docelowym
export function coastFireNumber(fire, now = new Date()) {
  const years = fire.targetYear + 1 - (now.getFullYear() + now.getMonth() / 12);
  const r = (Number(fire.returns?.[fire.scenario]) || 0) / 100;
  const inf = (Number(fire.inflation) || 0) / 100;
  const nominalTarget = fire.targetNetWorth * Math.pow(1 + inf, years);
  return nominalTarget / Math.pow(1 + r, years);
}
