// Etap 3: szeregi czasowe dla Centrum Wykresów – wycena historyczna wybranego wycinka portfela,
// wkład własny, rozbicie zysku, TWR, drawdown, benchmarki oraz dywidendy miesięczne/roczne.
import { benchmarkLabel } from './constants.js';
import { isoDay, netFlows, resolveAccountIds, tradeCashDelta, valuePortfolio } from './engine.js';

const DAY = 86400000;

function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDay(new Date(y, m - 1, d + n));
}

function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY);
}

export const RANGE_PRESETS = [
  { value: '1M', label: '1M' },
  { value: 'YTD', label: 'YTD' },
  { value: '1Y', label: '1 rok' },
  { value: 'MAX', label: 'Max' },
];

// Wybór kont/klas: konfiguracje szybkiego wyboru
export function defaultSelection() {
  return { accounts: 'ALL', kinds: { STOCK: true, ETF: true, BONDS: true, CASH: true }, instruments: [], compare: false };
}

// Konta wyboru: 'ALL', filtr tekstowy (jak w statystykach) lub tablica id kont
export function selectionAccountIds(state, selection) {
  if (Array.isArray(selection.accounts)) return selection.accounts.filter((id) => state.accounts.some((a) => a.id === id));
  if (!selection.accounts || selection.accounts === 'ALL') return state.accounts.map((a) => a.id);
  return resolveAccountIds(state, selection.accounts);
}

export function isFullSelection(sel) {
  return sel.kinds.STOCK && sel.kinds.ETF && sel.kinds.BONDS && sel.kinds.CASH && !sel.compare;
}

function firstActivityDate(state, accountIds) {
  const dates = [
    ...state.cashflows.filter((c) => accountIds.includes(c.accountId)).map((c) => c.date),
    ...state.trades.filter((t) => accountIds.includes(t.accountId)).map((t) => t.date),
  ];
  return dates.length ? dates.reduce((m, d) => (d < m ? d : m)) : isoDay(new Date());
}

export function resolveRange(state, range, accountIds, today = isoDay(new Date())) {
  // Etap 5: zakres jawny { start, end }
  if (range && typeof range === 'object') {
    const first = addDays(firstActivityDate(state, accountIds), -1);
    const end = range.end > today ? today : range.end;
    return { start: range.start < first ? first : range.start, end };
  }
  const [ty, tm, td] = today.split('-').map(Number);
  let start;
  let end = today;
  if (range === '1M') start = isoDay(new Date(ty, tm - 2, td));
  else if (range === 'YTD') start = `${ty - 1}-12-31`;
  else if (range === '1Y') start = isoDay(new Date(ty - 1, tm - 1, td));
  else if (/^Y\d{4}$/.test(range)) {
    const y = Number(range.slice(1));
    start = `${y - 1}-12-31`;
    end = `${y}-12-31` < today ? `${y}-12-31` : today;
  } else start = addDays(firstActivityDate(state, accountIds), -1);
  const first = addDays(firstActivityDate(state, accountIds), -1);
  if (start < first) start = first;
  return { start, end };
}

function buildGrid(start, end) {
  const span = daysBetween(start, end);
  const step = span <= 100 ? 1 : span <= 400 ? 3 : 7;
  const out = [];
  for (let d = start; d < end; d = addDays(d, step)) out.push(d);
  out.push(end);
  return out;
}

function instrumentMatches(sel, inst) {
  if (!inst) return false;
  if (sel.compare || sel.instruments.length > 0) return sel.instruments.includes(inst.id);
  return inst.kind === 'ETF' ? sel.kinds.ETF : sel.kinds.STOCK;
}

