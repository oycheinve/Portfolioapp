// Dane startowe Analityka wyników: XTB, Q1–Q3 2026 – wyniki vs konsensus PAP Biznes (tabele przekazane przez
// użytkownika). Wartości sprzed roku i z Q4 2025 wyliczone z podanych zmian r/r i q/q, EBITDA Q1 2026 z narastającej
// EBITDA (YTD). Przychody Q3 2026 – z pełnej tabeli (wersja 2 danych; wcześniej szacunek z marż ≈ 623 mln zł).
// Dopisywane do bazy użytkownika jednorazowo (flaga), dalej historia buduje się z kolejnych analiz.
import { PREFS_CHANGED_EVENT } from './budget.js';
import { earningsKey, readEarnings, readHistory, saveEarnings } from './earnings.js';

export const SEED_KEY = 'wealth-app-earnings-seed-v1';
// Wersja danych startowych: 2 – pełne przychody Q3 2026 (623,3 vs kons. 631,1)
export const SEED_VERSION = 2;
const SEED_MODEL = 'dane startowe (PAP Biznes)';
const base = { company: 'XTB', ticker: 'XTB', industry: 'Dom maklerski / fintech (broker online)', currency: 'PLN', unit: 'mln PLN', basis: 'consensus', outlook: '', risks: [] };
const m = (name, actual, consensus, previous, unit = 'mln PLN') => {
  const s = consensus ? (actual - consensus) / Math.abs(consensus) : null;
  // marże w % – ocena wg różnicy w p.p. (> 0,5 p.p. = beat)
  const verdict = consensus === null ? 'unknown' : unit === '%' ? (actual - consensus > 0.5 ? 'beat' : actual - consensus < -0.5 ? 'miss' : 'inline') : s > 0.02 ? 'beat' : s < -0.02 ? 'miss' : 'inline';
  return { name, actual, consensus, previous, unit, lowerIsBetter: false, verdict };
};

export const XTB_SEED = [
  {
    ...base,
    quarter: 'Q1 2026',
    periodEnd: '2026-03-31',
    verdict: 'beat',
    headline: 'Q1 2026 powyżej konsensusu: przychody 1094,0 mln zł (+8,3% vs kons.), zysk netto 535,0 mln zł (+7,4%).',
    metrics: [m('Przychody', 1094.0, 1010.1, 580.4), m('EBIT', 629.7, 581.9, 264.5), m('Zysk netto j.d.', 535.0, 498.0, 194.0), m('Marża EBIT', 57.6, 55.7, 45.62, '%'), m('Marża netto', 48.9, 47.8, 33.42, '%')],
    quarters: [
      { quarter: 'Q1 2025', revenue: 580.4, netIncome: 194.0, ebitda: null, eps: null },
      { quarter: 'Q4 2025', revenue: 606.4, netIncome: 180.9, ebitda: null, eps: null },
      { quarter: 'Q1 2026', revenue: 1094.0, netIncome: 535.0, ebitda: 636.6, eps: null },
    ],
    highlights: ['Przychody +88,5% r/r i +80,4% q/q', 'Zysk netto +175,8% r/r i +195,7% q/q', 'Marża EBIT 57,6% (+1,9 p.p. vs konsensus)', 'EBITDA 636,6 mln zł (wyliczona z EBITDA narastającej)'],
  },
  {
    ...base,
    quarter: 'Q2 2026',
    periodEnd: '2026-06-30',
    verdict: 'beat',
    headline: 'Q2 2026 wyraźnie powyżej konsensusu: zysk netto 492,2 mln zł (+29,6% vs kons.), przychody 992,6 mln zł (+14,9%).',
    metrics: [m('Przychody', 992.6, 863.7, 580.5), m('EBITDA', 579.4, 473.6, 293.7), m('EBIT', 572.6, 452.0, 287.7), m('Zysk netto j.d.', 492.2, 379.9, 216.2), m('Marża EBITDA', 58.4, 53.9, 50.63, '%'), m('Marża EBIT', 57.7, 52.3, 49.58, '%'), m('Marża netto', 49.6, 43.9, 37.25, '%')],
    quarters: [
      { quarter: 'Q2 2025', revenue: 580.5, netIncome: 216.2, ebitda: 293.7, eps: null },
      { quarter: 'Q1 2026', revenue: 1094.0, netIncome: 535.0, ebitda: 636.6, eps: null },
      { quarter: 'Q2 2026', revenue: 992.6, netIncome: 492.2, ebitda: 579.4, eps: null },
    ],
    highlights: ['Przychody +71,0% r/r, −9,3% q/q', 'Zysk netto +127,7% r/r, −8,0% q/q', 'Marża netto 49,6% (+5,6 p.p. vs konsensus)', 'Narastająco H1 2026: przychody 2086,6 mln zł (+79,8% r/r), zysk netto 1027,2 mln zł (+150,5%)'],
  },
  {
    ...base,
    quarter: 'Q3 2026',
    periodEnd: '2026-09-30',
    verdict: 'beat',
    headline: 'Q3 2026: zysk netto 213,7 mln zł (+15,3% vs kons.) i EBITDA 233,5 mln zł (+16,1%) powyżej konsensusu przy przychodach 623,3 mln zł nieco poniżej (−1,2%); spadek q/q po rekordowym H1.',
    metrics: [m('Przychody', 623.3, 631.1, 375.7), m('EBITDA', 233.5, 201.2, 59.7), m('EBIT', 225.7, 198.5, 53.2), m('Zysk netto j.d.', 213.7, 185.4, 53.2), m('Marża EBITDA', 37.5, 31.8, 15.93, '%'), m('Marża EBIT', 36.2, 31.4, 14.14, '%'), m('Marża netto', 34.3, 29.3, 14.18, '%')],
    quarters: [
      { quarter: 'Q3 2025', revenue: 375.7, netIncome: 53.2, ebitda: 59.7, eps: null },
      { quarter: 'Q2 2026', revenue: 992.6, netIncome: 492.2, ebitda: 579.4, eps: null },
      { quarter: 'Q3 2026', revenue: 623.3, netIncome: 213.7, ebitda: 233.5, eps: null },
    ],
    highlights: ['Przychody 623,3 mln zł: +65,9% r/r, −37,2% q/q, −1,2% vs konsensus 631,1 mln zł', 'EBITDA +291,0% r/r, −59,7% q/q', 'Zysk netto +301,5% r/r, −56,6% q/q', 'Narastająco 2026: przychody 2709,9 mln zł (+76,4% r/r), EBITDA 1449,5 mln zł (+132,4%), zysk netto 1240,9 mln zł (+167,8%)'],
  },
];

