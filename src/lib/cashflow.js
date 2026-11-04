// Cash Flow Forecast (BETA) – prognoza pasywnych przepływów pieniężnych na najbliższe miesiące (czyste funkcje):
//  • dywidendy: harmonogram (ogłoszone / w drodze, np. transze Grupy Kęty z dividendFacts.js) oraz prognoza
//    z wypłat z ostatnich 12 miesięcy dla obecnej liczby akcji (ten sam termin rok później),
//  • konto oszczędnościowe: odsetki w dniach kapitalizacji wg obecnego salda, oprocentowania i modelu kapitalizacji,
//  • obligacje skarbowe: kupony (np. COI, ROR) oraz odsetki skapitalizowane wypłacane przy wykupie (np. EDO, TOS),
//    z tabelą inflacji CPI (GUS) – ta sama wycena co w module Poduszka.
// Podatek Belki wg konta (IKE / IKZE – 0%); ikeSaved = podatek, którego uniknięto dzięki opakowaniu IKE/IKZE.
import { BELKA_RATE } from './constants.js';
import { bondIncomeEvents, computeHoldings, incomeEventsWithTax, isSafeAccount, isSyntheticDeposit, isoDay, limitDeposits, livePriceLookup, valuePortfolio } from './engine.js';
import { getCpiTable, valueBond } from './bonds.js';
import { dividendHistory, dividendPositions, evaluateScheduleItem, matchingIncome, sharesAt } from './dividends.js';
import { grossInterest, nextCapitalizationDate, savingsProjection } from './savings.js';
import { belkaRateForAccount, bondBelkaRate, limitForAccount } from './tax.js';

const WRAPPERS = new Set(['IKE', 'IKZE']);
const parse = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (iso, n) => {
  const d = parse(iso);
  d.setDate(d.getDate() + n);
  return isoDay(d);
};
const addYears = (iso, n) => {
  const d = parse(iso);
  d.setFullYear(d.getFullYear() + n);
  return isoDay(d);
};
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const monthKey = (iso) => iso.slice(0, 7);

