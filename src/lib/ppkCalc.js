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
  // Stopa zwrotu stała (kalkulator) albo zależna od roku (fundusz zdefiniowanej daty – p.returnByYear(y), już po opłacie)
  const mrFor = (y) => Math.pow(1 + (typeof p.returnByYear === 'function' ? p.returnByYear(y) : net), 1 / 12) - 1;
  const taxRate = (Number(p.taxRate) || 0) / 100;
  const minWage0 = minWageFor(startYear);
  const reducedAllowed = (Number(p.salary) || 0) <= 1.2 * minWage0;

  let balance = Math.max(0, Number(p.startBalance) || 0); // dotychczas zgromadzone środki (opcjonalnie)
  const startBalance = balance;
  let own = 0;
  let employer = 0;
  let state = 0;
  let welcomePaid = 0;
  let annualCount = 0;
  let tax = 0;
  const rows = [];
  for (let y = 0; y < years; y += 1) {
    // Podstawa wpłat: wynagrodzenie zasadnicze + średnie prowizje / premie (dochody zmienne) – rosną razem
    const salary = ((Number(p.salary) || 0) + Math.max(0, Number(p.bonus) || 0)) * Math.pow(1 + g, y);
    const mr = mrFor(y);
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
      if (p.welcome !== false && y === 0 && m === 3 && own + employer > 0) {
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
      gains: balance - startBalance - own - employer - state,
      balance,
      returnPct: (Math.pow(1 + mr, 12) - 1) * 100,
    });
  }
  const gains = balance - startBalance - own - employer - state;
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
    startBalance,
    firstMonth: (() => {
      const base = (Number(p.salary) || 0) + Math.max(0, Number(p.bonus) || 0);
      return { base, employee: base * empPct, employer: base * erPct, tax: base * erPct * taxRate };
    })(),
    reducedAllowed,
    reducedThreshold: 1.2 * minWage0,
    minWage: minWage0,
    payout: { lump: balance * 0.25, installment: (balance * 0.75) / 120 },
  };
}

// ── Fundusz zdefiniowanej daty (PPK) ──
// Ustawowe przedziały udziału akcji wg lat do 60. roku życia (rozporządzenie o polityce inwestycyjnej FZD):
// > 20 lat: 60–80%, 10–20 lat: 40–70%, 5–10 lat: 25–50%, 0–5 lat: 10–30%, po 60. roku: do 15%.
// Profil przyjmowany jako środek przedziału (typowy dla funduszy rynkowych); oczekiwane stopy zwrotu: akcje i obligacje.
export const TDF_STAGES = [
  { from: 20, min: 60, max: 80, label: 'ponad 20 lat do 60. r.ż.' },
  { from: 10, min: 40, max: 70, label: '10–20 lat do 60. r.ż.' },
  { from: 5, min: 25, max: 50, label: '5–10 lat do 60. r.ż.' },
  { from: 0, min: 10, max: 30, label: 'do 5 lat do 60. r.ż.' },
  { from: -Infinity, min: 0, max: 15, label: 'po 60. roku życia' },
];
export function tdfStage(yearsTo60) {
  const st = TDF_STAGES.find((x) => yearsTo60 > x.from) || TDF_STAGES.at(-1);
  return { ...st, equity: (st.min + st.max) / 2 };
}
// Fundusz właściwy dla daty urodzenia: rok 60. urodzin zaokrąglony do pełnych 5 lat (np. PPK 2055)
export function tdfYear(birthYear) {
  return Math.round((birthYear + 60) / 5) * 5;
}
export function ageFrom(birthDate, today = new Date()) {
  const b = new Date(`${birthDate}T12:00:00`);
  if (Number.isNaN(b.getTime())) return null;
  let a = today.getFullYear() - b.getFullYear();
  if (today.getMonth() < b.getMonth() || (today.getMonth() === b.getMonth() && today.getDate() < b.getDate())) a -= 1;
  return a;
}

