// Etap 5: raporty okresowe – tydzień ISO, miesiąc i rok kalendarzowy (1.01–31.12).
// Wynik okresu = wartość na koniec − wartość na początek − wpłaty netto; stopa metodą Modified Dietz.
import { bondIncomeEvents, computeHoldings, incomeEventsWithTax, isoDay, livePriceLookup, netFlows, tradeCashDelta, valuePortfolio } from './engine.js';

const DAY = 86400000;
const MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
const MONTHS_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];

function parse(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(iso, n) {
  const d = parse(iso);
  return isoDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

function daysBetween(a, b) {
  return Math.round((parse(b) - parse(a)) / DAY);
}

export function isoWeek(iso) {
  const d = parse(iso);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { week: Math.ceil(((t - yearStart) / DAY + 1) / 7), year: t.getUTCFullYear() };
}

// Definicja okresu: start = ostatni dzień poprzedniego okresu (wycena „na zamknięcie”), end = ostatni dzień okresu
export function makePeriod(type, anchorIso, today = isoDay(new Date())) {
  const a = parse(anchorIso);
  let first;
  let last;
  let label;
  let shortLabel;
  if (type === 'WEEK') {
    const dow = a.getDay() || 7;
    first = isoDay(new Date(a.getFullYear(), a.getMonth(), a.getDate() - dow + 1));
    last = addDays(first, 6);
    const w = isoWeek(first);
    label = `Tydzień ${w.week} / ${w.year}`;
    shortLabel = `T${w.week}`;
  } else if (type === 'MONTH') {
    first = isoDay(new Date(a.getFullYear(), a.getMonth(), 1));
    last = isoDay(new Date(a.getFullYear(), a.getMonth() + 1, 0));
    label = `${MONTHS[a.getMonth()]} ${a.getFullYear()}`;
    shortLabel = MONTHS[a.getMonth()].slice(0, 3);
  } else {
    first = `${a.getFullYear()}-01-01`;
    last = `${a.getFullYear()}-12-31`;
    label = `Rok ${a.getFullYear()}`;
    shortLabel = String(a.getFullYear());
  }
  const closed = last < today;
  return {
    type,
    first,
    last,
    start: addDays(first, -1),
    end: closed ? last : today,
    closed,
    label,
    shortLabel,
    rangeLabel: `${Number(first.slice(8))} ${MONTHS_GEN[Number(first.slice(5, 7)) - 1]} – ${Number((closed ? last : today).slice(8))} ${MONTHS_GEN[Number((closed ? last : today).slice(5, 7)) - 1]} ${(closed ? last : today).slice(0, 4)}`,
  };
}

export function firstActivity(state) {
  const dates = [...state.cashflows.map((c) => c.date), ...state.trades.map((t) => t.date)];
  return dates.length ? dates.reduce((m, d) => (d < m ? d : m)) : isoDay(new Date());
}

// Lista okresów od pierwszej aktywności do dziś (najnowsze pierwsze)
export function listPeriods(state, type, today = isoDay(new Date())) {
  const start = firstActivity(state);
  const out = [];
  let anchor = today;
  for (let guard = 0; guard < 600; guard += 1) {
    const p = makePeriod(type, anchor, today);
    if (p.last < start) break;
    out.push(p);
    anchor = addDays(p.first, -1);
    if (type === 'WEEK' && out.length >= 26) break;
  }
  return out;
}

// Wycena całego portfela na dzień: dziś → notowania bieżące; migawka (≤ 3 dni wcześniej) → zapisana wartość;
// w przeciwnym razie wycena pozycji cenami historycznymi (resolver).
// accountIds = null → wszystkie konta
function valuationAt(state, date, resolver, today, accountIds = null) {
  if (date >= today) {
    const v = valuePortfolio(state, { asOf: today, accountIds, priceLookup: livePriceLookup(state) });
    return { date: today, value: v.totals.total, source: 'live' };
  }
  let snap = null;
  for (let i = state.snapshots.length - 1; i >= 0; i -= 1) {
    if (state.snapshots[i].date <= date) {
      snap = state.snapshots[i];
      break;
    }
  }
  if (snap && daysBetween(snap.date, date) <= 3) {
    const value = Object.entries(snap.accounts || {})
      .filter(([id]) => !accountIds || accountIds.includes(id))
      .reduce((s, [, a]) => s + (a.value || 0), 0);
    return { date: snap.date, value, source: 'snapshot' };
  }
  const v = valuePortfolio(state, { asOf: date, accountIds, priceLookup: (inst) => resolver.instrumentPLN(inst, date) });
  return { date, value: v.totals.total, source: 'revaluation' };
}

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
  return Math.abs(denom) < 1e-6 ? 0 : (endValue - startValue - net) / denom;
}

// Wyniki instrumentów w okresie: zmiana ceny % (PLN) i wynik pozycji w PLN (z dywidendami)
function instrumentResults(state, start, end, resolver, income, accountIds = null) {
  const inAcc = (id) => !accountIds || accountIds.includes(id);
  const holdStart = computeHoldings(state, start, accountIds);
  const holdEnd = computeHoldings(state, end, accountIds);
  const ids = new Set([...holdStart, ...holdEnd].filter((h) => h.quantity > 0).map((h) => h.instrumentId));
  for (const t of state.trades) if (t.date > start && t.date <= end && inAcc(t.accountId)) ids.add(t.instrumentId);
  const out = [];
  for (const id of ids) {
    const inst = state.instruments.find((i) => i.id === id);
    if (!inst) continue;
    const qStart = holdStart.filter((h) => h.instrumentId === id).reduce((s, h) => s + h.quantity, 0);
    const qEnd = holdEnd.filter((h) => h.instrumentId === id).reduce((s, h) => s + h.quantity, 0);
    const pStart = resolver.instrumentPLN(inst, start);
    const pEnd = resolver.instrumentPLN(inst, end);
    if (!Number.isFinite(pStart) || !Number.isFinite(pEnd) || pStart <= 0) continue;
    const netBuys = state.trades
      .filter((t) => t.instrumentId === id && t.date > start && t.date <= end && inAcc(t.accountId))
      .reduce((s, t) => s - tradeCashDelta(state, t), 0);
    const dividends = income.filter((i) => i.type === 'DIVIDEND' && i.instrumentId === id).reduce((s, i) => s + i.net, 0);
    const result = qEnd * pEnd - qStart * pStart - netBuys + dividends;
    out.push({
      instrument: inst,
      pct: pEnd / pStart - 1,
      result,
      dividends,
      valueStart: qStart * pStart,
      netBuys,
      valueEnd: qEnd * pEnd,
    });
  }
  return out.sort((a, b) => b.pct - a.pct);
}

// accountIds (opcjonalnie) – metryki tylko dla wybranych kont (np. portfel inwestycyjny bez poduszki)
export function periodMetrics(state, period, resolver, today = isoDay(new Date()), accountIds = null) {
  const inAcc = (id) => !accountIds || accountIds.includes(id);
  const s = valuationAt(state, period.start, resolver, today, accountIds);
  const e = valuationAt(state, period.end, resolver, today, accountIds);
  const flowsList = state.cashflows
    .filter((c) => c.date > s.date && c.date <= e.date && inAcc(c.accountId))
    .map((c) => ({ date: c.date, amount: (c.type === 'DEPOSIT' ? 1 : -1) * (Number(c.amount) || 0) }));
  const flows = flowsList.reduce((acc, f) => acc + f.amount, 0);
  const deposits = flowsList.filter((f) => f.amount > 0).reduce((acc, f) => acc + f.amount, 0);
  const income = [...incomeEventsWithTax(state), ...bondIncomeEvents(state, period.end)].filter((i) => i.date > s.date && i.date <= e.date && inAcc(i.accountId));
  const dividends = income.filter((i) => i.type === 'DIVIDEND').reduce((acc, i) => acc + i.net, 0);
  const interest = income.filter((i) => i.type === 'INTEREST').reduce((acc, i) => acc + i.net, 0);
  const profit = e.value - s.value - flows;
  // Stopa okresu: zysk / kapitał zaangażowany (wartość na start + wpłaty w okresie); MWR (Modified Dietz) pomocniczo
  const capital = s.value + deposits;
  const pct = capital > 0 ? profit / capital : 0;
  const mwr = modifiedDietz(s.value, e.value, flowsList, s.date, e.date);
  const instruments = instrumentResults(state, period.start, period.end, resolver, income, accountIds);
  return {
    period,
    startValue: s.value,
    endValue: e.value,
    startDate: s.date,
    endDate: e.date,
    sources: [s.source, e.source],
    flows,
    deposits,
    withdrawals: deposits - flows,
    profit,
    pct,
    mwr,
    dividends,
    interest,
    instruments,
    best: instruments[0] || null,
    worst: instruments.length > 1 ? instruments[instruments.length - 1] : null,
    contributionsTotal: netFlows(state, accountIds || state.accounts.map((a) => a.id), null, period.end),
  };
}

// Podsumowanie roku kalendarzowego: 12 miesięcy + rok łącznie
export function yearSummary(state, year, resolver, today = isoDay(new Date()), accountIds = null) {
  const months = [];
  for (let m = 0; m < 12; m += 1) {
    const p = makePeriod('MONTH', isoDay(new Date(year, m, 1)), today);
    if (p.first > today || p.last < addDays(firstActivity(state), -1)) continue;
    months.push(periodMetrics(state, p, resolver, today, accountIds));
  }
  const total = periodMetrics(state, makePeriod('YEAR', `${year}-06-01`, today), resolver, today, accountIds);
  return { year, months, total };
}

// Raport na X dla wybranych kont i rodzajów aktywów (np. tylko IKE: akcje + ETF).
// Tryb „aktywa” (bez gotówki i obligacji): wartość pozycji, kapitał w pozycjach (koszt), zysk = niezrealizowany
// + zrealizowany + dywidendy; wynik okresu z wyników instrumentów. Tryb pełny – wartości całych kont.
export function reportScope(state, { accountIds, kinds }) {
  const assetsOnly = !kinds.includes('CASH');
  const kindOf = (inst) => (inst?.kind === 'ETF' ? 'ETF' : 'STOCK');
  const pick = (inst) => kinds.includes(kindOf(inst));
  return { accountIds, kinds, assetsOnly, pick };
}

export function scopedTotals(state, scope, { computePeriodStats, today = isoDay(new Date()) }) {
  if (!scope.assetsOnly) {
    const st = computePeriodStats(state, { period: 'ALL', accountIds: scope.accountIds });
    return { value: st.endValue, contributions: st.contributionsAll, profit: st.totalReturn, profitPct: st.totalReturnPct, dividends: st.dividendsNet };
  }
  const v = valuePortfolio(state, { asOf: today, accountIds: scope.accountIds, priceLookup: livePriceLookup(state) });
  const positions = v.positions.filter((p) => scope.pick(p.instrument));
  const value = positions.reduce((s, p) => s + p.value, 0);
  const cost = positions.reduce((s, p) => s + p.costPLN, 0);
  const realized = computeHoldings(state, today, scope.accountIds)
    .filter((h) => scope.pick(h.instrument))
    .reduce((s, h) => s + (h.realizedPLN || 0), 0);
  const instIds = new Set(state.instruments.filter((i) => scope.pick(i)).map((i) => i.id));
  const dividends = incomeEventsWithTax(state)
    .filter((i) => i.type === 'DIVIDEND' && scope.accountIds.includes(i.accountId) && instIds.has(i.instrumentId) && i.date <= today)
    .reduce((s, i) => s + i.net, 0);
  const profit = value - cost + realized + dividends;
  return { value, contributions: cost, profit, profitPct: cost > 0 ? profit / cost : 0, dividends };
}

export function scopedPeriodMetrics(state, period, resolver, scope, today = isoDay(new Date())) {
  const m = periodMetrics(state, period, resolver, today, scope.accountIds);
  if (!scope.assetsOnly) return m;
  const instruments = m.instruments.filter((r) => scope.pick(r.instrument));
  // Dywidendy okresu z rejestru – także spółek już sprzedanych (bez pozycji na początku i końcu okresu)
  const instById = Object.fromEntries(state.instruments.map((i) => [i.id, i]));
  const dividends = incomeEventsWithTax(state)
    .filter((i) => i.type === 'DIVIDEND' && i.date > m.startDate && i.date <= m.endDate && scope.accountIds.includes(i.accountId) && scope.pick(instById[i.instrumentId]))
    .reduce((s, i) => s + i.net, 0);
  const profit = instruments.reduce((s, r) => s + r.result - r.dividends, 0) + dividends;
  const capital = instruments.reduce((s, r) => s + r.valueStart + Math.max(0, r.netBuys), 0);
  return {
    ...m,
    instruments,
    profit,
    pct: capital > 0 ? profit / capital : 0,
    dividends,
    startValue: instruments.reduce((s, r) => s + r.valueStart, 0),
    endValue: instruments.reduce((s, r) => s + r.valueEnd, 0),
    best: instruments[0] || null,
    worst: instruments.length > 1 ? instruments[instruments.length - 1] : null,
  };
}