// Okno prognozy: od dziś do końca miesiąca `months - 1` w przód (bieżący miesiąc + 11 kolejnych)
export function forecastWindow(today, months = 12) {
  const d = parse(today);
  const end = new Date(d.getFullYear(), d.getMonth() + months, 0);
  const keys = Array.from({ length: months }, (_, i) => {
    const m = new Date(d.getFullYear(), d.getMonth() + i, 1);
    return { key: isoDay(m).slice(0, 7), label: m.toLocaleDateString('pl-PL', { month: 'short', year: '2-digit' }), long: m.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' }) };
  });
  return { from: today, to: isoDay(end), keys };
}

// Podatek i oszczędność IKE dla kwoty brutto na koncie
function taxSplit(gross, account, { foreignTax = 0, deferredTaxed = true } = {}) {
  let rate = belkaRateForAccount(account);
  // Belka odroczona (np. Revolut): bank wypłaca brutto, 19% rozliczasz w PIT-38 – w prognozie netto i tak potrącona
  if (deferredTaxed && account?.belkaDeferred && account.belkaEnabled !== false) rate = BELKA_RATE;
  const domestic = Math.max(0, gross * rate - foreignTax);
  const tax = foreignTax + domestic;
  const ikeSaved = WRAPPERS.has(account?.type) ? Math.max(0, gross * BELKA_RATE - foreignTax) : 0;
  return { tax, net: gross - tax, ikeSaved };
}

// ── Dywidendy ──
function dividendEvents(state, win) {
  const out = [];
  const accountsById = Object.fromEntries(state.accounts.map((a) => [a.id, a]));
  const instById = Object.fromEntries(state.instruments.map((i) => [i.id, i]));
  const held = new Set(computeHoldings(state, win.from, null).filter((h) => h.quantity > 1e-9).map((h) => h.instrumentId));
  const covered = []; // [instrumentId, date] – terminy już ujęte z harmonogramu

  // 1) Harmonogram: ogłoszone / w drodze / prognozy, niezaksięgowane, z wypłatą w oknie
  for (const item of state.dividendSchedule || []) {
    if (item.bookedAt || !(Number(item.dps) > 0) || !held.has(item.instrumentId)) continue;
    const date = item.payDate || item.exDate;
    if (!date || date < win.from || date > win.to) continue;
    if (matchingIncome(state, item, win.from).length) continue;
    const ev = evaluateScheduleItem(state, item, win.from);
    let gross = 0;
    let net = 0;
    let tax = 0;
    let ikeSaved = 0;
    for (const a of ev.perAccount) {
      const t = taxSplit(a.gross, a.account, { foreignTax: a.foreignTax });
      gross += a.gross;
      net += t.net;
      tax += t.tax;
      ikeSaved += t.ikeSaved;
    }
    if (gross <= 0) continue;
    covered.push([item.instrumentId, date]);
    out.push({
      kind: 'dividends',
      date,
      label: `Dywidenda ${instById[item.instrumentId]?.ticker || ''}`.trim(),
      detail: `${ev.shares.toLocaleString('pl-PL', { maximumFractionDigits: 4 })} szt. × ${Number(item.dps).toLocaleString('pl-PL', { maximumFractionDigits: 4 })} ${item.currency || 'PLN'}${item.payDateEstimated ? ' · termin szacowany' : ''}`,
      status: item.estimated ? 'prognoza' : item.verified ? 'potwierdzona' : item.exDate && item.exDate <= win.from ? 'w drodze' : 'ogłoszona',
      gross,
      net,
      tax,
      ikeSaved,
    });
  }

  // 2) Prognoza z historii: wypłaty z ostatnich 12 miesięcy powtórzone rok później dla obecnej liczby akcji
  const yearAgo = addDays(win.from, -365);
  for (const instrumentId of held) {
    const hist = dividendHistory(state, instrumentId).filter((r) => r.date > yearAgo && r.date <= win.from && r.dpsPLN > 0);
    for (const r of hist) {
      const date = addYears(r.date, 1);
      if (date < win.from || date > win.to) continue;
      if (covered.some(([id, d]) => id === instrumentId && Math.abs(daysBetween(d, date)) <= 45)) continue;
      const shares = sharesAt(state, instrumentId, win.from);
      let gross = 0;
      let net = 0;
      let tax = 0;
      let ikeSaved = 0;
      let qty = 0;
      for (const [accountId, q] of Object.entries(shares)) {
        const g = q * r.dpsPLN;
        const t = taxSplit(g, accountsById[accountId]);
        qty += q;
        gross += g;
        net += t.net;
        tax += t.tax;
        ikeSaved += t.ikeSaved;
      }
      if (gross <= 0) continue;
      covered.push([instrumentId, date]);
      out.push({
        kind: 'dividends',
        date,
        label: `Dywidenda ${instById[instrumentId]?.ticker || ''}`.trim(),
        detail: `${qty.toLocaleString('pl-PL', { maximumFractionDigits: 4 })} szt. × ${r.dpsPLN.toLocaleString('pl-PL', { maximumFractionDigits: 4 })} zł · jak przed rokiem`,
        status: 'prognoza',
        gross,
        net,
        tax,
        ikeSaved,
      });
    }
  }
  return out;
}

// ── Konto oszczędnościowe ──
// Realny dzień dopisania odsetek: przesunięcie względem końca okresu kapitalizacji wyuczone z ostatnich wpisów
// odsetek konta (np. bank księguje ostatniego dnia miesiąca: −1 dzień, albo 2. dnia: +1); bez historii – koniec okresu.
export function postingOffsetDays(state, account) {
  const cap = account.capitalization || 'MONTHLY';
  const posted = state.income
    .filter((i) => i.accountId === account.id && i.type === 'INTEREST' && !i.auto && !String(i.id).startsWith('autoint_'))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 3);
  for (const i of posted) {
    // najbliższa granica okresu (koniec okresu, w którym odsetki naliczono)
    const boundary = nextCapitalizationDate(addDays(i.date, -10), cap);
    const off = daysBetween(boundary, i.date);
    if (off >= -5 && off <= 10) return off;
  }
  return 0;
}

