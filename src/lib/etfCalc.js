// Kalkulator opłacalności ETF: wpływ TER, przewalutowania (np. XTB 0,05% przy kupnie i sprzedaży)
// i podatku na wynik długoterminowy. Kapitalizacja miesięczna, wpłaty na koniec miesiąca.
import { BELKA_RATE, XTB_FX_FEE_PCT } from './constants.js';

export const ETF_ACCOUNTS = {
  IKE: { id: 'IKE', label: 'IKE / IKZE (bez Belki)', tax: 0 },
  BROKERAGE: { id: 'BROKERAGE', label: 'Maklerskie (19% przy sprzedaży)', tax: BELKA_RATE },
};

export function defaultEtfCalc() {
  return {
    initial: 10000,
    monthly: 1000,
    years: 20,
    grossReturn: 7,
    account: 'IKE',
    etfs: [
      { id: 'e1', name: 'ETF globalny (EUR)', ter: 0.22, foreign: true, fxPct: XTB_FX_FEE_PCT },
      { id: 'e2', name: 'ETF S&P 500 (USD)', ter: 0.07, foreign: true, fxPct: XTB_FX_FEE_PCT },
      { id: 'e3', name: 'ETF na GPW (PLN)', ter: 0.5, foreign: false, fxPct: 0 },
    ],
  };
}

// Pojedyncza symulacja; zwraca ścieżkę wartości (przed sprzedażą) i rozliczenie końcowe
export function simulateEtf({ initial, monthly, years, grossReturn, ter, fxPct, taxRate }) {
  const n = Math.max(1, Math.round(years * 12));
  const mGrowth = Math.pow(1 + grossReturn / 100, 1 / 12);
  const mTer = Math.pow(1 - ter / 100, 1 / 12);
  const fx = fxPct / 100;
  let value = initial / (1 + fx);
  let contributed = initial;
  let fxBuy = initial - value;
  let terPaid = 0;
  const points = [{ year: 0, value, contributed }];
  for (let m = 1; m <= n; m += 1) {
    const grown = value * mGrowth;
    terPaid += grown * (1 - mTer);
    value = grown * mTer;
    const invested = monthly / (1 + fx);
    fxBuy += monthly - invested;
    value += invested;
    contributed += monthly;
    if (m % 12 === 0) points.push({ year: m / 12, value, contributed });
  }
  const fxSell = value * fx;
  const proceeds = value - fxSell;
  const gain = proceeds - contributed;
  const tax = Math.max(0, gain) * taxRate;
  const net = proceeds - tax;
  return { points, valueBeforeSale: value, contributed, fxBuy, fxSell, terPaid, tax, net };
}

// Roczna stopa zwrotu ważona kapitałem (IRR), przy której wpłaty dają wynik netto
export function effectiveAnnualReturn({ initial, monthly, years, net }) {
  const n = Math.max(1, Math.round(years * 12));
  const fv = (r) => {
    const mr = Math.pow(1 + r, 1 / 12);
    let v = initial * Math.pow(mr, n);
    for (let k = 1; k <= n; k += 1) v += monthly * Math.pow(mr, n - k);
    return v;
  };
  let lo = -0.99;
  let hi = 1;
  for (let i = 0; i < 100; i += 1) {
    const mid = (lo + hi) / 2;
    if (fv(mid) < net) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Porównanie ETF-ów: koszt TER i przewalutowania jako utracony wynik względem wariantu bez danego kosztu
export function compareEtfs(params) {
  const taxRate = ETF_ACCOUNTS[params.account]?.tax ?? 0;
  const base = { initial: params.initial, monthly: params.monthly, years: params.years, grossReturn: params.grossReturn, taxRate };
  const noCost = simulateEtf({ ...base, ter: 0, fxPct: 0 });
  const baselineReturn = effectiveAnnualReturn({ ...base, net: noCost.net });
  const rows = params.etfs.map((e) => {
    const ter = Math.max(0, Number(e.ter) || 0);
    const fxPct = e.foreign ? Math.max(0, Number(e.fxPct) || 0) : 0;
    const sim = simulateEtf({ ...base, ter, fxPct });
    const noTer = simulateEtf({ ...base, ter: 0, fxPct });
    const noFx = simulateEtf({ ...base, ter, fxPct: 0 });
    const eff = effectiveAnnualReturn({ ...base, net: sim.net });
    return {
      ...e,
      ter,
      fxPct,
      sim,
      net: sim.net,
      terCost: noTer.net - sim.net,
      fxCost: noFx.net - sim.net,
      totalCost: noCost.net - sim.net,
      effectiveReturn: eff,
      drag: baselineReturn - eff,
    };
  });
  const best = rows.reduce((b, r) => (!b || r.net > b.net ? r : b), null);
  return { rows: rows.map((r) => ({ ...r, vsBest: best ? r.net - best.net : 0, isBest: r === best })), noCost, baselineReturn, best };
}
