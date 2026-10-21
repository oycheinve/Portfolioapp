// Etap 6: symulator „Co jeśli” – szok cenowy akcji/ETF, zmiana kursów walut i nieruchomości.
// Cena w walucie instrumentu × (1 + szok rynkowy) × kurs × (1 + zmiana kursu waluty). Obligacje i gotówka bez zmian.
import { fxToPLN, isoDay, livePriceLookup, otherAssetsValue, valuePortfolio } from './engine.js';

export const STRESS_PRESETS = [
  { id: 'base', label: 'Korekta −15%', values: { stocks: -15, etf: -15, usd: 0, eur: 0, other: 0 } },
  { id: 'bear', label: 'Bessa −30%', values: { stocks: -30, etf: -25, usd: 5, eur: 3, other: -5 } },
  { id: 'crash', label: 'Krach 2008 (−50%)', values: { stocks: -50, etf: -45, usd: 10, eur: 5, other: -15 } },
  { id: 'pln', label: 'Silny złoty (−10% USD/EUR)', values: { stocks: 0, etf: 0, usd: -10, eur: -10, other: 0 } },
  { id: 'gpw', label: 'Tylko GPW −20%', values: { stocks: -20, etf: 0, usd: 0, eur: 0, other: 0, plnOnly: true } },
];

export function runStress(state, shock) {
  const today = isoDay(new Date());
  const v = valuePortfolio(state, { asOf: today, accountIds: null, priceLookup: livePriceLookup(state) });
  const fx = state.prices?.fx;
  const quotes = state.prices?.quotes || {};
  const fxShift = { USD: (shock.usd || 0) / 100, EUR: (shock.eur || 0) / 100 };

  const accounts = {};
  for (const a of state.accounts) {
    const b = v.byAccount[a.id] || { stocks: 0, etf: 0, bonds: 0, cash: 0, total: 0 };
    accounts[a.id] = { account: a, before: b.total, after: b.bonds + b.cash, classesBefore: { ...b }, classesAfter: { stocks: 0, etf: 0, bonds: b.bonds, cash: b.cash } };
  }
  const currencies = {};
  const positions = v.positions.map((p) => {
    const inst = p.instrument;
    const ccy = quotes[p.instrumentId]?.currency || inst?.currency || 'PLN';
    const priceShockPct = inst?.kind === 'ETF' ? shock.etf : shock.stocks;
    // „Tylko GPW”: szok wyłącznie dla instrumentów notowanych w PLN
    const priceShock = shock.plnOnly && ccy !== 'PLN' ? 0 : (priceShockPct || 0) / 100;
    const fxChange = fxShift[ccy] || 0;
    const after = p.value * (1 + priceShock) * (1 + fxChange);
    const slot = accounts[p.accountId];
    if (slot) {
      slot.after += after;
      slot.classesAfter[inst?.kind === 'ETF' ? 'etf' : 'stocks'] += after;
    }
    const c = currencies[ccy] || { currency: ccy, before: 0, after: 0, rate: fxToPLN(fx, ccy) };
    c.before += p.value;
    c.after += after;
    currencies[ccy] = c;
    return { ...p, after, delta: after - p.value, priceShock, fxChange };
  });

  const other = otherAssetsValue(state);
  const otherBefore = other.includedValue;
  // Szok nieruchomości działa na wartość brutto, zobowiązania pozostają bez zmian
  const otherGross = (state.otherAssets || []).reduce((s, a) => s + (Number(a.value) || 0), 0);
  const otherAfter = otherBefore + otherGross * ((shock.other || 0) / 100);

  const t = v.totals;
  const classes = [
    { key: 'STOCKS', label: 'Akcje', before: t.stocks, after: positions.filter((p) => p.instrument?.kind !== 'ETF').reduce((s, p) => s + p.after, 0) },
    { key: 'ETF', label: 'ETF', before: t.etf, after: positions.filter((p) => p.instrument?.kind === 'ETF').reduce((s, p) => s + p.after, 0) },
    { key: 'BONDS', label: 'Obligacje', before: t.bonds, after: t.bonds },
    { key: 'CASH', label: 'Gotówka', before: t.cash, after: t.cash },
    { key: 'OTHER', label: 'Nieruchomości / inne', before: otherBefore, after: otherAfter },
  ].filter((c) => c.before !== 0 || c.after !== 0);

  const before = t.total + otherBefore;
  const after = classes.reduce((s, c) => s + c.after, 0);
  const portfolioAfter = after - otherAfter;
  return {
    before,
    after,
    delta: after - before,
    deltaPct: before > 0 ? after / before - 1 : 0,
    portfolioBefore: t.total,
    portfolioAfter,
    classes,
    accounts: Object.values(accounts).filter((a) => a.before !== 0),
    currencies: Object.values(currencies).sort((a, b) => b.before - a.before),
    positions: positions.sort((a, b) => a.delta - b.delta),
    safeShareBefore: before > 0 ? (t.bonds + t.cash) / before : 0,
    safeShareAfter: after > 0 ? (t.bonds + t.cash) / after : 0,
  };
}