function savingsEvents(state, win) {
  const out = [];
  for (const account of state.accounts.filter((a) => a.type === 'SAVINGS')) {
    const p = savingsProjection(state, account, win.from);
    if (!(p.balance > 0) || !(p.rate > 0)) continue;
    const offset = postingOffsetDays(state, account);
    let start = p.periodStart;
    for (let guard = 0; guard < 500; guard += 1) {
      const periodEnd = nextCapitalizationDate(start, p.capitalization);
      const end = offset ? addDays(periodEnd, offset) : periodEnd; // dzień realnego dopisania odsetek
      if (end > win.to) break;
      if (end >= win.from) {
        // Bieżący okres: odsetki od początku okresu (część już narosła); saldo stałe (bez dopłat)
        const gross = grossInterest(p.balance, p.rate, p.capitalization, start, periodEnd);
        if (gross > 0.005) {
          const t = taxSplit(gross, account);
          out.push({ kind: 'interest', date: end, label: `Odsetki – ${account.name}`, detail: `${p.rate.toLocaleString('pl-PL')}% od ${p.balance.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} zł · ${offset ? `dopisanie ${offset > 0 ? `${offset} dni po` : `${-offset} dni przed`} końcem okresu` : 'kapitalizacja'}${start === p.periodStart && p.accruedNet >= 0.005 ? ` · w tym narosłe już ${p.accruedNet.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł (w wartości poduszki)` : ''}`, status: 'prognoza', gross, ...t });
        }
      }
      start = periodEnd;
    }
  }
  return out;
}

// ── Obligacje skarbowe ──
function bondEvents(state, win) {
  const out = [];
  const accountsById = Object.fromEntries(state.accounts.map((a) => [a.id, a]));
  const cpi = getCpiTable(state.settings, state.inflation);
  for (const bond of state.bonds || []) {
    const account = accountsById[bond.accountId];
    const rate = bondBelkaRate(bond, account);
    const now = valueBond(bond, win.from, rate, cpi);
    if (now.matured || !(now.nominal > 0)) continue;
    const later = valueBond(bond, win.to, rate, cpi);
    const name = `${bond.series || bond.type} · ${bond.quantity} szt.`;
    // Kupony wypłacane w oknie (COI, ROR…)
    for (const c of later.coupons) {
      if (c.date < win.from || c.date > win.to) continue;
      const t = { tax: c.gross * rate, net: c.gross * (1 - rate), ikeSaved: WRAPPERS.has(account?.type) && rate === 0 ? c.gross * BELKA_RATE : 0 };
      out.push({ kind: 'bonds', date: c.date, label: `Kupon ${bond.series || bond.type}`, detail: `${name} · ${(c.rate * 100).toLocaleString('pl-PL', { maximumFractionDigits: 2 })}%`, status: 'prognoza', gross: c.gross, ...t });
    }
    // Wykup w oknie: odsetki skapitalizowane (EDO, TOS…) – kupony powyżej już zawierają wypłaty okresowe
    if (later.matured && later.maturityDate >= win.from && later.maturityDate <= win.to) {
      const atMaturity = valueBond(bond, later.maturityDate, rate, cpi);
      const gross = atMaturity.accruedGross;
      if (gross > 0.005) {
        const t = { tax: gross * rate, net: gross * (1 - rate), ikeSaved: WRAPPERS.has(account?.type) && rate === 0 ? gross * BELKA_RATE : 0 };
        out.push({ kind: 'bonds', date: later.maturityDate, label: `Wykup ${bond.series || bond.type}`, detail: `${name} · zwrot nominału ${atMaturity.nominal.toLocaleString('pl-PL')} zł + odsetki`, status: 'wykup', gross, ...t });
      }
    }
  }
  return out;
}

export const CF_KINDS = {
  dividends: { label: 'Dywidendy' },
  interest: { label: 'Odsetki z KO' },
  bonds: { label: 'Obligacje' },
};

// Źródła prognozy (przełączniki w widoku): dywidendy, obligacje skarbowe, konto oszczędnościowe – domyślnie wszystkie
export const CF_SOURCES = { dividends: true, bonds: true, interest: true };
export const normSources = (s) => ({ ...CF_SOURCES, ...(s && typeof s === 'object' ? s : {}) });

// Pełna prognoza: miesiące (sumy brutto/netto per rodzaj) + lista zdarzeń (chronologicznie); sources – uwzględniane źródła
export function cashFlowForecast(state, { today = isoDay(new Date()), months = 12, sources } = {}) {
  const win = forecastWindow(today, months);
  const src = normSources(sources);
  const events = [...(src.dividends ? dividendEvents(state, win) : []), ...(src.interest ? savingsEvents(state, win) : []), ...(src.bonds ? bondEvents(state, win) : [])]
    .filter((e) => Number.isFinite(e.gross) && e.gross > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.net - a.net));
  const rows = win.keys.map((k) => ({ ...k, dividends: 0, interest: 0, bonds: 0, dividendsGross: 0, interestGross: 0, bondsGross: 0, net: 0, gross: 0, tax: 0, ikeSaved: 0, items: [] }));
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  for (const e of events) {
    const r = byKey[monthKey(e.date)];
    if (!r) continue;
    r[e.kind] += e.net;
    r[`${e.kind}Gross`] += e.gross;
    r.net += e.net;
    r.gross += e.gross;
    r.tax += e.tax;
    r.ikeSaved += e.ikeSaved;
    r.items.push(e);
  }
  const sum = (f) => rows.reduce((s, r) => s + r[f], 0);
  const totals = { net: sum('net'), gross: sum('gross'), tax: sum('tax'), ikeSaved: sum('ikeSaved'), dividends: sum('dividends'), interest: sum('interest'), bonds: sum('bonds') };
  return { window: win, rows, events, totals, avgNet: totals.net / months, avgGross: totals.gross / months, currentNet: rows[0]?.net || 0 };
}

// Nadchodzące wypłaty (np. 90 dni) z odliczaniem dni
export function upcomingCashEvents(forecast, today, days = 90) {
  const to = addDays(today, days);
  return forecast.events.filter((e) => e.date >= today && e.date <= to).map((e) => ({ ...e, inDays: daysBetween(today, e.date) }));
}

// Pokrycie budżetu dochodem pasywnym (ułamki 0..n; null – brak budżetu)
export function passiveCoverage(passiveMonthly, { fixed = 0, total = 0 } = {}) {
  return { fixed: fixed > 0 ? passiveMonthly / fixed : null, total: total > 0 ? passiveMonthly / total : null };
}