const done = () => {
  try {
    return !!localStorage.getItem(SEED_KEY);
  } catch {
    return true;
  }
};
const VERSION_KEY = 'wealth-app-earnings-seed-version';
const setVersion = () => {
  try {
    localStorage.setItem(VERSION_KEY, String(SEED_VERSION));
    window.dispatchEvent(new CustomEvent(PREFS_CHANGED_EVENT, { detail: { key: VERSION_KEY } }));
  } catch {
    // brak localStorage
  }
};
// Aktualizacja wcześniej wczytanych danych startowych do nowej wersji – tylko wpisy, których użytkownik nie zastąpił
// własną analizą (analiza z danych startowych ma model SEED_MODEL); nowa wartość zastępuje szacunek w historii
export function upgradeSeed(now = Date.now()) {
  try {
    if (!localStorage.getItem(SEED_KEY) || Number(localStorage.getItem(VERSION_KEY) || 1) >= SEED_VERSION) return false;
  } catch {
    return false;
  }
  const list = readEarnings();
  const q3 = XTB_SEED.find((a) => a.quarter === 'Q3 2026');
  const cur = list.find((e) => e.key === earningsKey(q3));
  let changed = false;
  if (!cur || cur.model === SEED_MODEL) {
    saveEarnings({ analysis: q3, sources: [], grounded: false, model: SEED_MODEL }, now);
    changed = true;
  }
  setVersion();
  return changed;
}
// Czy proponować / wczytać dane startowe: nie wczytane wcześniej i brak historii XTB w bazie użytkownika
export const seedAvailable = () => !done() && !readHistory().XTB;
export function applyXtbSeed(now = Date.now()) {
  if (!seedAvailable()) return false;
  XTB_SEED.forEach((analysis, i) => saveEarnings({ analysis, sources: [], grounded: false, model: SEED_MODEL }, now - (XTB_SEED.length - i) * 1000));
  setVersion();
  try {
    localStorage.setItem(SEED_KEY, new Date(now).toISOString());
    window.dispatchEvent(new CustomEvent(PREFS_CHANGED_EVENT, { detail: { key: SEED_KEY } }));
  } catch {
    // brak localStorage
  }
  return true;
}
