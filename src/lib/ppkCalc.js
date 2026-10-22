// Kalkulator PPK (Pracownicze Plany Kapitałowe): symulacja miesiąc po miesiącu. Wpłaty od wynagrodzenia brutto:
// pracownik 2% (0,5–2% przy wynagrodzeniu ≤ 1,2× płacy minimalnej) + dodatkowa do 2% → 0,5–4%;
// pracodawca 1,5% + dodatkowa do 2,5% → 1,5–4%. Państwo: dopłata powitalna 250 zł (po 3 miesiącach oszczędzania)
// i dopłata roczna 240 zł, gdy wpłaty pracownika i pracodawcy w roku ≥ 3,5% sześciokrotności płacy minimalnej
// (przy obniżonej wpłacie pracownika – 25% tej kwoty). Wpłata pracodawcy to przychód pracownika – podatek PIT
// pobierany z pensji (koszt po stronie pracownika). Stopa zwrotu pomniejszona o opłatę za zarządzanie funduszem.

export const PPK_WELCOME = 250;
export const PPK_ANNUAL = 240;
export const PPK_ANNUAL_THRESHOLD_PCT = 0.035;
// Płaca minimalna (zł brutto) – kolejne lata rosną razem z wynagrodzeniem
export const MIN_WAGE = { 2025: 4666, 2026: 4806 };

export const PPK_LIMITS = {
  employee: { min: 0.5, max: 4, basic: 2 },
  employer: { min: 1.5, max: 4, basic: 1.5 },
};

export function minWageFor(year) {
  const years = Object.keys(MIN_WAGE).map(Number).sort((a, b) => a - b);
  const known = years.filter((y) => y <= year).at(-1) ?? years[0];
  return MIN_WAGE[known];
}

export function defaultPpkCalc(averageWage = 9420) {
  return {
    salary: Math.round(averageWage / 10) * 10,
    employeePct: 2,
    employerPct: 1.5,
    returnPct: 6,
    feePct: 0.5,
    salaryGrowth: 4,
    horizonMode: 'YEARS',
    years: 25,
    age: 35,
    targetAge: 60,
    taxRate: 12,
    welcome: true,
  };
}

export function ppkYears(p) {
  if (p.horizonMode === 'AGE') return Math.max(1, Math.min(50, Math.round((Number(p.targetAge) || 60) - (Number(p.age) || 0))));
  return Math.max(1, Math.min(50, Math.round(Number(p.years) || 1)));
}

export function simulatePpk(p, startYear = new Date().getFullYear()) {
  const years = ppkYears(p);
  const g = (Number(p.salaryGrowth) || 0) / 100;
  const empPct = Math.min(PPK_LIMITS.employee.max, Math.max(PPK_LIMITS.employee.min, Number(p.employeePct) || 0)) / 100;
  const erPct = Math.min(PPK_LIMITS.employer.max, Math.max(PPK_LIMITS.employer.min, Number(p.employerPct) || 0)) / 100;
  const net = (Number(p.returnPct) || 0) / 100 - (Number(p.feePct) || 0) / 100;
  const mr = Math.pow(1 + net, 1 / 12) - 1;
  const taxRate = (Number(p.taxRate) || 0) / 100;
  const minWage0 = minWageFor(startYear);
  const reducedAllowed = (Number(p.salary) || 0) <= 1.2 * minWage0;

  let balance = 0;
  let own = 0;
  let employer = 0;
  let state = 0;
  let welcomePaid = 0;
  let annualCount = 0;
  let tax = 0;
  const rows = [];
  for (let y = 0; y < years; y += 1) {
    const salary = (Number(p.salary) || 0) * Math.pow(1 + g, y);
    const minWage = minWage0 * Math.pow(1 + g, y);
    let yearContrib = 0;
    let yearState = 0;
    for (let m = 1; m <= 12; m += 1) {
      const e = salary * empPct;
      const r = salary * erPct;
      balance = balance * (1 + mr) + e + r;
      own += e;
      employer += r;
      tax += r * taxRate;
      yearContrib += e + r;
      // Dopłata powitalna po 3 miesiącach oszczędzania
      if (p.welcome !== false && y === 0 && m === 3) {
        balance += PPK_WELCOME;
        state += PPK_WELCOME;
        welcomePaid = PPK_WELCOME;
        yearState += PPK_WELCOME;
      }
    }
    // Dopłata roczna: wpłaty w roku ≥ 3,5% × 6 × płaca minimalna (obniżona wpłata pracownika – 25% progu)
    const threshold = PPK_ANNUAL_THRESHOLD_PCT * 6 * minWage * (empPct < 0.02 && reducedAllowed ? 0.25 : 1);
    const annualOk = yearContrib + 1e-9 >= threshold;
    if (annualOk) {
      balance += PPK_ANNUAL;
      state += PPK_ANNUAL;
      annualCount += 1;
      yearState += PPK_ANNUAL;
    }
    rows.push({
      year: startYear + y,
      n: y + 1,
      age: p.horizonMode === 'AGE' ? (Number(p.age) || 0) + y + 1 : null,
      salary,
      employeeYear: salary * empPct * 12,
      employerYear: salary * erPct * 12,
      stateYear: yearState,
      threshold,
      annualOk,
      own,
      employer,
      state,
      gains: balance - own - employer - state,
      balance,
    });
  }
  const gains = balance - own - employer - state;
  const outOfPocket = own + tax;
  return {
    years,
    rows,
    total: balance,
    own,
    employer,
    state,
    welcome: welcomePaid,
    annualCount,
    annualTotal: annualCount * PPK_ANNUAL,
    gains,
    tax,
    outOfPocket,
    multiplier: outOfPocket > 0 ? balance / outOfPocket : 0,
    firstMonth: { employee: (Number(p.salary) || 0) * empPct, employer: (Number(p.salary) || 0) * erPct, tax: (Number(p.salary) || 0) * erPct * taxRate },
    reducedAllowed,
    reducedThreshold: 1.2 * minWage0,
    minWage: minWage0,
    payout: { lump: balance * 0.25, installment: (balance * 0.75) / 120 },
  };
}