// Kula śnieżna: kapitał generujący dochód pasywny rośnie o dopłaty i (przy DRIP) o reinwestowane przepływy;
// stopa dochodu = prognozowany roczny dochód / obecny kapitał dochodowy (bez wzrostu dywidend i cen)
export function snowball({ annualIncome, capital, years = 5, monthlyContribution = 0, drip = true }) {
  const y = capital > 0 ? annualIncome / capital : 0;
  let cap = capital;
  const out = [];
  for (let year = 1; year <= years; year += 1) {
    let income = 0;
    for (let m = 0; m < 12; m += 1) {
      const flow = (cap * y) / 12;
      income += flow;
      cap += monthlyContribution + (drip ? flow : 0);
    }
    out.push({ year, capital: cap, annual: income, monthly: income / 12 });
  }
  return { yieldRate: y, rows: out };
}

// Cel poduszki: postęp, brakująca kwota, pokrycie miesięcy, czas dojścia (odsetki + dopłata miesięczna)
export function safeGoalStats({ value, target, monthlyCosts = 0, yearlyIncomeNet = 0, monthlyContribution = 0 }) {
  const progress = target > 0 ? value / target : null;
  const missing = target > 0 ? Math.max(0, target - value) : null;
  const surplus = target > 0 ? Math.max(0, value - target) : null;
  const runway = monthlyCosts > 0 ? value / monthlyCosts : null;
  const monthlyRate = value > 0 ? yearlyIncomeNet / value / 12 : 0;
  let monthsToGoal = null;
  if (target > 0 && value >= target) monthsToGoal = 0;
  else if (target > 0 && (monthlyContribution > 0 || monthlyRate > 0)) {
    let v = value;
    for (let m = 1; m <= 1200; m += 1) {
      v = v * (1 + monthlyRate) + monthlyContribution;
      if (v >= target) {
        monthsToGoal = m;
        break;
      }
    }
  }
  return { progress, missing, surplus, reached: target > 0 && value >= target, runway, monthsToGoal, monthlyRate };
}


// ── Prognoza wieloletnia (BETA): wpłaty na IKE, Dividend Yield portfela, poduszka z limitem do celu ──

const monthsSpan = (from, to) => {
  const [y1, m1] = from.split('-').map(Number);
  const [y2, m2] = to.split('-').map(Number);
  return Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1);
};

// Historia faktycznych wpłat na IKE (rejestr wpłat / import XTB; bez wpłat technicznych): średnia miesięczna od
// miesiąca pierwszej wpłaty do bieżącego miesiąca włącznie. Konto z wpłatami z pliku XTB – liczą się tylko one.
export function ikeDepositHistory(state, today = isoDay(new Date())) {
  const ike = state.accounts.filter((a) => a.type === 'IKE');
  let list = [];
  for (const a of ike) {
    const all = state.cashflows.filter((c) => c.accountId === a.id && c.type === 'DEPOSIT' && c.date <= today && !isSyntheticDeposit(c));
    const fromFile = all.filter((c) => c.source === 'XTB');
    list = list.concat(fromFile.length ? fromFile : all);
  }
  const total = list.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  if (!list.length || !(total > 0)) return { total: 0, count: 0, first: null, months: 0, monthly: 0, yearly: 0 };
  const first = list.reduce((m, c) => (c.date < m ? c.date : m), list[0].date);
  const months = monthsSpan(first, today);
  return { total, count: list.length, first, months, monthly: total / months, yearly: (total / months) * 12 };
}

// Dividend Yield portfela: dywidendy brutto otrzymane na IKE w ostatnich 12 miesiącach / obecna wartość IKE.
// Bez wypłat w historii – prognoza roczna z pozycji IKE (stawka DPS × liczba akcji) / wartość IKE.
// Brak konta IKE – cały portfel inwestycyjny (bez poduszki).
export function portfolioDividendYield(state, today = isoDay(new Date())) {
  const v = valuePortfolio(state, { asOf: today, accountIds: null, priceLookup: livePriceLookup(state) });
  const valueOf = (list) => list.reduce((s, id) => s + Math.max(0, v.byAccount[id]?.total || 0), 0);
  const yearAgo = addDays(today, -365);
  const income = incomeEventsWithTax(state);
  const positions = dividendPositions(state, today);
  const measure = (ids, scope) => {
    const value = valueOf(ids);
    const idSet = new Set(ids);
    const received = income.filter((i) => i.type === 'DIVIDEND' && idSet.has(i.accountId) && i.date > yearAgo && i.date <= today).reduce((s, i) => s + (Number(i.gross) || 0), 0);
    if (value > 0 && received > 0) return { rate: received / value, received, value, scope, basis: 'history' };
    const projected = positions.filter((p) => idSet.has(p.accountId)).reduce((s, p) => s + (p.annualGross || 0), 0);
    return { rate: value > 0 ? projected / value : 0, received: projected, value, scope, basis: projected > 0 ? 'forecast' : 'none' };
  };
  const ikeIds = state.accounts.filter((a) => a.type === 'IKE').map((a) => a.id);
  const ikeValue = valueOf(ikeIds);
  const ike = ikeIds.length && ikeValue > 0 ? measure(ikeIds, 'IKE') : null;
  // IKE bez dywidend (np. same ETF-y akumulujące) – stopa całego portfela inwestycyjnego (bez poduszki)
  const out = ike && ike.rate > 0 ? ike : measure(state.accounts.filter((a) => !isSafeAccount(a)).map((a) => a.id), 'portfolio');
  return { ...out, ikeValue };
}

