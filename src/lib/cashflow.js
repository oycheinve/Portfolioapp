// Cash Flow Forecast (BETA) – prognoza pasywnych przepływów pieniężnych na najbliższe miesiące (czyste funkcje):
//  • dywidendy: harmonogram (ogłoszone / w drodze, np. transze Grupy Kęty z dividendFacts.js) oraz prognoza
//    z wypłat z ostatnich 12 miesięcy dla obecnej liczby akcji (ten sam termin rok później),
//  • konto oszczędnościowe: odsetki w dniach kapitalizacji wg obecnego salda, oprocentowania i modelu kapitalizacji,
//  • obligacje skarbowe: kupony (np. COI, ROR) oraz odsetki skapitalizowane wypłacane przy wykupie (np. EDO, TOS),
//    z tabelą inflacji CPI (GUS) – ta sama wycena co w module Poduszka.
// Podatek Belki wg konta (IKE / IKZE – 0%); ikeSaved = podatek, którego uniknięto dzięki opakowaniu IKE/IKZE.
import { BELKA_RATE } from './constants.js';
import { computeHoldings, isoDay } from './engine.js';
import { getCpiTable, valueBond } from './bonds.js';
import { dividendHistory, evaluateScheduleItem, matchingIncome, sharesAt } from './dividends.js';
import { grossInterest, nextCapitalizationDate, savingsProjection } from './savings.js';
import { belkaRateForAccount, bondBelkaRate } from './tax.js';

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
function savingsEvents(state, win) {
  const out = [];
  for (const account of state.accounts.filter((a) => a.type === 'SAVINGS')) {
    const p = savingsProjection(state, account, win.from);
    if (!(p.balance > 0) || !(p.rate > 0)) continue;
    let start = p.periodStart;
    for (let guard = 0; guard < 500; guard += 1) {
      const end = nextCapitalizationDate(start, p.capitalization);
      if (end > win.to) break;
      if (end >= win.from) {
        // Bieżący okres: odsetki od początku okresu (część już narosła); saldo stałe (bez dopłat)
        const gross = grossInterest(p.balance, p.rate, p.capitalization, start, end);
        if (gross > 0.005) {
          const t = taxSplit(gross, account);
          out.push({ kind: 'interest', date: end, label: `Odsetki – ${account.name}`, detail: `${p.rate.toLocaleString('pl-PL')}% od ${p.balance.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} zł · kapitalizacja`, status: 'prognoza', gross, ...t });
        }
      }
      start = end;
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

// Pełna prognoza: miesiące (sumy brutto/netto per rodzaj) + lista zdarzeń (chronologicznie)
export function cashFlowForecast(state, { today = isoDay(new Date()), months = 12 } = {}) {
  const win = forecastWindow(today, months);
  const events = [...dividendEvents(state, win), ...savingsEvents(state, win), ...bondEvents(state, win)]
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