// Profil startowy PPK: bez kwot – saldo, pensja i premie 0 zł, wiek nieuzupełniony (użytkownik wpisuje swoje dane);
// procenty wpłat to ustawowe minima, stopy zwrotu i opłata – założenia symulacji (do zmiany)
export function defaultPpkProfile() {
  return { birthDate: '', age: '', salary: 0, bonus: 0, employeePct: 2, employerPct: 1.5, startBalance: 0, balanceDate: '', inNetWorth: true, equityReturn: 7, bondReturn: 4.5, feePct: 0.5, salaryGrowth: 4, taxRate: 12 };
}
// Wiek z profilu (data urodzenia albo wpisany wiek); null – nieuzupełniony
export function ppkAge(profile, today = new Date()) {
  if (profile?.birthDate) return ageFrom(profile.birthDate, today);
  const a = Number(profile?.age);
  return profile?.age !== '' && profile?.age !== undefined && profile?.age !== null && Number.isFinite(a) && a > 0 ? a : null;
}

// Bieżące saldo PPK (do Majątku i Poduszki): saldo z instytucji „stan na” balanceDate + szacowane wpłaty
// (własna + pracodawcy od pensji i premii) za pełne miesiące od tej daty + zysk wg profilu funduszu.
// Dopłaty państwa nie są doliczane szacunkowo – trafiają do salda po aktualizacji stanu z instytucji.
// Bez danych (0 zł saldo, 0 zł pensja) – 0 zł; inNetWorth === false – nie wliczane.
const monthsBetween = (fromIso, to) => {
  const f = new Date(`${fromIso}T12:00:00`);
  if (Number.isNaN(f.getTime())) return 0;
  let m = (to.getFullYear() - f.getFullYear()) * 12 + (to.getMonth() - f.getMonth());
  if (to.getDate() < f.getDate()) m -= 1;
  return Math.max(0, m);
};
export function ppkCurrentValue(profile, today = new Date()) {
  const p = { ...defaultPpkProfile(), ...(profile || {}) };
  const start = Math.max(0, Number(p.startBalance) || 0);
  const base = Math.max(0, (Number(p.salary) || 0) + (Number(p.bonus) || 0));
  const monthly = (base * ((Number(p.employeePct) || 0) + (Number(p.employerPct) || 0))) / 100;
  const months = p.balanceDate ? monthsBetween(p.balanceDate, today) : 0;
  const age = ppkAge(p, today);
  const eqShare = age === null ? 0.5 : tdfStage(60 - age).equity / 100;
  const r = eqShare * ((Number(p.equityReturn) || 0) / 100) + (1 - eqShare) * ((Number(p.bondReturn) || 0) / 100) - (Number(p.feePct) || 0) / 100;
  const mr = Math.pow(1 + r, 1 / 12) - 1;
  let balance = start;
  let contributions = 0;
  for (let i = 0; i < months; i += 1) {
    balance = balance * (1 + mr) + monthly;
    contributions += monthly;
  }
  const round2 = (v) => Math.round(v * 100) / 100;
  const value = round2(balance);
  return { value, included: p.inNetWorth === false ? 0 : value, start, contributions: round2(contributions), gains: round2(value - start - contributions), months, since: p.balanceDate || '', monthly: round2(monthly) };
}

// Symulacja PPK w funduszu zdefiniowanej daty: udział akcji maleje z wiekiem (glide path), stopa zwrotu roku =
// udział akcji × stopa akcji + reszta × stopa obligacji − opłata; do 60. roku życia
export function simulatePpkTdf(profile, today = new Date()) {
  const p = { ...defaultPpkProfile(), ...profile };
  const age = p.birthDate ? ageFrom(p.birthDate, today) : Number(p.age) || 0;
  const birthYear = p.birthDate ? new Date(`${p.birthDate}T12:00:00`).getFullYear() : today.getFullYear() - age;
  const years = Math.max(1, Math.min(50, 60 - age));
  const eq = (Number(p.equityReturn) || 0) / 100;
  const bd = (Number(p.bondReturn) || 0) / 100;
  const fee = (Number(p.feePct) || 0) / 100;
  const stageAt = (y) => tdfStage(60 - (age + y));
  const sim = simulatePpk({ ...p, horizonMode: 'YEARS', years, returnByYear: (y) => { const s = stageAt(y).equity / 100; return s * eq + (1 - s) * bd - fee; } }, today.getFullYear());
  const rows = sim.rows.map((r, i) => ({ ...r, age: age + i + 1, equityShare: stageAt(i).equity }));
  return { ...sim, rows, age, birthYear, fundYear: tdfYear(birthYear), stage: stageAt(0), years };
}