// Plan wpłat na IKE: miesięcznie A do granicznika (X lat), potem B (stepEnabled); pilnowanie rocznego limitu IKE
export function ikeMonthlyPlan({ base = 0, stepEnabled = false, stepYears = 3, stepAmount = 0 }) {
  return (monthIndex) => (stepEnabled && monthIndex >= Math.max(0, Number(stepYears) || 0) * 12 ? Math.max(0, Number(stepAmount) || 0) : Math.max(0, Number(base) || 0));
}

// Kapitał i stopy poduszki: obligacje (wartość, odsetki netto wg bieżącego oprocentowania) i konta oszczędnościowe
export function cushionBase(state, today = isoDay(new Date())) {
  const v = valuePortfolio(state, { asOf: today, accountIds: null, priceLookup: livePriceLookup(state) });
  const cpi = getCpiTable(state.settings, state.inflation);
  let bonds = 0;
  let bondsIncome = 0;
  for (const b of v.bonds) {
    if (b.account?.type !== 'BONDS' || !(b.value > 0.005)) continue;
    bonds += b.value;
    const belka = bondBelkaRate(b, b.account);
    const val = valueBond(b, today, belka, cpi);
    if (!val.matured) bondsIncome += val.nominal * val.currentRate * (1 - belka);
  }
  const savingsAccounts = state.accounts.filter((a) => a.type === 'SAVINGS');
  const savings = savingsAccounts.reduce((s, a) => s + Math.max(0, v.byAccount[a.id]?.cash || 0), 0);
  const savingsIncome = savingsAccounts.reduce((s, a) => s + (savingsProjection(state, a, today).yearlyNet || 0), 0);
  return { bonds, savings, bondsIncome, savingsIncome, bondsRate: bonds > 0 ? bondsIncome / bonds : 0, savingsRate: savings > 0 ? savingsIncome / savings : 0 };
}

// Docelowe wagi poduszki: udział obligacji 0..100 (reszta – konto oszczędnościowe); null – brak ustawienia
export function cushionWeights({ bonds, savings }, weightBonds) {
  const total = bonds + savings;
  const w = weightBonds === '' || weightBonds === null || weightBonds === undefined || !Number.isFinite(Number(weightBonds)) ? null : Math.min(100, Math.max(0, Number(weightBonds))) / 100;
  const current = total > 0 ? bonds / total : null;
  if (w === null) return { target: null, current, total };
  const bondsTarget = total * w;
  return { target: w, current, total, bondsTarget, savingsTarget: total - bondsTarget, bondsGap: bondsTarget - bonds, savingsGap: total - bondsTarget - savings, deviationPp: current === null ? null : (current - w) * 100 };
}

// Poduszka miesiąc po miesiącu: odsetki (netto) zostają w poduszce, dopłata (kwota / mies. albo % rocznie ponad
// odsetki) dzielona wg wag docelowych (bez wag – wg obecnych proporcji). TWARDY LIMIT: wartość rośnie najwyżej
// do celu (cap = max(cel, obecna wartość)); po osiągnięciu celu kapitał stoi, a odsetki liczone są od kwoty celu.
export function cushionProjection({ bonds = 0, savings = 0, bondsRate = 0, savingsRate = 0, target = 0, monthlyContribution = 0, growthPct = 0, weightBonds = null, years = 5, reinvestInterest = true }) {
  let b = Math.max(0, bonds);
  let s = Math.max(0, savings);
  const start = b + s;
  const cap = target > 0 ? Math.max(target, start) : Infinity;
  const wB = weightBonds !== null && Number.isFinite(Number(weightBonds)) && weightBonds !== '' ? Math.min(1, Math.max(0, Number(weightBonds) / 100)) : start > 0 ? b / start : 0.5;
  const rows = [];
  const overflowByMonth = [];
  let capReachedMonth = start >= cap ? 0 : null;
  for (let year = 1; year <= years; year += 1) {
    let bondsIncome = 0;
    let savingsIncome = 0;
    let contributed = 0;
    let reinvested = 0;
    let overflow = 0;
    for (let m = 0; m < 12; m += 1) {
      const ib = (b * bondsRate) / 12;
      const is = (s * savingsRate) / 12;
      bondsIncome += ib;
      savingsIncome += is;
      const total = b + s;
      const room = Math.max(0, cap - total);
      const growth = Math.max(0, Number(monthlyContribution) || 0) + (total * (Math.max(0, Number(growthPct) || 0) / 100)) / 12;
      // Bez reinwestycji odsetki są wypłacane (nie powiększają kapitału) – rośnie tylko dopłata
      const rb = reinvestInterest ? ib : 0;
      const rs = reinvestInterest ? is : 0;
      const add = rb + rs + growth;
      const k = add > 0 ? Math.min(1, room / add) : 0;
      b += rb * k + growth * k * wB;
      s += rs * k + growth * k * (1 - wB);
      contributed += growth * k;
      reinvested += (rb + rs) * k;
      // Odsetki ponad próg celu (nie mieszczą się w poduszce) – nadwyżka do przeniesienia (np. do akcji)
      const over = (rb + rs) * (1 - k);
      overflow += over;
      overflowByMonth.push(over);
      if (capReachedMonth === null && b + s >= cap - 0.005) capReachedMonth = (year - 1) * 12 + m + 1;
    }
    rows.push({ year, bonds: b, savings: s, value: b + s, bondsIncome, savingsIncome, income: bondsIncome + savingsIncome, contributed, reinvested, overflow, capped: b + s >= cap - 0.005 });
  }
  return { cap: Number.isFinite(cap) ? cap : null, capReachedMonth, rows, overflowByMonth };
}

