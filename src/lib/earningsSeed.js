// Dane startowe Analityka wyników (XTB, LPP – niżej). XTB, Q1–Q3 2026 – wyniki vs konsensus PAP Biznes (tabele przekazane przez
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

// LPP (handel odzieżą): Q4 2025, Q1 2026, Q2 2026 vs konsensus PAP Biznes (tabele użytkownika; Q3 2026 – zwykłą analizą).
// Q4 2024, Q1 2025 i wyniki sprzed roku – ze zmian r/r; Q3 2025 – z q/q (przychody, EBITDA, EBIT); Q2 2025 – z wyników
// za cały 2025 (YTD w tabeli Q4) minus pozostałe kwartały (zgodne z r/r); zysk netto Q3 2025 (strata ≈ 16 mln zł) –
// z rocznego zysku netto 2025 (dlatego w tabeli Q4 brak q/q zysku netto).
const lppBase = { company: 'LPP', ticker: 'LPP', industry: 'Handel odzieżą (sieci sklepów i e-commerce)', currency: 'PLN', unit: 'mln PLN', basis: 'consensus', outlook: '', risks: [] };
export const LPP_SEED = [
  {
    ...lppBase,
    quarter: 'Q4 2025',
    periodEnd: '',
    verdict: 'beat',
    headline: 'Q4 2025: zysk netto 714,0 mln zł (+23,1% vs kons.) i EBITDA 1518,0 mln zł (+6,7%) powyżej konsensusu przy przychodach 6460,0 mln zł nieco poniżej (−1,1%).',
    metrics: [m('Przychody', 6460.0, 6535.1, 5671.6), m('EBITDA', 1518.0, 1423.1, 1133.7), m('EBIT', 952.0, 860.5, 662.0), m('Zysk netto j.d.', 714.0, 579.8, 447.9), m('Marża EBITDA', 23.5, 21.8, 20.0, '%'), m('Marża EBIT', 14.7, 13.2, 11.64, '%'), m('Marża netto', 11.1, 8.9, 7.95, '%')],
    quarters: [
      { quarter: 'Q4 2024', revenue: 5671.6, netIncome: 447.9, ebitda: 1133.7, eps: null },
      { quarter: 'Q3 2025', revenue: 6140.7, netIncome: -16.3, ebitda: 917.8, eps: null },
      { quarter: 'Q4 2025', revenue: 6460.0, netIncome: 714.0, ebitda: 1518.0, eps: null },
    ],
    highlights: ['Przychody +13,9% r/r i +5,2% q/q', 'EBITDA +33,9% r/r, EBIT +43,8% r/r, zysk netto +59,4% r/r', 'Marża netto 11,1% (+2,2 p.p. vs konsensus)', 'Cały 2025: przychody 23 109,0 mln zł, EBITDA 4568,0 mln zł, EBIT 2493,0 mln zł, zysk netto 1500,0 mln zł'],
  },
  {
    ...lppBase,
    quarter: 'Q1 2026',
    periodEnd: '',
    verdict: 'mixed',
    headline: 'Q1 2026 mieszany: przychody 5472,0 mln zł poniżej konsensusu (−4,5%), ale zysk netto 475,0 mln zł powyżej (+7,8%).',
    metrics: [m('Przychody', 5472.0, 5731.3, 4952.0), m('EBITDA', 1282.0, 1261.9, 937.8), m('EBIT', 688.0, 673.3, 463.9), m('Zysk netto j.d.', 475.0, 440.5, 334.0), m('Marża EBITDA', 23.4, 22.1, 18.91, '%'), m('Marża EBIT', 12.6, 11.8, 9.39, '%'), m('Marża netto', 8.7, 7.7, 6.76, '%')],
    quarters: [
      { quarter: 'Q1 2025', revenue: 4952.0, netIncome: 334.0, ebitda: 937.8, eps: null },
      { quarter: 'Q4 2025', revenue: 6460.0, netIncome: 714.0, ebitda: 1518.0, eps: null },
      { quarter: 'Q1 2026', revenue: 5472.0, netIncome: 475.0, ebitda: 1282.0, eps: null },
    ],
    highlights: ['Przychody +10,5% r/r, −15,3% q/q (sezonowo słabszy kwartał)', 'EBITDA +36,7% r/r, EBIT +48,3% r/r, zysk netto +42,2% r/r', 'Marże wyższe niż w konsensusie: EBITDA 23,4% (+1,3 p.p.), netto 8,7% (+0,9 p.p.)'],
  },
  {
    ...lppBase,
    quarter: 'Q2 2026',
    periodEnd: '',
    verdict: 'beat',
    headline: 'Q2 2026 powyżej konsensusu: zysk netto 768,0 mln zł (+12%), EBIT 1127,0 mln zł (+16%) przy przychodach 6577,0 mln zł zgodnych z oczekiwaniami.',
    metrics: [m('Przychody', 6577.0, 6547.0, 5556.3), m('EBITDA', 1744.0, 1577.7, 1194.4), m('EBIT', 1127.0, 968.2, 689.1), m('Zysk netto j.d.', 768.0, 684.1, 468.3), m('Marża EBITDA', 26.5, 24.1, 21.48, '%'), m('Marża EBIT', 17.1, 14.8, 12.37, '%'), m('Marża netto', 11.7, 10.5, 8.43, '%')],
    quarters: [
      { quarter: 'Q2 2025', revenue: 5556.3, netIncome: 468.3, ebitda: 1194.4, eps: null },
      { quarter: 'Q1 2026', revenue: 5472.0, netIncome: 475.0, ebitda: 1282.0, eps: null },
      { quarter: 'Q2 2026', revenue: 6577.0, netIncome: 768.0, ebitda: 1744.0, eps: null },
    ],
    highlights: ['Przychody +18% r/r i +20% q/q', 'EBITDA +46% r/r, EBIT +64% r/r, zysk netto +64% r/r', 'Narastająco H1 2026: przychody 12 049,0 mln zł (+15%), EBITDA 3026,0 mln zł (+42%), zysk netto 1243,0 mln zł (+55%)', 'Marża EBIT 17,1% (+2,3 p.p. vs konsensus)'],
  },
];