// Wartość i składowe wycinka portfela na dzień
function pointFor(state, sel, accountIds, date, resolver) {
  const v = valuePortfolio(state, { asOf: date, accountIds, priceLookup: (inst) => resolver.instrumentPLN(inst, date) });
  const instrumentMode = sel.instruments.length > 0;
  const useBonds = !instrumentMode && sel.kinds.BONDS;
  const useCash = !instrumentMode && sel.kinds.CASH;
  const anySecurities = instrumentMode || sel.kinds.STOCK || sel.kinds.ETF;

  const positions = v.positions.filter((p) => instrumentMatches(sel, p.instrument));
  const secValue = positions.reduce((s, p) => s + p.value, 0);
  const bondsValue = useBonds ? v.totals.bonds : 0;
  const cashValue = useCash ? v.totals.cash : 0;
  const value = secValue + bondsValue + cashValue;

  const instById = Object.fromEntries(state.instruments.map((i) => [i.id, i]));
  const inAcc = (x) => accountIds.includes(x.accountId) && x.date <= date;
  const tradeNet = (filterFn) =>
    state.trades.filter((t) => inAcc(t) && filterFn(instById[t.instrumentId])).reduce((s, t) => s - tradeCashDelta(state, t), 0);
  const income = v.income.filter(inAcc);
  const divNet = (filterFn) => income.filter((i) => i.type === 'DIVIDEND' && filterFn(instById[i.instrumentId])).reduce((s, i) => s + i.net, 0);
  const couponsNet = income.filter((i) => i.source === 'BOND').reduce((s, i) => s + i.net, 0);
  const otherInterestNet = income.filter((i) => i.type === 'INTEREST' && i.source !== 'BOND').reduce((s, i) => s + i.net, 0);
  const bondPurchases = state.bonds.filter((b) => accountIds.includes(b.accountId) && b.purchaseDate <= date).reduce((s, b) => s + (Number(b.quantity) || 0) * 100, 0);
  const bondAccrued = v.bonds.reduce((s, b) => s + b.valuation.accruedNet, 0);
  const flows = netFlows(state, accountIds, null, date);

  const matchSel = (inst) => instrumentMatches(sel, inst);
  const all = () => true;
  const secContrib = anySecurities ? tradeNet(matchSel) - divNet(matchSel) : 0;
  const bondsContrib = bondPurchases - couponsNet;
  const cashContrib = flows - (tradeNet(all) - divNet(all)) - bondsContrib;

  let contrib;
  if (isFullSelection(sel) && !instrumentMode) contrib = flows;
  else contrib = secContrib + (useBonds ? bondsContrib : 0) + (useCash ? cashContrib : 0);

  const dividends = anySecurities ? divNet(matchSel) : 0;
  const interest = (useBonds ? couponsNet + bondAccrued : 0) + (useCash ? otherInterestNet : 0);
  const profit = value - contrib;
  return {
    date,
    value,
    contrib,
    profit,
    dividends,
    interest,
    price: profit - dividends - interest,
    positions: positions.map((p) => ({ id: p.instrumentId, value: p.value, quantity: p.quantity })),
  };
}

/**
 * Główny generator szeregów.
 * Zwraca punkty z wartością, wkładem, zyskiem w okresie (PLN, rozbicie), indeksem TWR, drawdownem
 * oraz liniami benchmarków (% i „gdyby wpłaty szły w benchmark” w PLN).
 */