// Symulator wieloletni Cash Flow: IKE (obecna wartość + plan wpłat, dywidendy wg Dividend Yield portfela, DRIP),
// pozostałe pozycje dywidendowe (stopa z prognozy, opcjonalna dopłata), poduszka (cushionProjection z limitem celu).
// Wpłaty na IKE: liczone od przyszłego miesiąca, w każdym roku kalendarzowym najwyżej do limitu IKE
// (w bieżącym roku – do pozostałej części limitu).
export function multiYearForecast(state, { today = isoDay(new Date()), years = 5, sources, drip = true, otherContribution = 0, ike = {}, cushion = {} } = {}) {
  const src = normSources(sources);
  const dy = portfolioDividendYield(state, today);
  const hist = ikeDepositHistory(state, today);
  const base = ike.mode === 'manual' ? (ike.period === 'year' ? (Number(ike.amount) || 0) / 12 : Number(ike.amount) || 0) : hist.monthly;
  const plan = ikeMonthlyPlan({ base, stepEnabled: !!ike.stepEnabled, stepYears: ike.stepYears, stepAmount: ike.stepAmount });
  const ikeAccounts = state.accounts.filter((a) => a.type === 'IKE');
  const mainIke = ikeAccounts[0] || null;
  const limitOf = (year) => (mainIke ? limitForAccount(mainIke, state.settings, year) : Infinity) || Infinity;
  const usedThisYear = ikeAccounts.reduce((s, a) => s + limitDeposits(state, a.id, Number(today.slice(0, 4))), 0);

  // Pozostałe (poza IKE i poduszką) pozycje dywidendowe: stopa netto z prognozy rocznej stawki DPS
  const other = dividendPositions(state, today).filter((p) => p.account?.type !== 'IKE' && !isSafeAccount(p.account) && p.annualGross > 0);
  const otherCap0 = other.reduce((s, p) => s + (p.value || 0), 0);
  const otherRate = otherCap0 > 0 ? other.reduce((s, p) => s + p.annualNet, 0) / otherCap0 : 0;

  const cb = cushionBase(state, today);
  const cush = cushionProjection({ ...cb, target: Number(cushion.target) || 0, monthlyContribution: cushion.growthMode === 'pct' ? 0 : Number(cushion.monthlyContribution) || 0, growthPct: cushion.growthMode === 'pct' ? Number(cushion.growthPct) || 0 : 0, weightBonds: cushion.weightBonds, years, reinvestInterest: drip });

  let ikeCap = dy.ikeValue;
  let otherCap = otherCap0;
  // Odsetki z poduszki ponad próg celu (DRIP) kupują akcje poza IKE: stopa netto pozostałych pozycji,
  // a bez nich – Dividend Yield portfela po podatku Belki
  let overflowCap = 0;
  const overflowRate = otherRate > 0 ? otherRate : dy.rate * (1 - BELKA_RATE);
  let calYear = Number(today.slice(0, 4));
  let calMonth = Number(today.slice(5, 7)); // 1..12 – bieżący; wpłaty od następnego
  let yearDeposited = usedThisYear;
  let ikeTotal = 0;
  let reinvestedTotal = 0;
  const rows = [];
  for (let year = 1; year <= years; year += 1) {
    let dividends = 0;
    let dripDividends = 0; // dywidendy dopisane do kapitału (DRIP)
    let ikeDeposits = 0;
    let limitCut = 0;
    for (let m = 0; m < 12; m += 1) {
      calMonth += 1;
      if (calMonth > 12) {
        calMonth = 1;
        calYear += 1;
        yearDeposited = 0;
      }
      const want = plan((year - 1) * 12 + m);
      const room = Math.max(0, limitOf(calYear) - yearDeposited);
      const dep = Math.min(want, room);
      limitCut += want - dep;
      yearDeposited += dep;
      ikeDeposits += dep;
      const divIke = (ikeCap * dy.rate) / 12; // IKE – bez podatku Belki
      const divOther = (otherCap * otherRate) / 12;
      const divOverflow = (overflowCap * overflowRate) / 12;
      dividends += divIke + divOther + divOverflow;
      // DRIP: dywidenda z tego miesiąca od razu powiększa kapitał, który generuje dywidendy w kolejnych miesiącach
      ikeCap += dep + (drip ? divIke : 0);
      otherCap += Math.max(0, Number(otherContribution) || 0) + (drip ? divOther : 0);
      if (drip) dripDividends += divIke + divOther + divOverflow;
      overflowCap += (drip ? divOverflow : 0) + (cush.overflowByMonth[(year - 1) * 12 + m] || 0);
    }
    ikeTotal += ikeDeposits;
    const c = cush.rows[year - 1];
    const div = src.dividends ? dividends : 0;
    const bondsInc = src.bonds ? c.bondsIncome : 0;
    const intInc = src.interest ? c.savingsIncome : 0;
    const annual = div + bondsInc + intInc;
    const capital = (src.dividends ? ikeCap + otherCap + overflowCap : 0) + (src.bonds ? c.bonds : 0) + (src.interest ? c.savings : 0);
    const reinvested = (src.dividends ? dripDividends + c.overflow : 0) + (src.bonds || src.interest ? c.reinvested * ((src.bonds ? c.bondsIncome : 0) + (src.interest ? c.savingsIncome : 0)) / (c.income || 1) : 0);
    reinvestedTotal += reinvested;
    rows.push({ year, capital, ikeCapital: ikeCap, otherCapital: otherCap, cushion: c.value, cushionCapped: c.capped, ikeDeposits, ikeDepositsTotal: ikeTotal, limitCut, dividends: div, bonds: bondsInc, interest: intInc, annual, monthly: annual / 12, reinvested, reinvestedTotal, overflowToStocks: c.overflow, overflowCapital: overflowCap });
  }
  const capital0 = (src.dividends ? dy.ikeValue + otherCap0 : 0) + (src.bonds ? cb.bonds : 0) + (src.interest ? cb.savings : 0);
  return { dy, hist, base, plan, otherRate, otherCapital: otherCap0, cushion: cush, cushionBase: cb, capital0, rows, drip, overflowRate };
}