// Rejestr danych startowych (dowolna liczba spółek): każda ma własną flagę „wczytane” per użytkownik
export const COMPANY_SEEDS = [
  { key: 'XTB', label: 'XTB (Q1–Q3 2026 vs konsensus)', flag: SEED_KEY, data: XTB_SEED },
  { key: 'LPP', label: 'LPP (Q4 2025 – Q2 2026 vs konsensus)', flag: 'wealth-app-earnings-seed-lpp-v1', data: LPP_SEED },
];
const flagSet = (flag) => {
  try {
    return !!localStorage.getItem(flag);
  } catch {
    return true;
  }
};
// Spółki z danymi startowymi do zaproponowania: nie wczytane wcześniej i bez historii w bazie użytkownika
export const availableSeeds = () => {
  const hist = readHistory();
  return COMPANY_SEEDS.filter((c) => !flagSet(c.flag) && !hist[c.key]).map(({ key, label }) => ({ key, label }));
};
export function applySeed(key, now = Date.now()) {
  if (key === 'XTB') return applyXtbSeed(now);
  const seed = COMPANY_SEEDS.find((c) => c.key === key);
  if (!seed || !availableSeeds().some((c) => c.key === key)) return false;
  seed.data.forEach((analysis, i) => saveEarnings({ analysis, sources: [], grounded: false, model: SEED_MODEL }, now - (seed.data.length - i) * 1000));
  try {
    localStorage.setItem(seed.flag, new Date(now).toISOString());
    window.dispatchEvent(new CustomEvent(PREFS_CHANGED_EVENT, { detail: { key: seed.flag } }));
  } catch {
    // brak localStorage
  }
  return true;
}

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
