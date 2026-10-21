// Kalkulator inwestycyjny: procent składany (kapitalizacja miesięczna), wpłaty rosnące r/r, koszt TER,
// opodatkowanie wg rodzaju konta i wartości realne (po inflacji).
import { BELKA_RATE, IKZE_PAYOUT_TAX } from './constants.js';

export const CALC_ACCOUNTS = {
  REGULAR: { id: 'REGULAR', label: 'Zwykłe konto (Belka 19%)' },
  IKE: { id: 'IKE', label: 'IKE (0% podatku)' },
  IKZE: { id: 'IKZE', label: 'IKZE (10% przy wypłacie + ulga PIT)' },
};

export function defaultCalculator() {
  return {
    initial: 10000,
    monthly: 1000,
    years: 20,
    annualReturn: 7,
    contributionGrowth: 3,
    ter: 0.2,
    inflation: 3,
    account: 'IKE',
    pitRate: 12, // stawka PIT do ulgi IKZE
    reinvestRefund: true,
  };
}

// Symulacja dla jednego rodzaju konta; zwraca punkty roczne i wynik końcowy
export function simulateInvestment(p, accountType = p.account) {
  const months = Math.round((Number(p.years) || 0) * 12);
  const r = Math.pow(1 + ((Number(p.annualReturn) || 0) - (Number(p.ter) || 0)) / 100, 1 / 12) - 1;
  const infM = Math.pow(1 + (Number(p.inflation) || 0) / 100, 1 / 12) - 1;
  const pit = (Number(p.pitRate) || 0) / 100;
  let value = Number(p.initial) || 0;
  let contributed = value;
  let refunds = 0;
  let contribution = Number(p.monthly) || 0;
  let deflator = 1;
  let terCost = 0;
  const grossR = Math.pow(1 + (Number(p.annualReturn) || 0) / 100, 1 / 12) - 1;
  const points = [{ year: 0, value, contributed, gain: 0, real: value, refunds: 0 }];
  let yearContrib = 0;
  for (let m = 1; m <= months; m += 1) {
    const before = value;
    value = value * (1 + r) + contribution;
    terCost += before * (grossR - r);
    contributed += contribution;
    yearContrib += contribution;
    deflator *= 1 + infM;
    if (m % 12 === 0) {
      // IKZE: zwrot podatku za wpłaty roku (opcjonalnie reinwestowany na początku kolejnego roku)
      if (accountType === 'IKZE') {
        const refund = yearContrib * pit;
        refunds += refund;
        if (p.reinvestRefund) value += refund;
      }
      yearContrib = 0;
      contribution *= 1 + (Number(p.contributionGrowth) || 0) / 100;
      points.push({ year: m / 12, value, contributed, gain: value - contributed, real: value / deflator, refunds });
    }
  }
  const gain = value - contributed - (accountType === 'IKZE' && p.reinvestRefund ? refunds : 0);
  let tax = 0;
  if (accountType === 'REGULAR') tax = Math.max(0, value - contributed) * BELKA_RATE;
  if (accountType === 'IKZE') tax = value * IKZE_PAYOUT_TAX;
  const net = value - tax + (accountType === 'IKZE' && !p.reinvestRefund ? refunds : 0);
  return {
    points,
    value,
    contributed,
    gain,
    tax,
    net,
    netReal: net / deflator,
    refunds,
    terCost,
    multiple: contributed > 0 ? net / contributed : 0,
  };
}

export function compareAccounts(p) {
  return Object.keys(CALC_ACCOUNTS).map((id) => ({ id, label: CALC_ACCOUNTS[id].label, ...simulateInvestment(p, id) }));
}
