// Silnik obliczeń portfela: księga zdarzeń kont, pozycje, wycena, Prawdziwy Zysk Total, TWR, CAGR.
import { ACCOUNT_TYPES, XTB_FX_FEE_PCT } from './constants.js';
import { getCpiTable, valueBond } from './bonds.js';
import { bondBelkaRate, computeIncomeTax, limitForAccount } from './tax.js';

const DAY = 86400000;

export function isoDay(d) {
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function daysBetween(a, b) {
  return (new Date(b).getTime() - new Date(a).getTime()) / DAY;
}

function inFilter(accountIds, accountId) {
  return !accountIds || accountIds.includes(accountId);
}

export function resolveAccountIds(state, filter) {
  if (!filter || filter === 'ALL') return state.accounts.map((a) => a.id);
  if (filter.startsWith('TYPE:')) {
    const type = filter.slice(5);
    return state.accounts.filter((a) => a.type === type).map((a) => a.id);
  }
  return [filter];
}

// Kurs waluty -> PLN
export function fxToPLN(fx, currency) {
  if (!currency || currency === 'PLN') return 1;
  const r = fx?.rates?.[currency];
  return Number.isFinite(r) && r > 0 ? r : 1;
}

// Cena bieżąca instrumentu w PLN na podstawie notowań w stanie.
export function livePriceLookup(state) {
  const { quotes = {}, fx } = state.prices || {};
  return (instrument) => {
    const q = quotes[instrument.id];
    if (!q || !Number.isFinite(q.price)) return null;
    return q.price * fxToPLN(fx, q.currency || instrument.currency);
  };
}

// Kupony obligacji jako zdarzenia przychodowe (dla kont i okresów)
export function bondIncomeEvents(state, asOf) {
  const events = [];
  const accountsById = Object.fromEntries(state.accounts.map((a) => [a.id, a]));
  const cpi = getCpiTable(state.settings);
  for (const bond of state.bonds) {
    const account = accountsById[bond.accountId];
    const rate = bondBelkaRate(bond, account);
    const v = valueBond(bond, asOf, rate, cpi);
    for (const c of v.coupons) {
      events.push({
        id: `${bond.id}_${c.date}`,
        accountId: bond.accountId,
        bondId: bond.id,
        date: c.date,
        type: 'INTEREST',
        gross: c.gross,
        tax: c.gross * rate,
        net: c.gross * (1 - rate),
        source: 'BOND',
      });
    }
  }
  return events;
}

// Przychody (dywidendy/odsetki) z ręcznego rejestru wraz z naliczonym podatkiem
export function incomeEventsWithTax(state) {
  const accountsById = Object.fromEntries(state.accounts.map((a) => [a.id, a]));
  return state.income.map((i) => {
    const t = computeIncomeTax(i, accountsById[i.accountId], state.settings);
    return { ...i, tax: t.tax, net: t.net, source: 'MANUAL' };
  });
}

// Koszty transakcji w PLN: wartość, prowizja oraz prowizja za przewalutowanie (np. XTB IKE 0,05%) –
// naliczana, gdy konto rozlicza się w PLN, a instrument notowany jest w walucie obcej.
// Prowizja za przewalutowanie konta (w %). Brak ustawienia = domyślnie XTB 0,05% dla IKE i rachunków w XTB.
export function accountFxPct(account) {
  if (!account || account.type === 'SAVINGS' || account.type === 'BONDS') return 0;
  const raw = account.fxConversionPct;
  if (raw !== undefined && raw !== null && raw !== '') return Number(raw) || 0;
  return account.type === 'IKE' || /xtb/i.test(account.institution || '') ? XTB_FX_FEE_PCT : 0;
}

export function fxConversionPct(account, instrument, trade) {
  if (trade && trade.fxFeePct !== undefined && trade.fxFeePct !== null && trade.fxFeePct !== '') return (Number(trade.fxFeePct) || 0) / 100;
  const pct = accountFxPct(account);
  const ccy = trade?.currency || instrument?.currency || 'PLN';
  return pct > 0 && ccy !== 'PLN' ? pct / 100 : 0;
}

export function tradeAmounts(trade, account, instrument) {
  const gross = (Number(trade.quantity) || 0) * (Number(trade.price) || 0) * (Number(trade.fxRate) || 1);
  const fee = Number(trade.fee) || 0;
  const fxFee = gross * fxConversionPct(account, instrument, trade);
  return { gross, fee, fxFee, buyCost: gross + fee + fxFee, sellProceeds: gross - fee - fxFee };
}

// Wpływ transakcji na gotówkę konta (kupno ujemny, sprzedaż dodatni) – z prowizjami i przewalutowaniem
export function tradeCashDelta(state, trade) {
  const account = state.accounts.find((a) => a.id === trade.accountId);
  const instrument = state.instruments.find((i) => i.id === trade.instrumentId);
  const a = tradeAmounts(trade, account, instrument);
  return trade.side === 'BUY' ? -a.buyCost : a.sellProceeds;
}

// Pozycje (akcje/ETF) wyliczane z transakcji metodą średniego kosztu.
export function computeHoldings(state, asOf, accountIds) {
  const instrumentsById = Object.fromEntries(state.instruments.map((i) => [i.id, i]));
  const accountsById = Object.fromEntries(state.accounts.map((a) => [a.id, a]));
  const map = new Map();
  const trades = [...state.trades]
    .filter((t) => t.date <= asOf && inFilter(accountIds, t.accountId))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const t of trades) {
    const key = `${t.accountId}|${t.instrumentId}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        accountId: t.accountId,
        instrumentId: t.instrumentId,
        instrument: instrumentsById[t.instrumentId],
        quantity: 0,
        costPLN: 0,
        realizedPLN: 0,
        feesPLN: 0,
      });
    }
    const h = map.get(key);
    const qty = Number(t.quantity) || 0;
    const amt = tradeAmounts(t, accountsById[t.accountId], instrumentsById[t.instrumentId]);
    h.feesPLN += amt.fee + amt.fxFee;
    h.fxFeesPLN = (h.fxFeesPLN || 0) + amt.fxFee;
    if (t.side === 'BUY') {
      h.quantity += qty;
      h.costPLN += amt.buyCost;
    } else if (t.side === 'SELL' && h.quantity > 0) {
      const sellQty = Math.min(qty, h.quantity);
      const avg = h.costPLN / h.quantity;
      const costOut = avg * sellQty;
      h.realizedPLN += amt.sellProceeds - costOut;
      h.quantity -= sellQty;
      h.costPLN -= costOut;
      if (h.quantity < 1e-9) {
        h.quantity = 0;
        h.costPLN = 0;
      }
    }
  }
  return [...map.values()];
}

// Saldo gotówki na koncie: wpłaty − wypłaty − kupno + sprzedaż + przychody netto − zakup obligacji
export function computeCashBalances(state, asOf, accountIds, incomeEvents) {
  const balances = {};
  const add = (accId, v) => {
    if (!inFilter(accountIds, accId)) return;
    balances[accId] = (balances[accId] || 0) + v;
  };
  for (const a of state.accounts) if (inFilter(accountIds, a.id)) balances[a.id] = 0;
  for (const c of state.cashflows) {
    if (c.date > asOf) continue;
    const amt = Number(c.amount) || 0;
    add(c.accountId, c.type === 'DEPOSIT' ? amt : -amt);
  }
  for (const t of state.trades) {
    if (t.date > asOf) continue;
    add(t.accountId, tradeCashDelta(state, t));
  }
  for (const i of incomeEvents) {
    if (i.date > asOf) continue;
    add(i.accountId, i.net);
  }
  for (const b of state.bonds) {
    if (b.purchaseDate > asOf) continue;
    add(b.accountId, -(Number(b.quantity) || 0) * 100);
  }
  return balances;
}

// Zakup obligacji bez wcześniejszej wpłaty nie może zostawiać ujemnej gotówki na koncie obligacyjnym/maklerskim:
// brakująca kwota staje się automatyczną wpłatą „Środki na zakup obligacji” (id `bondfund_<id obligacji>`).
// Wpłaty liczone od nowa przy każdej zmianie – gdy użytkownik sam wpłaci środki, automatyczna wpłata znika.
// IKE/IKZE pomijane (wpłaty wliczałyby się do limitu) – tam obowiązuje ręczna wpłata.
export const BOND_FUNDING_PREFIX = 'bondfund_';

export function bondFundingCashflows(state, today = isoDay(new Date())) {
  const eligible = new Set(state.accounts.filter((a) => !ACCOUNT_TYPES[a.type]?.hasLimit && a.type !== 'SAVINGS').map((a) => a.id));
  const bonds = state.bonds
    .filter((b) => eligible.has(b.accountId) && b.purchaseDate)
    .sort((a, b) => (a.purchaseDate < b.purchaseDate ? -1 : a.purchaseDate > b.purchaseDate ? 1 : String(a.id) < String(b.id) ? -1 : 1));
  if (bonds.length === 0) return [];
  const income = [...incomeEventsWithTax(state), ...bondIncomeEvents(state, today)];
  let working = { ...state, cashflows: state.cashflows.filter((c) => !String(c.id).startsWith(BOND_FUNDING_PREFIX)) };
  const out = [];
  for (const b of bonds) {
    const balance = computeCashBalances(working, b.purchaseDate, [b.accountId], income)[b.accountId] || 0;
    if (balance >= -0.005) continue;
    const cf = {
      id: `${BOND_FUNDING_PREFIX}${b.id}`,
      accountId: b.accountId,
      date: b.purchaseDate,
      type: 'DEPOSIT',
      amount: Math.round(-balance * 100) / 100,
      note: `Środki na zakup obligacji ${b.series || b.type || ''} (automatycznie)`.replace('  ', ' '),
      source: 'AUTO_BOND',
    };
    out.push(cf);
    working = { ...working, cashflows: [...working.cashflows, cf] };
  }
  return out;
}

// Wycena kont na dzień `asOf` przy zadanej funkcji cen (instrument -> cena PLN)
export function valuePortfolio(state, { asOf, accountIds, priceLookup }) {
  const day = asOf || isoDay(new Date());
  const accountsById = Object.fromEntries(state.accounts.map((a) => [a.id, a]));
  const income = [...incomeEventsWithTax(state), ...bondIncomeEvents(state, day)];
  const holdings = computeHoldings(state, day, accountIds).filter((h) => h.quantity > 0);
  const cash = computeCashBalances(state, day, accountIds, income);

  const positions = holdings.map((h) => {
    const unit = h.instrument ? priceLookup(h.instrument) : null;
    const pricePLN = Number.isFinite(unit) ? unit : h.costPLN / h.quantity;
    const value = pricePLN * h.quantity;
    return {
      ...h,
      account: accountsById[h.accountId],
      pricePLN,
      value,
      unrealizedPLN: value - h.costPLN,
      priceMissing: !Number.isFinite(unit),
    };
  });

  const cpi = getCpiTable(state.settings);
  const bonds = state.bonds
    .filter((b) => inFilter(accountIds, b.accountId) && b.purchaseDate <= day)
    .map((b) => {
      const acc = accountsById[b.accountId];
      const v = valueBond(b, day, bondBelkaRate(b, acc), cpi);
      return { ...b, account: acc, valuation: v, value: v.netValue };
    });

  const byAccount = {};
  for (const a of state.accounts) {
    if (!inFilter(accountIds, a.id)) continue;
    byAccount[a.id] = { stocks: 0, etf: 0, bonds: 0, cash: cash[a.id] || 0, total: 0 };
  }
  for (const p of positions) {
    const slot = byAccount[p.accountId];
    if (!slot) continue;
    if (p.instrument?.kind === 'ETF') slot.etf += p.value;
    else slot.stocks += p.value;
  }
  for (const b of bonds) {
    const slot = byAccount[b.accountId];
    if (slot) slot.bonds += b.value;
  }
  let stocks = 0;
  let etf = 0;
  let bondsTotal = 0;
  let cashTotal = 0;
  for (const s of Object.values(byAccount)) {
    s.total = s.stocks + s.etf + s.bonds + s.cash;
    stocks += s.stocks;
    etf += s.etf;
    bondsTotal += s.bonds;
    cashTotal += s.cash;
  }
  const savingsCash = Object.entries(byAccount)
    .filter(([id]) => accountsById[id]?.type === 'SAVINGS')
    .reduce((s, [, v]) => s + v.cash, 0);

  return {
    asOf: day,
    positions,
    bonds,
    byAccount,
    income,
    totals: {
      stocks,
      etf,
      bonds: bondsTotal,
      cash: cashTotal,
      savingsCash,
      brokerCash: cashTotal - savingsCash,
      market: stocks + etf,
      safe: bondsTotal + cashTotal,
      total: stocks + etf + bondsTotal + cashTotal,
    },
  };
}

export function otherAssetsValue(state) {
  const items = state.otherAssets || [];
  const included = items.filter((a) => a.includeInNetWorth);
  const sum = (arr) => arr.reduce((s, a) => s + (Number(a.value) || 0) - (Number(a.liabilities) || 0), 0);
  return {
    items,
    includedValue: state.settings.includeOtherAssets ? sum(included) : 0,
    totalValue: sum(items),
    globallyEnabled: !!state.settings.includeOtherAssets,
  };
}

// Suma przepływów (wpłaty − wypłaty) w przedziale (from, to]
export function netFlows(state, accountIds, from, to) {
  return state.cashflows
    .filter((c) => inFilter(accountIds, c.accountId) && (!from || c.date > from) && c.date <= to)
    .reduce((s, c) => s + (c.type === 'DEPOSIT' ? 1 : -1) * (Number(c.amount) || 0), 0);
}

function flowsList(state, accountIds, from, to) {
  return state.cashflows
    .filter((c) => inFilter(accountIds, c.accountId) && (!from || c.date > from) && c.date <= to)
    .map((c) => ({ date: c.date, amount: (c.type === 'DEPOSIT' ? 1 : -1) * (Number(c.amount) || 0) }));
}

// Wartość z migawki dla zbioru kont; null, jeśli brak migawki <= date
export function snapshotValueAt(state, accountIds, date) {
  const snaps = state.snapshots;
  let found = null;
  for (let i = snaps.length - 1; i >= 0; i -= 1) {
    if (snaps[i].date <= date) {
      found = snaps[i];
      break;
    }
  }
  if (!found) return null;
  let v = 0;
  for (const id of accountIds) v += found.accounts?.[id]?.value || 0;
  return { date: found.date, value: v };
}

export function periodStartDate(period, today = new Date()) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (period === 'YTD') return isoDay(new Date(t.getFullYear() - 1, 11, 31));
  if (period === '1M') return isoDay(new Date(t.getFullYear(), t.getMonth() - 1, t.getDate()));
  return null;
}

// Modified Dietz dla jednego segmentu
function modifiedDietz(startValue, endValue, flows, startDate, endDate) {
  const total = Math.max(1, daysBetween(startDate, endDate));
  let weighted = 0;
  let net = 0;
  for (const f of flows) {
    const w = Math.max(0, Math.min(1, daysBetween(f.date, endDate) / total));
    weighted += f.amount * w;
    net += f.amount;
  }
  const denom = startValue + weighted;
  if (Math.abs(denom) < 1e-6) return 0;
  return (endValue - startValue - net) / denom;
}

// TWR łańcuchowy na podstawie migawek (segmenty liczone metodą Modified Dietz)
export function computeTWR(state, accountIds, fromDate, toDate, endValue) {
  const points = state.snapshots
    .filter((s) => (!fromDate || s.date >= fromDate) && s.date < toDate)
    .map((s) => ({
      date: s.date,
      value: accountIds.reduce((acc, id) => acc + (s.accounts?.[id]?.value || 0), 0),
    }));
  const series = [];
  if (fromDate) {
    const start = snapshotValueAt(state, accountIds, fromDate);
    series.push({ date: fromDate, value: start ? start.value : 0 });
  } else {
    const firstFlow = state.cashflows
      .filter((c) => accountIds.includes(c.accountId))
      .reduce((m, c) => (!m || c.date < m ? c.date : m), null);
    if (!firstFlow) return { twr: 0, days: 0, startDate: toDate };
    const dayBefore = isoDay(new Date(new Date(firstFlow).getTime() - DAY));
    series.push({ date: dayBefore, value: 0 });
  }
  for (const p of points) if (p.date > series[0].date) series.push(p);
  series.push({ date: toDate, value: endValue });

  let growth = 1;
  for (let i = 1; i < series.length; i += 1) {
    const a = series[i - 1];
    const b = series[i];
    const flows = flowsList(state, accountIds, a.date, b.date);
    if (a.value <= 0 && flows.length === 0) continue;
    const r = modifiedDietz(a.value, b.value, flows, a.date, b.date);
    if (Number.isFinite(r)) growth *= 1 + r;
  }
  return { twr: growth - 1, days: daysBetween(series[0].date, toDate), startDate: series[0].date };
}

// Statystyki „Prawdziwy Zysk” dla okresu i filtra kont
export function computePeriodStats(state, { period = 'ALL', filter = 'ALL', today = new Date() } = {}) {
  const accountIds = resolveAccountIds(state, filter);
  const todayIso = isoDay(today);
  const priceLookup = livePriceLookup(state);
  const now = valuePortfolio(state, { asOf: todayIso, accountIds, priceLookup });
  const endValue = now.totals.total;
  const startDate = periodStartDate(period, today);

  let startValue = 0;
  let startValueSource = 'none';
  if (startDate) {
    const snap = snapshotValueAt(state, accountIds, startDate);
    if (snap) {
      startValue = snap.value;
      startValueSource = 'snapshot';
    } else {
      startValue = netFlows(state, accountIds, null, startDate);
      startValueSource = 'contributions';
    }
  }

  const flowsInPeriod = netFlows(state, accountIds, startDate, todayIso);
  const contributionsAll = netFlows(state, accountIds, null, todayIso);
  const depositsInPeriod = state.cashflows
    .filter((c) => accountIds.includes(c.accountId) && c.type === 'DEPOSIT' && (!startDate || c.date > startDate) && c.date <= todayIso)
    .reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const withdrawalsInPeriod = depositsInPeriod - flowsInPeriod;

  const totalReturn = endValue - startValue - flowsInPeriod;

  const inPeriod = (d) => (!startDate || d > startDate) && d <= todayIso;
  const periodIncome = now.income.filter((i) => accountIds.includes(i.accountId) && inPeriod(i.date));
  const dividendsNet = periodIncome.filter((i) => i.type === 'DIVIDEND').reduce((s, i) => s + i.net, 0);
  const dividendsTax = periodIncome.filter((i) => i.type === 'DIVIDEND').reduce((s, i) => s + i.tax, 0);
  const interestCashNet = periodIncome.filter((i) => i.type === 'INTEREST').reduce((s, i) => s + i.net, 0);
  const interestTax = periodIncome.filter((i) => i.type === 'INTEREST').reduce((s, i) => s + i.tax, 0);

  // Odsetki naliczone (skapitalizowane) w obligacjach w okresie
  const accountsById = Object.fromEntries(state.accounts.map((a) => [a.id, a]));
  let bondAccrualDelta = 0;
  const cpi = getCpiTable(state.settings);
  for (const b of state.bonds) {
    if (!accountIds.includes(b.accountId)) continue;
    const rate = bondBelkaRate(b, accountsById[b.accountId]);
    const endAcc = valueBond(b, todayIso, rate, cpi).accruedNet;
    const startAcc = startDate && b.purchaseDate <= startDate ? valueBond(b, startDate, rate, cpi).accruedNet : 0;
    bondAccrualDelta += endAcc - startAcc;
  }
  const interestNet = interestCashNet + bondAccrualDelta;
  const priceGain = totalReturn - dividendsNet - interestNet;

  const mdReturn = modifiedDietz(startValue, endValue, flowsList(state, accountIds, startDate, todayIso), startDate || firstFlowDate(state, accountIds) || todayIso, todayIso);
  const twr = computeTWR(state, accountIds, startDate, todayIso, endValue);
  const full = startDate ? computeTWR(state, accountIds, null, todayIso, endValue) : twr;
  const years = full.days / 365.25;
  const cagr = years >= 1 ? Math.pow(1 + full.twr, 1 / years) - 1 : full.twr;

  // Ważony TER (akcje mają TER = 0)
  const marketValue = now.totals.market;
  const terWeighted =
    marketValue > 0
      ? now.positions.reduce((s, p) => s + p.value * ((Number(p.instrument?.ter) || 0) / 100), 0) / marketValue
      : 0;
  const etfValue = now.totals.etf;
  const terEtfOnly =
    etfValue > 0
      ? now.positions
          .filter((p) => p.instrument?.kind === 'ETF')
          .reduce((s, p) => s + p.value * ((Number(p.instrument?.ter) || 0) / 100), 0) / etfValue
      : 0;

  return {
    period,
    filter,
    accountIds,
    startDate,
    startValue,
    startValueSource,
    endValue,
    flowsInPeriod,
    depositsInPeriod,
    withdrawalsInPeriod,
    contributionsAll,
    totalReturn,
    totalReturnPct: mdReturn,
    priceGain,
    dividendsNet,
    dividendsTax,
    interestNet,
    interestCashNet,
    bondAccrualDelta,
    interestTax,
    twr: twr.twr,
    cagr,
    cagrYears: years,
    terWeighted,
    terEtfOnly,
    terAnnualCost: terWeighted * marketValue,
    valuation: now,
  };
}

function firstFlowDate(state, accountIds) {
  return state.cashflows
    .filter((c) => accountIds.includes(c.accountId))
    .reduce((m, c) => (!m || c.date < m ? c.date : m), null);
}

// Wykorzystanie rocznych limitów IKE/IKZE
export function computeLimitUsage(state, year = new Date().getFullYear()) {
  return state.accounts
    .filter((a) => ACCOUNT_TYPES[a.type]?.hasLimit)
    .map((a) => {
      const limit = limitForAccount(a, state.settings, year);
      const deposited = state.cashflows
        .filter((c) => c.accountId === a.id && c.type === 'DEPOSIT' && c.date.startsWith(String(year)))
        .reduce((s, c) => s + (Number(c.amount) || 0), 0);
      return {
        account: a,
        year,
        limit,
        deposited,
        remaining: Math.max(0, limit - deposited),
        usage: limit > 0 ? deposited / limit : 0,
        exceeded: limit > 0 && deposited > limit,
      };
    });
}

// Migawka bieżącej wyceny wszystkich kont (do historii, TWR i wykresów)
export function buildSnapshot(state, asOf, priceLookup) {
  const v = valuePortfolio(state, { asOf, accountIds: null, priceLookup });
  const accounts = {};
  for (const [id, s] of Object.entries(v.byAccount)) {
    accounts[id] = {
      value: Math.round(s.total * 100) / 100,
      contrib: Math.round(netFlows(state, [id], null, asOf) * 100) / 100,
    };
  }
  // Etap 5: ceny instrumentów z dnia migawki (PLN) – historia cen do raportów okresowych
  const prices = {};
  for (const pos of v.positions) {
    if (!pos.priceMissing && Number.isFinite(pos.pricePLN)) prices[pos.instrumentId] = Math.round(pos.pricePLN * 10000) / 10000;
  }
  return { date: asOf, accounts, prices };
}
