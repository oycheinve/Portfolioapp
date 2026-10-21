// Tabela „Portfel”: wszystkie pozycje majątku pogrupowane w kategorie z podsumowaniami
import { getCpiTable, valueBond } from './bonds.js';
import { bondIncomeEvents, fxToPLN, incomeEventsWithTax, isoDay, livePriceLookup, netFlows, tradeAmounts, valuePortfolio } from './engine.js';
import { belkaRateForAccount, bondBelkaRate } from './tax.js';
import { OTHER_ASSET_CATEGORIES } from './constants.js';

export const PORTFOLIO_CATEGORIES = [
  { id: 'CASH', label: 'Konta gotówkowe', short: 'Gotówka' },
  { id: 'STOCK_PL', label: 'Akcje GPW', short: 'Akcje GPW' },
  { id: 'STOCK_FOREIGN', label: 'Akcje zagraniczne', short: 'Akcje zagr.' },
  { id: 'ETF_FOREIGN', label: 'ETF-y zagraniczne', short: 'ETF zagr.' },
  { id: 'ETF_PL', label: 'ETF/ETC/ETN GPW', short: 'ETF/ETC/ETN GPW' },
  { id: 'BONDS', label: 'Obligacje skarbowe', short: 'Obligacje' },
  { id: 'OTHER', label: 'Nieruchomości i inne', short: 'Nieruchomości' },
];