// ── Wykres przepływów (BETA): zakres i podstawa ──
// range: 'next12' – bieżący + 11 kolejnych miesięcy (prognoza), 'last12' – 11 minionych + bieżący (historia z rejestru),
//        'calendar' – styczeń–grudzień bieżącego roku (miniona część z rejestru, reszta z prognozy).
// basis: 'payout' – realne daty wypłat (dywidendy w dniu wypłaty, kupony / wykup obligacji, dopisanie odsetek KO),
//        'accrual' – odsetki naliczane dziennie: obligacje od dnia zakupu (przyrost odsetek narosłych + kupony w miesiącu),
//        KO – odsetki narosłe w danym miesiącu; dywidendy zawsze w dniu wypłaty.
const monthStart = (y, m) => isoDay(new Date(y, m, 1));
export function cashFlowMonths(today, range = 'next12') {
  const d = parse(today);
  const y = d.getFullYear();
  const m = d.getMonth();
  const first = range === 'last12' ? new Date(y, m - 11, 1) : range === 'calendar' ? new Date(y, 0, 1) : new Date(y, m, 1);
  return Array.from({ length: 12 }, (_, i) => {
    const s = new Date(first.getFullYear(), first.getMonth() + i, 1);
    const key = isoDay(s).slice(0, 7);
    return {
      key,
      start: monthStart(s.getFullYear(), s.getMonth()),
      next: monthStart(s.getFullYear(), s.getMonth() + 1),
      label: s.toLocaleDateString('pl-PL', { month: 'short', year: '2-digit' }),
      long: s.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' }),
      past: key < today.slice(0, 7),
      current: key === today.slice(0, 7),
    };
  });
}

// Wypłaty zrealizowane (rejestr przychodów, kupony i wykupy obligacji) z datą ≤ dziś – netto/brutto per rodzaj
function realizedEvents(state, today) {
  const accById = Object.fromEntries(state.accounts.map((a) => [a.id, a]));
  const out = [];
  for (const i of incomeEventsWithTax(state)) {
    if (i.date > today) continue;
    const t = accById[i.accountId]?.type;
    const kind = i.type === 'DIVIDEND' ? 'dividends' : i.type === 'INTEREST' && t === 'SAVINGS' ? 'interest' : i.type === 'INTEREST' && t === 'BONDS' ? 'bonds' : null;
    if (kind) out.push({ kind, date: i.date, gross: Number(i.gross) || 0, net: Number.isFinite(i.net) ? i.net : 0 });
  }
  for (const e of bondIncomeEvents(state, today)) if (e.date <= today) out.push({ kind: 'bonds', date: e.date, gross: e.gross, net: e.net });
  const cpi = getCpiTable(state.settings, state.inflation);
  for (const b of state.bonds || []) {
    const rate = bondBelkaRate(b, accById[b.accountId]);
    const v = valueBond(b, today, rate, cpi);
    if (v.matured && v.maturityDate <= today) {
      const atM = valueBond(b, v.maturityDate, rate, cpi);
      if (atM.accruedGross > 0.005) out.push({ kind: 'bonds', date: v.maturityDate, gross: atM.accruedGross, net: atM.accruedNet });
    }
  }
  return out;
}

