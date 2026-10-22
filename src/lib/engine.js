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

// Poduszka finansowa = konta oszczędnościowe i konta obligacji skarbowych; reszta to portfel inwestycyjny
export function isSafeAccount(account) {
  return account?.type === 'SAVINGS' || account?.type === 'BONDS';
}

// Odsetki w statystykach: wyłącznie obligacje i konto oszczędnościowe (poduszka). Odsetki od wolnych środków
// na kontach inwestycyjnych (np. „Free funds interest” w XTB) zostają w gotówce konta, ale nie są liczone jako odsetki.
export function safeInterestFilter(state) {
  const safe = new Set(state.accounts.filter(isSafeAccount).map((a) => a.id));
  return (i) => i.type === 'INTEREST' && safe.has(i.accountId);
}

// Konto oszczędnościowe: każda zmiana salda (dopłata, przelew wewnętrzny, spadek salda) to transfer w obrębie
// oszczędności – nigdy wypłata. Do wpłat trafia saldo netto takich zmian, a wypłaty liczone są tylko z kont inwestycyjnych.
export function depositsWithdrawals(state, cashflows) {
  const savings = new Set(state.accounts.filter((a) => a.type === 'SAVINGS').map((a) => a.id));
  let deposits = 0;
  let withdrawals = 0;
  for (const c of cashflows) {
    const amt = Number(c.amount) || 0;
    if (savings.has(c.accountId)) deposits += c.type === 'DEPOSIT' ? amt : -amt;
    else if (c.type === 'DEPOSIT') deposits += amt;
    else withdrawals += amt;
  }
  return { deposits, withdrawals };
}

