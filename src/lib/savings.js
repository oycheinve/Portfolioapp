// Etap 3: konto oszczędnościowe – projekcja odsetek, automatyczne księgowanie odsetek netto,
// oraz zestawienie dochodu pasywnego (dywidendy + kupony obligacji + odsetki).
import { BELKA_RATE, CAPITALIZATION } from './constants.js';
import { computeCashBalances, incomeEventsWithTax, bondIncomeEvents, isoDay } from './engine.js';
import { belkaRateForAccount } from './tax.js';

function parse(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(a, b) {
  return Math.round((parse(b) - parse(a)) / 86400000);
}

// Granice okresów kapitalizacji (data dopisania odsetek). Kapitalizacja dzienna księgowana zbiorczo co miesiąc.
export function nextCapitalizationDate(iso, capitalization) {
  const d = parse(iso);
  const y = d.getFullYear();
  const m = d.getMonth();
  if (capitalization === 'YEARLY') return isoDay(new Date(y + 1, 0, 1));
  if (capitalization === 'QUARTERLY') return isoDay(new Date(y, Math.floor(m / 3) * 3 + 3, 1));
  return isoDay(new Date(y, m + 1, 1));
}

function periodStartFor(iso, capitalization) {
  const d = parse(iso);
  const y = d.getFullYear();
  const m = d.getMonth();
  if (capitalization === 'YEARLY') return isoDay(new Date(y, 0, 1));
  if (capitalization === 'QUARTERLY') return isoDay(new Date(y, Math.floor(m / 3) * 3, 1));
  return isoDay(new Date(y, m, 1));
}

// Odsetki brutto za okres [start, end) od salda `balance`
export function grossInterest(balance, ratePct, capitalization, start, end) {
  const r = (Number(ratePct) || 0) / 100;
  const days = Math.max(0, daysBetween(start, end));
  if (balance <= 0 || r <= 0 || days === 0) return 0;
  if (capitalization === 'DAILY') return balance * (Math.pow(1 + r / 365, days) - 1);
  return balance * r * (days / 365);
}

export function effectiveAnnualRate(ratePct, capitalization) {
  const r = (Number(ratePct) || 0) / 100;
  const n = CAPITALIZATION[capitalization]?.periodsPerYear || 12;
  return Math.pow(1 + r / n, n) - 1;
}

function lastInterestDate(state, accountId) {
  return state.income
    .filter((i) => i.accountId === accountId && i.type === 'INTEREST')
    .reduce((m, i) => (!m || i.date > m ? i.date : m), null);
}

// Projekcja dla karty konta oszczędnościowego
export function savingsProjection(state, account, today = isoDay(new Date())) {
  const income = [...incomeEventsWithTax(state), ...bondIncomeEvents(state, today)];
  const balance = computeCashBalances(state, today, [account.id], income)[account.id] || 0;
  const belka = belkaRateForAccount(account);
  // Podatek odroczony (np. Revolut): bank wypłaca odsetki brutto, 19% rozliczane samodzielnie w PIT-38
  const deferred = !!account.belkaDeferred && account.belkaEnabled !== false;
  const cap = account.capitalization || 'MONTHLY';
  const rate = Number(account.interestRate) || 0;
  const periodStart = periodStartFor(today, cap);
  const nextCap = nextCapitalizationDate(today, cap);
  const accruedGross = grossInterest(balance, rate, cap, periodStart, today);
  const r = rate / 100;
  const monthGross = balance > 0 ? balance * (cap === 'DAILY' ? Math.pow(1 + r / 365, 365 / 12) - 1 : r / 12) : 0;
  const ear = effectiveAnnualRate(rate, cap);
  const yearAgo = isoDay(new Date(parse(today).getFullYear() - 1, parse(today).getMonth(), parse(today).getDate()));
  const last12 = income.filter((i) => i.accountId === account.id && i.type === 'INTEREST' && i.date > yearAgo && i.date <= today);
  return {
    balance,
    rate,
    capitalization: cap,
    belka,
    ear,
    earNet: ear * (1 - belka),
    monthlyGross: monthGross,
    monthlyNet: monthGross * (1 - belka),
    yearlyNet: balance * ear * (1 - belka),
    accruedGross,
    accruedNet: accruedGross * (1 - belka),
    periodStart,
    nextCapitalization: nextCap,
    last12Net: last12.reduce((s, i) => s + i.net, 0),
    last12Gross: last12.reduce((s, i) => s + (Number(i.gross) || 0), 0),
    lastPosted: lastInterestDate(state, account.id),
    deferred,
    pitDueYtd: deferred
      ? income
          .filter((i) => i.accountId === account.id && i.type === 'INTEREST' && i.date.slice(0, 4) === today.slice(0, 4) && i.date <= today)
          .reduce((s, i) => s + (Number(i.gross) || 0), 0) * BELKA_RATE
      : 0,
    pitDueYearly: deferred ? balance * ear * BELKA_RATE : 0,
  };
}

// Automatyczne księgowanie odsetek: dla kont z włączonym `autoInterest` dopisuje wpisy INTEREST
// za każdy zakończony okres kapitalizacji od `autoInterestFrom`. Id deterministyczne – brak duplikatów.
export function pendingSavingsInterest(state, today = isoDay(new Date())) {
  const out = [];
  const working = { ...state, income: [...state.income] };
  const existing = new Set(state.income.map((i) => i.id));
  for (const account of state.accounts) {
    if (account.type !== 'SAVINGS' || !account.autoInterest) continue;
    const cap = account.capitalization || 'MONTHLY';
    let start = account.autoInterestFrom || today;
    for (let guard = 0; guard < 240; guard += 1) {
      const end = nextCapitalizationDate(start, cap);
      if (end > today) break;
      const id = `autoint_${account.id}_${end}`;
      if (!existing.has(id)) {
        const income = [...incomeEventsWithTax(working), ...bondIncomeEvents(working, start)];
        const balance = computeCashBalances(working, start, [account.id], income)[account.id] || 0;
        const gross = Math.round(grossInterest(balance, account.interestRate, cap, start, end) * 100) / 100;
        if (gross > 0) {
          const entry = {
            id,
            accountId: account.id,
            date: end,
            type: 'INTEREST',
            gross,
            foreignTax: 0,
            auto: true,
            note: `Odsetki ${(Number(account.interestRate) || 0).toFixed(2)}% (${CAPITALIZATION[cap]?.label.toLowerCase()} kap.) od ${balance.toFixed(2)} zł`,
          };
          out.push(entry);
          working.income.push(entry);
          existing.add(id);
        }
      }
      start = end;
    }
  }
  return out;
}

// Dochód pasywny netto miesiąc po miesiącu (ostatnie N miesięcy): dywidendy, kupony obligacji, odsetki
export function passiveIncomeByMonth(state, months = 12, today = new Date()) {
  const todayIso = isoDay(today);
  const income = [...incomeEventsWithTax(state), ...bondIncomeEvents(state, todayIso)];
  const rows = [];
  for (let k = months - 1; k >= 0; k -= 1) {
    const d = new Date(today.getFullYear(), today.getMonth() - k, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    rows.push({
      key,
      label: d.toLocaleDateString('pl-PL', { month: 'short', year: '2-digit' }),
      dividends: 0,
      bonds: 0,
      interest: 0,
    });
  }
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  for (const i of income) {
    const r = byKey[i.date.slice(0, 7)];
    if (!r || i.date > todayIso) continue;
    if (i.type === 'DIVIDEND') r.dividends += i.net;
    else if (i.source === 'BOND') r.bonds += i.net;
    else r.interest += i.net;
  }
  for (const r of rows) r.total = r.dividends + r.bonds + r.interest;
  return rows;
}