// Odsetki obligacji naliczone w przedziale [a, b): przyrost odsetek narosłych + kupony wypłacone w przedziale (netto/brutto)
function bondAccrualBetween(state, a, b) {
  const accById = Object.fromEntries(state.accounts.map((x) => [x.id, x]));
  const cpi = getCpiTable(state.settings, state.inflation);
  let net = 0;
  let gross = 0;
  for (const bond of state.bonds || []) {
    if (bond.purchaseDate >= b) continue;
    const rate = bondBelkaRate(bond, accById[bond.accountId]);
    const va = valueBond(bond, a, rate, cpi);
    const vb = valueBond(bond, b, rate, cpi);
    if (va.matured) continue;
    const coupons = vb.coupons.filter((c) => c.date > a && c.date <= b).reduce((s, c) => s + c.gross, 0);
    const g = vb.accruedGross - va.accruedGross + coupons;
    gross += g;
    net += g * (1 - rate);
  }
  return { gross: Math.max(0, gross), net: Math.max(0, net) };
}

export function cashFlowSeries(state, { today = isoDay(new Date()), range = 'next12', basis = 'payout', sources } = {}) {
  const src = normSources(sources);
  const months = cashFlowMonths(today, range);
  const rows = months.map((k) => ({ ...k, dividends: 0, interest: 0, bonds: 0, dividendsGross: 0, interestGross: 0, bondsGross: 0, net: 0, gross: 0 }));
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  const add = (r, kind, net, gross) => {
    if (!r || !src[kind] || !(gross > 0 || net > 0)) return;
    r[kind] += net;
    r[`${kind}Gross`] += gross;
    r.net += net;
    r.gross += gross;
  };
  const lastKey = rows[rows.length - 1].key;
  // Przeszłość (≤ dziś): wypłaty z rejestru; przy naliczaniu dziennym odsetki KO z wpisu przypisane do miesiąca naliczenia
  if (rows[0].key <= today.slice(0, 7)) {
    for (const e of realizedEvents(state, today)) {
      if (basis === 'accrual' && e.kind === 'bonds') continue;
      const date = basis === 'accrual' && e.kind === 'interest' ? addDays(e.date, -1) : e.date;
      add(byKey[monthKey(date)], e.kind, e.net, e.gross);
    }
  }
  // Przyszłość (> dziś): prognoza wypłat do końca zakresu
  if (lastKey >= today.slice(0, 7)) {
    const [ly, lm] = lastKey.split('-').map(Number);
    const ahead = (ly - Number(today.slice(0, 4))) * 12 + (lm - Number(today.slice(5, 7))) + 1;
    const f = cashFlowForecast(state, { today, months: ahead, sources: src });
    for (const e of f.events) {
      if (e.date <= today && e.kind !== 'dividends') continue; // dziś już w rejestrze / w narosłych
      if (basis === 'accrual' && (e.kind === 'bonds' || e.kind === 'interest')) continue;
      add(byKey[monthKey(e.date)], e.kind, e.net, e.gross);
    }
    if (basis === 'accrual' && src.interest) {
      // KO: odsetki narastające dziennie od dziś do końca każdego miesiąca (obecne saldo, stopa i Belka konta)
      for (const account of state.accounts.filter((a) => a.type === 'SAVINGS')) {
        const p = savingsProjection(state, account, today);
        if (!(p.balance > 0) || !(p.rate > 0)) continue;
        const cap = p.capitalization === 'DAILY' ? 'DAILY' : 'MONTHLY';
        for (const r of rows) {
          if (r.next <= today) continue;
          const from = r.start > today ? r.start : today;
          const g = grossInterest(p.balance, p.rate, cap, from, r.next);
          add(r, 'interest', g * (1 - p.belka), g);
        }
        // Bieżący, jeszcze niezaksięgowany okres (od początku okresu / ostatniego wpisu do dziś) – w swoich miesiącach
        for (const r of rows) {
          const a = r.start > p.periodStart ? r.start : p.periodStart;
          const b = r.next < today ? r.next : today;
          if (a >= b) continue;
          const g = grossInterest(p.balance, p.rate, cap, a, b);
          add(r, 'interest', g * (1 - p.belka), g);
        }
      }
    }
  }
  // Obligacje przy naliczaniu dziennym – przeszłość i przyszłość jednolicie (przyrost odsetek dzień po dniu)
  if (basis === 'accrual' && src.bonds) for (const r of rows) {
    const acc = bondAccrualBetween(state, r.start, r.next);
    add(r, 'bonds', acc.net, acc.gross);
  }
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  return { rows, range, basis, totals: { net: sum('net'), gross: sum('gross'), dividends: sum('dividends'), interest: sum('interest'), bonds: sum('bonds') } };
}