export function buildPortfolioSeries(state, { range, selection, benchmarks = [], resolver }) {
  const accountIds = selectionAccountIds(state, selection);
  const { start, end } = resolveRange(state, range, accountIds);
  // Cały wycinek kont (bez filtra klas/instrumentów): wartości z zapisanych migawek dziennych,
  // które odzwierciedlają rzeczywiste wyceny z dnia – o ile jest ich wystarczająco dużo w okresie.
  const full = isFullSelection(selection) && selection.instruments.length === 0;
  const snapsByDate = new Map(state.snapshots.map((sn) => [sn.date, sn]));
  const inRange = state.snapshots.filter((sn) => sn.date > start && sn.date < end).map((sn) => sn.date);
  const useSnaps = full && inRange.length >= daysBetween(start, end) / 10;
  const grid = useSnaps ? [start, ...inRange, end] : buildGrid(start, end);
  const raw = grid.map((d) => {
    const p = pointFor(state, selection, accountIds, d, resolver);
    const snap = full && d < end ? snapsByDate.get(d) : null;
    if (snap) {
      p.value = accountIds.reduce((acc, id) => acc + (snap.accounts?.[id]?.value || 0), 0);
      p.profit = p.value - p.contrib;
      p.price = p.profit - p.dividends - p.interest;
    }
    return p;
  });

  const base = raw[0];
  let twrIndex = 1;
  let peak = 1;
  const benchState = Object.fromEntries(benchmarks.map((id) => [id, { units: 0, start: resolver.benchmarkPLN(id, grid[0]) }]));
  const instStart = {};
  for (const inst of state.instruments) instStart[inst.id] = resolver.instrumentPLN(inst, grid[0]);

  let maxDrawdown = 0;
  const points = raw.map((p, i) => {
    if (i > 0) {
      const prev = raw[i - 1];
      const flow = p.contrib - prev.contrib;
      const denom = prev.value + 0.5 * flow;
      const r = denom > 1e-6 ? (p.value - prev.value - flow) / denom : 0;
      if (Number.isFinite(r) && r > -1) twrIndex *= 1 + r;
    }
    peak = Math.max(peak, twrIndex);
    const drawdown = twrIndex / peak - 1;
    maxDrawdown = Math.min(maxDrawdown, drawdown);
    const out = {
      date: p.date,
      value: p.value,
      contrib: p.contrib,
      profitTotal: p.profit,
      profit: p.profit - base.profit,
      profitPrice: p.price - base.price,
      profitDividends: p.dividends - base.dividends,
      profitInterest: p.interest - base.interest,
      twr: twrIndex - 1,
      drawdown,
    };
    // Benchmarki: % od początku okresu oraz symulacja tych samych przepływów (PLN)
    for (const id of benchmarks) {
      const b = benchState[id];
      const price = resolver.benchmarkPLN(id, p.date);
      if (!Number.isFinite(price) || !Number.isFinite(b.start) || b.start <= 0) continue;
      const flow = i === 0 ? p.value : p.contrib - raw[i - 1].contrib;
      b.units += flow / price;
      out[`b_${id}_pct`] = price / b.start - 1;
      out[`b_${id}_value`] = b.units * price;
      b.peak = Math.max(b.peak || 0, price);
      out[`b_${id}_dd`] = price / b.peak - 1;
    }
    // Porównanie instrumentów: zmiana ceny %, wartość pozycji i drawdown ceny
    if (selection.instruments.length > 0) {
      for (const id of selection.instruments) {
        const inst = state.instruments.find((x) => x.id === id);
        const price = resolver.instrumentPLN(inst, p.date);
        const s = instStart[id];
        if (Number.isFinite(price) && Number.isFinite(s) && s > 0) {
          out[`i_${id}_pct`] = price / s - 1;
          instStart[`${id}_peak`] = Math.max(instStart[`${id}_peak`] || 0, price);
          out[`i_${id}_dd`] = price / instStart[`${id}_peak`] - 1;
        }
        out[`i_${id}_value`] = p.positions.filter((x) => x.id === id).reduce((acc, x) => acc + x.value, 0);
      }
    }
    return out;
  });

  const last = points[points.length - 1];
  const years = daysBetween(start, end) / 365.25;
  return {
    start,
    end,
    accountIds,
    valueSource: useSnaps ? 'snapshots' : 'revaluation',
    points,
    summary: {
      value: last.value,
      contrib: last.contrib,
      profit: last.profit,
      profitPrice: last.profitPrice,
      profitDividends: last.profitDividends,
      profitInterest: last.profitInterest,
      twr: last.twr,
      annualized: years >= 1 ? Math.pow(1 + last.twr, 1 / years) - 1 : null,
      maxDrawdown,
      currentDrawdown: last.drawdown,
      benchmarks: Object.fromEntries(benchmarks.map((id) => [id, { pct: last[`b_${id}_pct`], value: last[`b_${id}_value`], label: benchmarkLabel(state.settings, id) }])),
    },
  };
}

// Dywidendy z rejestru przychodów dla wyboru (konta + instrumenty/klasy)
export function dividendEvents(state, selection, { net = true } = {}) {
  const accountIds = selectionAccountIds(state, selection);
  const instById = Object.fromEntries(state.instruments.map((i) => [i.id, i]));
  const v = valuePortfolio(state, { asOf: isoDay(new Date()), accountIds, priceLookup: () => null });
  return v.income
    .filter((i) => i.type === 'DIVIDEND' && accountIds.includes(i.accountId))
    .filter((i) => {
      const inst = instById[i.instrumentId];
      if (!inst) return selection.instruments.length === 0 && (selection.kinds.STOCK || selection.kinds.ETF);
      return instrumentMatches(selection, inst);
    })
    .map((i) => ({ date: i.date, amount: net ? i.net : Number(i.gross) || 0, instrumentId: i.instrumentId, accountId: i.accountId }));
}

const MONTHS = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];

export function dividendsByMonth(events, year) {
  const rows = MONTHS.map((m, i) => ({ month: m, idx: i, current: 0, previous: 0 }));
  for (const e of events) {
    const y = Number(e.date.slice(0, 4));
    const m = Number(e.date.slice(5, 7)) - 1;
    if (y === year) rows[m].current += e.amount;
    else if (y === year - 1) rows[m].previous += e.amount;
  }
  return rows;
}

export function dividendsByYear(events, today = new Date()) {
  const map = new Map();
  for (const e of events) {
    const y = Number(e.date.slice(0, 4));
    map.set(y, (map.get(y) || 0) + e.amount);
  }
  const years = [...map.keys()].sort();
  if (!years.length) return [];
  const out = [];
  for (let y = years[0]; y <= Math.max(years[years.length - 1], today.getFullYear()); y += 1) {
    const total = map.get(y) || 0;
    const months = y === today.getFullYear() ? today.getMonth() + 1 : 12;
    out.push({ year: String(y), total, monthlyAvg: total / months, partial: y === today.getFullYear() });
  }
  return out;
}