export function resolveAccountIds(state, filter) {
  if (!filter || filter === 'ALL') return state.accounts.map((a) => a.id);
  if (filter === 'INVEST') return state.accounts.filter((a) => !isSafeAccount(a)).map((a) => a.id);
  if (filter === 'SAFE') return state.accounts.filter((a) => isSafeAccount(a)).map((a) => a.id);
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
      // Sprzedaż konkretnej transzy (import zamkniętych pozycji XTB): koszt tej transzy zamiast średniej
      const lotCost = Number(t.costBasisPLN);
      const costOut = Number.isFinite(lotCost) && lotCost >= 0 ? Math.min(h.costPLN, lotCost * (sellQty / (qty || 1))) : avg * sellQty;
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

// Gotówka na rachunkach nigdy nie spada poniżej zera: gdy zakup (akcje, ETF, obligacje) lub inna operacja
// wydaje więcej, niż jest na koncie, brakująca kwota staje się automatyczną wpłatą „Uzupełnienie środków”
// (id `autofund_…`, źródło AUTO_FUND). Liczone od nowa przy każdej zmianie danych: wcześniejsza ręczna wpłata
// pokrywająca zakup sprawia, że automatyczna znika. Konta debetowe (allowNegativeCash) i oszczędnościowe pomijane.
export const AUTO_FUND_PREFIX = 'autofund_';
const LEGACY_FUND_PREFIX = 'bondfund_';

export function isAutoFunding(c) {
  const id = String(c?.id || '');
  return id.startsWith(AUTO_FUND_PREFIX) || id.startsWith(LEGACY_FUND_PREFIX);
}

export function autoFundingCashflows(state, today = isoDay(new Date())) {
  const eligible = state.accounts.filter((a) => a.type !== 'SAVINGS' && !a.allowNegativeCash);
  if (eligible.length === 0) return [];
  const ids = new Set(eligible.map((a) => a.id));
  const instrumentsById = Object.fromEntries(state.instruments.map((i) => [i.id, i]));
  const accountsById = Object.fromEntries(state.accounts.map((a) => [a.id, a]));
  const events = {};
  const push = (accountId, ev) => {
    if (!ids.has(accountId) || !ev.date || ev.date > today) return;
    (events[accountId] ||= []).push(ev);
  };
  for (const c of state.cashflows) {
    if (isAutoFunding(c)) continue;
    const amt = Number(c.amount) || 0;
    push(c.accountId, { date: c.date, delta: c.type === 'DEPOSIT' ? amt : -amt, key: `cf_${c.id}`, label: c.note || 'wypłata' });
  }
  for (const t of state.trades) {
    const a = tradeAmounts(t, accountsById[t.accountId], instrumentsById[t.instrumentId]);
    const ticker = instrumentsById[t.instrumentId]?.ticker || '';
    push(t.accountId, { date: t.date, delta: t.side === 'BUY' ? -a.buyCost : a.sellProceeds, key: `tr_${t.id}`, label: `${t.side === 'BUY' ? 'zakup' : 'sprzedaż'} ${ticker}` });
  }
  for (const i of [...incomeEventsWithTax(state), ...bondIncomeEvents(state, today)]) {
    push(i.accountId, { date: i.date, delta: Number(i.net) || 0, key: `in_${i.id}`, label: 'dochód' });
  }
  for (const b of state.bonds) {
    push(b.accountId, { date: b.purchaseDate, delta: -(Number(b.quantity) || 0) * 100, key: `bd_${b.id}`, label: `zakup obligacji ${b.series || b.type || ''}`.trim() });
  }
  const out = [];
  for (const [accountId, list] of Object.entries(events)) {
    // W obrębie dnia najpierw wpływy, potem wydatki – wpłata z tego samego dnia pokrywa zakup
    list.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : y.delta - x.delta));
    let balance = 0;
    for (const ev of list) {
      balance += ev.delta;
      if (balance < -0.004) {
        // Zaokrąglenie w górę do grosza – suma drobnych niedoborów nie daje ujemnego salda (np. −0,02 zł)
        const amount = Math.max(0.01, Math.ceil(Math.round(-balance * 1e6) / 1e4) / 100);
        if (amount > 0) {
          out.push({
            id: `${AUTO_FUND_PREFIX}${accountId}_${ev.key}`,
            accountId,
            date: ev.date,
            type: 'DEPOSIT',
            amount,
            note: `Uzupełnienie środków (automatycznie): ${ev.label}`,
            source: 'AUTO_FUND',
          });
        }
        balance += amount;
      }
    }
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

// Nieruchomości i ruchomości zawsze wliczają się do Majątku Całkowitego (wartość − zobowiązania).
// Przełączniki decydują tylko o widoczności w zakładce Portfel (showInPortfolio + ustawienie globalne).
export function otherAssetsValue(state) {
  const items = state.otherAssets || [];
  const sum = (arr) => arr.reduce((s, a) => s + (Number(a.value) || 0) - (Number(a.liabilities) || 0), 0);
  const total = sum(items);
  return {
    items,
    includedValue: total,
    totalValue: total,
    portfolioItems: state.settings.includeOtherAssets === false ? [] : items.filter((a) => a.showInPortfolio !== false),
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
export function snapshotValueAt(state, accountIds, date, maxAgeDays = Infinity) {
  const snaps = state.snapshots;
  let found = null;
  for (let i = snaps.length - 1; i >= 0; i -= 1) {
    if (snaps[i].date <= date) {
      found = snaps[i];
      break;
    }
  }
  if (!found || daysBetween(found.date, date) > maxAgeDays) return null;
  let v = 0;
  for (const id of accountIds) v += found.accounts?.[id]?.value || 0;
  return { date: found.date, value: v };
}

export function periodStartDate(period, today = new Date()) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (period === 'YTD') return isoDay(new Date(t.getFullYear() - 1, 11, 31));
  if (period === '1M') return isoDay(new Date(t.getFullYear(), t.getMonth() - 1, t.getDate()));
  if (period === '1W') return isoDay(new Date(t.getFullYear(), t.getMonth(), t.getDate() - 7));
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
// Wartość kont na dzień: świeża migawka (≤ 3 dni), a bez niej wycena pozycji cenami historycznymi (priceAt)
function makeValueAt(state, accountIds, priceAt) {
  const cache = new Map();
  return (date) => {
    if (cache.has(date)) return cache.get(date);
    const snap = snapshotValueAt(state, accountIds, date, 3);
    let value = null;
    if (snap) value = snap.value;
    else if (priceAt) value = valuePortfolio(state, { asOf: date, accountIds, priceLookup: (inst) => priceAt(inst, date) }).totals.total;
    cache.set(date, value);
    return value;
  };
}

function monthEnds(from, to) {
  const out = [];
  const [y, m] = from.split('-').map(Number);
  let d = new Date(y, m, 0);
  while (isoDay(d) < to) {
    if (isoDay(d) > from) out.push(isoDay(d));
    d = new Date(d.getFullYear(), d.getMonth() + 2, 0);
  }
  return out;
}

// TWR: łańcuch miesięcznych stóp (Modified Dietz w obrębie miesiąca) na wycenach z migawek lub z cen historycznych.
// Okresy bez kapitału (wartość ≈ 0) są pomijane, a pojedyncze skrajne stopy przy znikomym kapitale nie zawyżają wyniku.
export function computeTWR(state, accountIds, fromDate, toDate, endValue, priceAt) {
  const valueAt = makeValueAt(state, accountIds, priceAt);
  let start;
  if (fromDate) start = fromDate;
  else {
    const firstFlow = firstFlowDate(state, accountIds);
    if (!firstFlow) return { twr: 0, days: 0, startDate: toDate };
    start = isoDay(new Date(new Date(firstFlow).getTime() - DAY));
  }
  const series = [{ date: start, value: fromDate ? valueAt(start) ?? 0 : 0 }];
  for (const d of monthEnds(start, toDate)) {
    const v = valueAt(d);
    if (v !== null) series.push({ date: d, value: v });
  }
  series.push({ date: toDate, value: endValue });

  let growth = 1;
  for (let i = 1; i < series.length; i += 1) {
    const a = series[i - 1];
    const b = series[i];
    const flows = flowsList(state, accountIds, a.date, b.date);
    const inflow = flows.reduce((s, f) => s + Math.max(0, f.amount), 0);
    // Znikomy kapitał (np. kilka złotych przed pierwszą dużą wpłatą) – stopa byłaby losowa
    if (a.value + inflow < 1) continue;
    const r = modifiedDietz(a.value, b.value, flows, a.date, b.date);
    if (Number.isFinite(r) && r > -1) growth *= 1 + r;
  }
  return { twr: growth - 1, days: daysBetween(series[0].date, toDate), startDate: series[0].date };
}

// Statystyki „Prawdziwy Zysk” dla okresu i filtra kont
// priceAt(instrument, data) – ceny historyczne (createPriceResolver(state).instrumentPLN); bez nich wycena tylko z migawek
// accountIdsOverride – dowolny zestaw kont (np. wybór w raporcie na X) zamiast filtra
export function computePeriodStats(state, { period = 'ALL', filter = 'ALL', today = new Date(), priceAt = null, accountIds: accountIdsOverride = null } = {}) {
  const accountIds = accountIdsOverride || resolveAccountIds(state, filter);
  const todayIso = isoDay(today);
  const priceLookup = livePriceLookup(state);
  const now = valuePortfolio(state, { asOf: todayIso, accountIds, priceLookup });
  const endValue = now.totals.total;
  const startDate = periodStartDate(period, today);

  let startValue = 0;
  let startValueSource = 'none';
  if (startDate) {
    const snap = snapshotValueAt(state, accountIds, startDate, 3);
    if (snap) {
      startValue = snap.value;
      startValueSource = 'snapshot';
    } else if (priceAt) {
      startValue = valuePortfolio(state, { asOf: startDate, accountIds, priceLookup: (inst) => priceAt(inst, startDate) }).totals.total;
      startValueSource = 'revaluation';
    } else {
      startValue = netFlows(state, accountIds, null, startDate);
      startValueSource = 'contributions';
    }
  }

  const flowsInPeriod = netFlows(state, accountIds, startDate, todayIso);
  const contributionsAll = netFlows(state, accountIds, null, todayIso);
  const { deposits: depositsInPeriod, withdrawals: withdrawalsInPeriod } = depositsWithdrawals(
    state,
    state.cashflows.filter((c) => accountIds.includes(c.accountId) && (!startDate || c.date > startDate) && c.date <= todayIso),
  );

  const totalReturn = endValue - startValue - flowsInPeriod;

  const inPeriod = (d) => (!startDate || d > startDate) && d <= todayIso;
  const periodIncome = now.income.filter((i) => accountIds.includes(i.accountId) && inPeriod(i.date));
  const dividendsNet = periodIncome.filter((i) => i.type === 'DIVIDEND').reduce((s, i) => s + i.net, 0);
  const dividendsTax = periodIncome.filter((i) => i.type === 'DIVIDEND').reduce((s, i) => s + i.tax, 0);
  const isInterest = safeInterestFilter(state);
  const interestCashNet = periodIncome.filter(isInterest).reduce((s, i) => s + i.net, 0);
  const interestTax = periodIncome.filter(isInterest).reduce((s, i) => s + i.tax, 0);

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
  // Prosta stopa zwrotu: (wartość + wypłaty − wpłaty) / kapitał zaangażowany (wartość na start + wpłaty w okresie).
  // Dywidendy i odsetki są już w wartości (gotówka na koncie), więc nie są doliczane drugi raz.
  const capitalEngaged = startValue + depositsInPeriod;
  const simpleReturn = capitalEngaged > 0 ? totalReturn / capitalEngaged : 0;
  const twr = computeTWR(state, accountIds, startDate, todayIso, endValue, priceAt);
  const full = startDate ? computeTWR(state, accountIds, null, todayIso, endValue, priceAt) : twr;
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
    totalReturnPct: simpleReturn,
    capitalEngaged,
    mwr: mdReturn,
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
// Wpłaty techniczne (automatyczne uzupełnienie środków, wpłaty na pokrycie zakupów z importu otwartych pozycji)
const SYNTHETIC_SOURCES = new Set(['AUTO_FUND', 'AUTO_BOND', 'XTB_OPEN']);
export function isSyntheticDeposit(c) {
  return SYNTHETIC_SOURCES.has(c?.source) || isAutoFunding(c);
}

// Wpłaty wliczane do rocznego limitu IKE/IKZE w danym roku kalendarzowym – wyłącznie faktyczne wpłaty:
// gdy konto ma wpłaty z pliku XTB (np. „IKE deposit” z arkusza Cash Operations) – liczą się tylko one;
// bez importu – wpłaty wpisane ręcznie. Wpłaty techniczne (pokrycie zakupów, import otwartych pozycji)
// i rotacja kapitału (sprzedaż → zakup) nigdy nie zużywają limitu.
export function limitDeposits(state, accountId, year, { excludeId = null } = {}) {
  const y = String(year);
  const list = state.cashflows.filter((c) => c.accountId === accountId && c.type === 'DEPOSIT' && c.date.startsWith(y) && c.id !== excludeId && !isSyntheticDeposit(c));
  const fromFile = list.filter((c) => c.source === 'XTB');
  const sum = (fromFile.length ? fromFile : list).reduce((s, c) => s + (Number(c.amount) || 0), 0);
  return Math.round(sum * 100) / 100;
}

// Źródło kwoty limitu (do podpowiedzi w interfejsie): 'FILE' – wpłaty z importu XTB, 'MANUAL' – ręczne,
// 'NONE' – brak faktycznych wpłat (np. import samych otwartych pozycji z wpłatami technicznymi)
export function limitDepositsSource(state, accountId, year) {
  const y = String(year);
  const list = state.cashflows.filter((c) => c.accountId === accountId && c.type === 'DEPOSIT' && c.date.startsWith(y) && !isSyntheticDeposit(c));
  if (list.some((c) => c.source === 'XTB')) return 'FILE';
  return list.length ? 'MANUAL' : 'NONE';
}

export function computeLimitUsage(state, year = new Date().getFullYear()) {
  return state.accounts
    .filter((a) => ACCOUNT_TYPES[a.type]?.hasLimit)
    .map((a) => {
      const limit = limitForAccount(a, state.settings, year);
      const deposited = limitDeposits(state, a.id, year);
      return {
        account: a,
        year,
        limit,
        deposited,
        source: limitDepositsSource(state, a.id, year),
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