function sortOps(ops) {
  return ops.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function buildPortfolioRows(state) {
  const today = isoDay(new Date());
  const v = valuePortfolio(state, { asOf: today, accountIds: null, priceLookup: livePriceLookup(state) });
  const quotes = state.prices?.quotes || {};
  const fx = state.prices?.fx;
  const rows = [];
  const income = [...incomeEventsWithTax(state), ...bondIncomeEvents(state, today)].filter((i) => i.date <= today);
  const accById = Object.fromEntries(state.accounts.map((a) => [a.id, a]));
  const instById = Object.fromEntries(state.instruments.map((i) => [i.id, i]));
  const firstDate = (ops) => ops.reduce((m, o) => (!m || o.date < m ? o.date : m), null);

  // Konta gotówkowe: konta oszczędnościowe oraz wolna gotówka na rachunkach maklerskich
  for (const a of state.accounts) {
    const cash = v.byAccount[a.id]?.cash || 0;
    if (Math.abs(cash) < 0.5) continue;
    const savings = a.type === 'SAVINGS';
    const contrib = savings ? netFlows(state, [a.id], null, today) : null;
    const belka = belkaRateForAccount(a, state.settings);
    const dayChange = savings ? cash * ((Number(a.interestRate) || 0) / 100 / 365) * (1 - belka) : 0;
    const ops = sortOps([
      ...state.cashflows.filter((c) => c.accountId === a.id).map((c) => ({ date: c.date, type: c.type === 'DEPOSIT' ? 'Wpłata' : 'Wypłata', amount: (c.type === 'DEPOSIT' ? 1 : -1) * Number(c.amount), note: c.note })),
      ...(savings ? income.filter((i) => i.accountId === a.id && i.type === 'INTEREST').map((i) => ({ date: i.date, type: 'Odsetki netto', amount: i.net, note: i.note })) : []),
    ]);
    rows.push({
      id: `cash_${a.id}`,
      ops,
      since: firstDate(ops),
      category: 'CASH',
      name: savings ? a.name : `Gotówka – ${a.name}`,
      sub: savings ? `${Number(a.interestRate) || 0}% · kapitalizacja` : 'wolne środki',
      accountId: a.id,
      account: a,
      value: cash,
      cost: savings ? contrib : cash,
      gain: savings ? cash - contrib : null,
      dayChange,
    });
  }

  // Akcje i ETF – pozycje per konto
  for (const p of v.positions) {
    const inst = p.instrument;
    if (!inst) continue;
    const q = quotes[p.instrumentId];
    const ccy = q?.currency || inst.currency || 'PLN';
    const foreign = ccy !== 'PLN';
    const category = ['ETF', 'ETC', 'ETN'].includes(inst.kind) ? (foreign ? 'ETF_FOREIGN' : 'ETF_PL') : foreign ? 'STOCK_FOREIGN' : 'STOCK_PL';
    const dayPct = q && q.prevClose ? q.price / q.prevClose - 1 : 0;
    const trades = state.trades.filter((t) => t.accountId === p.accountId && t.instrumentId === p.instrumentId);
    const ops = sortOps([
      ...trades.map((t) => {
        const amt = tradeAmounts(t, accById[t.accountId], instById[t.instrumentId]);
        return {
          date: t.date,
          type: t.side === 'BUY' ? 'Kupno' : 'Sprzedaż',
          quantity: Number(t.quantity),
          price: Number(t.price),
          currency: t.currency || inst.currency,
          amount: t.side === 'BUY' ? -amt.buyCost : amt.sellProceeds,
          note: [amt.fee ? `prowizja ${amt.fee.toFixed(2)} zł` : '', amt.fxFee ? `przewalutowanie ${amt.fxFee.toFixed(2)} zł` : ''].filter(Boolean).join(' · '),
        };
      }),
      ...income.filter((i) => i.type === 'DIVIDEND' && i.accountId === p.accountId && i.instrumentId === p.instrumentId).map((i) => ({ date: i.date, type: 'Dywidenda netto', amount: i.net, note: i.note })),
    ]);
    const buys = trades.filter((t) => t.side === 'BUY').map((t) => t.date).sort();
    rows.push({
      id: p.key,
      ops,
      since: buys[0] || firstDate(ops),
      avgPricePLN: p.quantity > 0 ? p.costPLN / p.quantity : null,
      currentPricePLN: p.quantity > 0 ? p.value / p.quantity : null,
      category,
      name: inst.ticker,
      sub: inst.name,
      accountId: p.accountId,
      account: p.account,
      quantity: p.quantity,
      price: q?.price ?? p.pricePLN / fxToPLN(fx, ccy),
      currency: ccy,
      value: p.value,
      cost: p.costPLN,
      gain: p.value - p.costPLN,
      dayChange: dayPct ? p.value - p.value / (1 + dayPct) : 0,
      fxFees: p.fxFeesPLN || 0,
      ter: inst.kind === 'ETF' ? inst.ter : null,
    });
  }

  // Obligacje – per transza
  const cpi = getCpiTable(state.settings);
  for (const b of v.bonds) {
    const belka = bondBelkaRate(b, b.account);
    const val = valueBond(b, today, belka, cpi);
    const coupons = val.coupons.reduce((s, c) => s + c.gross, 0) * (1 - belka);
    const ops = sortOps([
      { date: b.purchaseDate, type: 'Zakup obligacji', quantity: Number(b.quantity), price: 100, currency: 'PLN', amount: -Number(b.quantity) * 100, note: b.series },
      ...val.coupons.map((c) => ({ date: c.date, type: 'Kupon netto', amount: c.gross * (1 - belka), note: `${(c.rate * 100).toFixed(2)}%` })),
    ]);
    rows.push({
      id: `bond_${b.id}`,
      ops,
      since: b.purchaseDate,
      avgPricePLN: 100,
      currentPricePLN: (Number(b.quantity) || 0) > 0 ? val.netValue / Number(b.quantity) : null,
      category: 'BONDS',
      name: b.series,
      sub: `${b.type} · ${(val.currentRate * 100).toFixed(2)}% · wykup ${val.maturityDate}`,
      accountId: b.accountId,
      account: b.account,
      quantity: Number(b.quantity) || 0,
      price: (Number(b.quantity) || 0) > 0 ? val.netValue / Number(b.quantity) : 100,
      currency: 'PLN',
      value: val.netValue,
      cost: val.nominal,
      gain: val.accruedNet + coupons,
      dayChange: val.matured ? 0 : (val.nominal * val.currentRate * (1 - belka)) / 365,
    });
  }

  // Nieruchomości / inne – jeśli uwzględniane w majątku
  if (state.settings.includeOtherAssets) {
    for (const o of state.otherAssets || []) {
      if (!o.includeInNetWorth) continue;
      rows.push({
        id: `other_${o.id}`,
        ops: [],
        since: null,
        category: 'OTHER',
        name: o.name,
        sub: `${OTHER_ASSET_CATEGORIES[o.category] || 'Inne'}${Number(o.liabilities) > 0 ? ` · zobowiązania ${Math.round(o.liabilities).toLocaleString('pl-PL')} zł` : ''}`,
        accountId: null,
        value: (Number(o.value) || 0) - (Number(o.liabilities) || 0),
        cost: null,
        gain: null,
        dayChange: 0,
      });
    }
  }
  return rows;
}

// Grupy po filtrach: udział liczony względem widocznej sumy
export function groupRows(rows, { categories, accounts }) {
  const visible = rows.filter((r) => categories.includes(r.category) && (r.accountId === null || accounts.includes(r.accountId)));
  const total = visible.reduce((s, r) => s + r.value, 0);
  const groups = PORTFOLIO_CATEGORIES.map((c) => {
    const list = visible.filter((r) => r.category === c.id).sort((a, b) => b.value - a.value);
    const value = list.reduce((s, r) => s + r.value, 0);
    const withGain = list.filter((r) => r.gain !== null && r.gain !== undefined);
    const gain = withGain.reduce((s, r) => s + r.gain, 0);
    const costBase = withGain.reduce((s, r) => s + (Number(r.cost) || 0), 0);
    const dayChange = list.reduce((s, r) => s + (r.dayChange || 0), 0);
    return {
      ...c,
      rows: list.map((r) => ({
        ...r,
        share: total > 0 ? r.value / total : 0,
        gainPct: r.gain !== null && r.cost ? r.gain / r.cost : null,
        dayPct: r.value - r.dayChange > 0 ? r.dayChange / (r.value - r.dayChange) : 0,
      })),
      value,
      gain: withGain.length ? gain : null,
      gainPct: withGain.length && costBase > 0 ? gain / costBase : null,
      dayChange,
      dayPct: value - dayChange > 0 ? dayChange / (value - dayChange) : 0,
      share: total > 0 ? value / total : 0,
    };
  }).filter((g) => g.rows.length > 0);
  const gainRows = visible.filter((r) => r.gain !== null && r.gain !== undefined);
  const gain = gainRows.reduce((s, r) => s + r.gain, 0);
  const costBase = gainRows.reduce((s, r) => s + (Number(r.cost) || 0), 0);
  const dayChange = visible.reduce((s, r) => s + (r.dayChange || 0), 0);
  return {
    groups,
    total,
    gain,
    gainPct: costBase > 0 ? gain / costBase : 0,
    dayChange,
    dayPct: total - dayChange > 0 ? dayChange / (total - dayChange) : 0,
    count: visible.length,
  };
}
