// Dane startowe Analityka wyników (XTB, LPP, Synektik, cyber_Folks, Grupa Kęty, Digital Network – niżej) + starsze okresy (EXTRA_HISTORY). XTB, Q1–Q3 2026 – wyniki vs konsensus PAP Biznes (tabele przekazane przez
// użytkownika). Wartości sprzed roku i z Q4 2025 wyliczone z podanych zmian r/r i q/q, EBITDA Q1 2026 z narastającej
// EBITDA (YTD). Przychody Q3 2026 – z pełnej tabeli (wersja 2 danych; wcześniej szacunek z marż ≈ 623 mln zł).
// Dopisywane do bazy użytkownika jednorazowo (flaga), dalej historia buduje się z kolejnych analiz.
import { PREFS_CHANGED_EVENT } from './budget.js';
import { companyKey, earningsKey, readEarnings, readHistory, recordHistory, saveEarnings, writeHistory } from './earnings.js';

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

// Synektik (rok obrotowy X–IX, np. Q1 2025/26 = X–XII 2025): Q1–Q3 2025/26 vs konsensus PAP Biznes (tabele użytkownika).
// Okresy sprzed roku – ze zmian r/r, Q4 2024/25 – z q/q w tabeli Q1. Zysk netto: tabela Q1 podaje zysk j.d. (35,0),
// tabele Q2 i Q3 – zysk z działalności kontynuowanej; dla spójnej linii w historii Q1 = 43,1 mln zł (z q/q i YTD),
// a w analizie Q1 zostaje wskaźnik „Zysk netto j.d.” 35,0 vs kons. 40,1.
const sntBase = { company: 'Synektik', ticker: 'SNT', industry: 'Technologie medyczne (sprzęt medyczny, robotyka chirurgiczna, radiofarmaceutyki)', currency: 'PLN', unit: 'mln PLN', basis: 'consensus', outlook: '', risks: [] };
export const SNT_SEED = [
  {
    ...sntBase,
    quarter: 'Q1 2025/26',
    periodEnd: '2025-12-31',
    verdict: 'miss',
    headline: 'Q1 2025/26 poniżej konsensusu: przychody 228,0 mln zł (−4,1%), zysk netto j.d. 35,0 mln zł (−12,6%), EBITDA blisko oczekiwań (−0,9%).',
    metrics: [m('Przychody', 228.0, 237.8, 203.2), m('EBITDA', 59.8, 60.4, 50.5), m('EBIT', 54.0, 56.2, 45.7), m('Zysk netto j.d.', 35.0, 40.1, 33.1), m('Marża EBITDA', 26.2, 25.1, 24.83, '%'), m('Marża EBIT', 23.7, 23.6, 22.51, '%'), m('Marża netto', 15.4, 16.9, 16.34, '%')],
    quarters: [
      { quarter: 'Q1 2024/25', revenue: 203.2, netIncome: 33.1, ebitda: 50.5, eps: null },
      { quarter: 'Q4 2024/25', revenue: 199.1, netIncome: 30.9, ebitda: 54.6, eps: null },
      { quarter: 'Q1 2025/26', revenue: 228.0, netIncome: 43.1, ebitda: 59.8, eps: null },
    ],
    highlights: ['Przychody +12,2% r/r i +14,5% q/q', 'EBITDA +18,4% r/r, EBIT +18,2% r/r (działalność kontynuowana)', 'Zysk netto j.d. +5,7% r/r, marża netto 15,4% (−1,6 p.p. vs konsensus)', 'Rok obrotowy X–IX: Q1 2025/26 = październik–grudzień 2025'],
  },
  {
    ...sntBase,
    quarter: 'Q2 2025/26',
    periodEnd: '2026-03-31',
    verdict: 'beat',
    headline: 'Q2 2025/26 powyżej konsensusu: zysk netto 39,8 mln zł (+7,5%), EBIT 53,7 mln zł (+6,4%) przy przychodach 213,2 mln zł zgodnych z oczekiwaniami (−1,2%).',
    metrics: [m('Przychody', 213.2, 215.8, 124.7), m('EBITDA', 58.2, 56.2, 30.3), m('EBIT', 53.7, 50.4, 25.5), m('Zysk netto', 39.8, 37.0, 18.6), m('Marża EBITDA', 27.5, 26.0, 24.42, '%'), m('Marża EBIT', 25.2, 23.4, 20.38, '%'), m('Marża netto', 18.7, 17.1, 14.94, '%')],
    quarters: [
      { quarter: 'Q2 2024/25', revenue: 124.7, netIncome: 18.6, ebitda: 30.3, eps: null },
      { quarter: 'Q1 2025/26', revenue: 228.0, netIncome: 43.1, ebitda: 59.8, eps: null },
      { quarter: 'Q2 2025/26', revenue: 213.2, netIncome: 39.8, ebitda: 58.2, eps: null },
    ],
    highlights: ['Przychody +71% r/r, −6,5% q/q', 'EBITDA +92% r/r, EBIT +111% r/r, zysk netto +114% r/r', 'Narastająco H1 2025/26: przychody 441,2 mln zł (+35%), EBITDA 118,3 mln zł (+46%), zysk netto 82,9 mln zł (+50%)', 'Marża EBIT 25,2% (+1,8 p.p. vs konsensus)'],
  },
  {
    ...sntBase,
    quarter: 'Q3 2025/26',
    periodEnd: '2026-06-30',
    verdict: 'beat',
    headline: 'Q3 2025/26 powyżej konsensusu: przychody 292,3 mln zł (+4,8%) i zysk netto 55,1 mln zł (+5,4%); marże EBITDA i EBIT nieco niższe od oczekiwań.',
    metrics: [m('Przychody', 292.3, 279.0, 154.2), m('EBITDA', 71.5, 70.7, 41.6), m('EBIT', 66.1, 65.8, 36.4), m('Zysk netto', 55.1, 52.2, 30.6), m('Marża EBITDA', 24.5, 25.3, 27.0, '%'), m('Marża EBIT', 22.6, 23.6, 23.6, '%'), m('Marża netto', 18.8, 18.7, 19.76, '%')],
    quarters: [
      { quarter: 'Q3 2024/25', revenue: 154.2, netIncome: 30.6, ebitda: 41.6, eps: null },
      { quarter: 'Q2 2025/26', revenue: 213.2, netIncome: 39.8, ebitda: 58.2, eps: null },
      { quarter: 'Q3 2025/26', revenue: 292.3, netIncome: 55.1, ebitda: 71.5, eps: null },
    ],
    highlights: ['Przychody +89,5% r/r i +37,1% q/q', 'EBITDA +71,9% r/r, EBIT +81,5% r/r, zysk netto (dz. kontynuowana) +80,3% r/r', 'Narastająco 2025/26 (3 kwartały): przychody 733,4 mln zł (+52,1%), EBITDA 189,6 mln zł (+54,7%), zysk netto 138,0 mln zł (+61,0%)', 'Marża EBITDA 24,5% (−0,8 p.p. vs konsensus), marża EBIT 22,6% (−1,0 p.p.)'],
  },
];

// cyber_Folks (CBF): Q1 i Q2 2026 z raportów kwartalnych spółki (PDF od użytkownika) – bez konsensusu, ocena r/r.
// EBITDA skorygowana = główny wskaźnik spółki (bez ESOP, kosztów transakcyjnych i restrukturyzacji); EBITDA
// raportowana = EBIT + amortyzacja. Przychody Q1 2026 po korekcie (unettowienie PrestaShop, raport Q2): 243,0 mln zł
// (w raporcie Q1: 245,3). Q4 2025 – brak danych za Q3 2025 w raportach, więc nie da się go wydzielić z wyników rocznych.
const yoy = (name, actual, previous, unit = 'mln PLN', lowerIsBetter = false) => {
  const d = unit === '%' ? actual - previous : previous ? (actual - previous) / Math.abs(previous) : null;
  const th = unit === '%' ? 0.5 : 0.02;
  const better = d === null ? null : lowerIsBetter ? -d : d;
  return { name, actual, consensus: null, previous, unit, lowerIsBetter, verdict: better === null ? 'unknown' : better > th ? 'beat' : better < -th ? 'miss' : 'inline' };
};
const cbfBase = { company: 'cyber_Folks', ticker: 'CBF', industry: 'Technologie internetowe: hosting i domeny, komunikacja (Vercom), e-commerce (Shoper, PrestaShop)', currency: 'PLN', unit: 'mln PLN', basis: 'yoy', verdict: 'unknown' };
export const CBF_SEED = [
  {
    ...cbfBase,
    quarter: 'Q1 2026',
    periodEnd: '2026-03-31',
    headline: 'Q1 2026: przychody 245,3 mln zł (+29% r/r), skorygowana EBITDA 83,1 mln zł (+35%), zysk netto j.d. 22,9 mln zł (+71%).',
    metrics: [
      yoy('Przychody', 245.3, 190.5), yoy('EBITDA skorygowana', 83.1, 61.8), yoy('EBITDA', 79.3, 56.8), yoy('EBIT', 62.9, 42.9), yoy('Zysk netto', 41.2, 27.8), yoy('Zysk netto j.d.', 22.9, 13.3), yoy('Marża EBITDA skor.', 33.9, 32.4, '%'),
      yoy('Vercom – przychody', 122.9, 110.8), yoy('Vercom – EBITDA skor.', 34.9, 28.8), yoy('E-commerce – przychody', 73.4, 35.5), yoy('E-commerce – EBITDA skor.', 23.8, 12.7), yoy('Segment cyber_Folks – przychody', 49.3, 44.4), yoy('Segment cyber_Folks – EBITDA skor.', 25.9, 21.7),
    ],
    quarters: [
      { quarter: 'Q1 2025', revenue: 190.5, netIncome: 13.3, ebitda: 61.8, eps: null },
      { quarter: 'Q1 2026', revenue: 245.3, netIncome: 22.9, ebitda: 83.1, eps: null },
    ],
    highlights: ['Wzrost organiczny w segmentach Vercom, cyber_Folks i E-commerce; konsolidacja PrestaShop, Sylius i BitBag od lutego 2026', 'E-commerce: przychody +107% r/r (73,4 mln zł), EBITDA skor. +87%', 'Koszty finansowe netto 12,5 mln zł (+56% r/r) – kredyt na zakup Shoper', 'Cały 2025: przychody 855,2 mln zł (+30%), EBITDA skor. 291,7 mln zł (+66%), marża ok. 34,1%', 'Na wykresach: EBITDA = skorygowana, zysk netto = przypadający akcjonariuszom jednostki dominującej'],
    risks: ['Koszty jednorazowe w Q1: ESOP 1,9 mln zł i transakcyjne 2,0 mln zł', 'Wyższe zadłużenie po przejęciach (koszty finansowe)'],
    outlook: '',
  },
  {
    ...cbfBase,
    quarter: 'Q2 2026',
    periodEnd: '2026-06-30',
    headline: 'Q2 2026: przychody 269,0 mln zł (+27% r/r), skorygowana EBITDA 88,3 mln zł (+23%); raportowany zysk netto j.d. −5,7 mln zł przez jednorazowe koszty, skorygowany 26,9 mln zł (+122%).',
    metrics: [
      yoy('Przychody', 269.0, 212.0), yoy('EBITDA skorygowana', 88.3, 72.0), yoy('EBITDA', 58.7, 68.8), yoy('EBIT', 40.5, 50.9), yoy('Zysk netto', 12.2, 27.9), yoy('Zysk netto j.d.', -5.7, 12.1), yoy('Zysk netto j.d. skorygowany', 26.9, 12.1), yoy('Marża EBITDA skor.', 32.8, 34.0, '%'),
      yoy('Vercom – przychody', 132.9, 114.1), yoy('Vercom – EBITDA skor.', 38.6, 32.8), yoy('E-commerce – przychody', 89.0, 54.5), yoy('E-commerce – EBITDA skor.', 26.9, 19.8), yoy('Segment cyber_Folks – przychody', 47.5, 43.7), yoy('Segment cyber_Folks – EBITDA skor.', 24.2, 20.7),
    ],
    quarters: [
      { quarter: 'Q2 2025', revenue: 212.0, netIncome: 12.1, ebitda: 72.0, eps: null },
      { quarter: 'Q1 2026', revenue: 243.0, netIncome: 22.9, ebitda: 83.1, eps: null },
      { quarter: 'Q2 2026', revenue: 269.0, netIncome: -5.7, ebitda: 88.3, eps: null },
    ],
    highlights: ['H1 2026: przychody 512,0 mln zł (+27% r/r), EBITDA skor. 171,4 mln zł (+28%)', 'Sprzedaż ponad 4,3 mln akcji Vercom (ponad 500 mln zł); cyber_Folks pozostaje największym akcjonariuszem (31%)', 'Koszty finansowe netto spadły do 9,5 mln zł (−42% r/r)', 'Przychody Q1 2026 po korekcie prezentacji PrestaShop: 243,0 mln zł (w raporcie Q1: 245,3)'],
    risks: ['Jednorazowo: podatek od sprzedaży akcji Vercom ujęty w wyniku 23,1 mln zł, restrukturyzacja PrestaShop 25,4 mln zł, odpis _Stores 1,6 mln zł', 'Marża EBITDA skor. 32,8% (−1,2 p.p. r/r) po konsolidacji PrestaShop'],
    outlook: '',
  },
];

// Grupa Kęty (KTY): Q1–Q3 2026 vs konsensus PAP Biznes (wyniki finalne z raportów; Q2 2026 – z wyników 9M minus Q1 i Q3,
// zgodne z raportem: EBITDA 379, zysk netto j.d. 241). Q1–Q3 2025 – z raportów (Q2 2025 z 9M 2025), Q4 2025 – szacunki
// spółki potwierdzone raportem rocznym. Konsensus PAP porównywano z szacunkami spółki; tu – z wynikami finalnymi.
const ktyBase = { company: 'Grupa Kęty', ticker: 'KTY', industry: 'Przemysł: aluminium (systemy aluminiowe, wyroby wyciskane) i opakowania giętkie', currency: 'PLN', unit: 'mln PLN', basis: 'consensus', outlook: '', risks: [] };
export const KTY_SEED = [
  {
    ...ktyBase,
    quarter: 'Q1 2026',
    periodEnd: '2026-03-31',
    verdict: 'beat',
    headline: 'Q1 2026: zysk netto j.d. 145 mln zł (+15,7% vs kons.) i EBITDA 257 mln zł (+10,4%) powyżej konsensusu przy przychodach 1374 mln zł poniżej (−3,2%).',
    metrics: [m('Przychody', 1374, 1419.8, 1354), m('EBITDA', 257, 232.8, 228), m('EBIT', 196, null, 169), m('Zysk netto j.d.', 145, 125.3, 121), m('Marża EBITDA', 18.7, null, 16.8, '%'), m('Marża EBIT', 14.3, null, 12.5, '%'), m('Marża netto', 10.6, null, 8.9, '%')],
    quarters: [
      { quarter: 'Q1 2025', revenue: 1354, netIncome: 121, ebitda: 228, eps: null },
      { quarter: 'Q4 2025', revenue: 1265, netIncome: 93, ebitda: 205, eps: null },
      { quarter: 'Q1 2026', revenue: 1374, netIncome: 145, ebitda: 257, eps: null },
    ],
    highlights: ['Przychody +1,5% r/r, EBITDA +12,7% r/r, zysk netto j.d. +19,8% r/r', 'Wynik finalny wyższy od szacunków spółki (zysk netto 132 → 145 mln zł, EBITDA 242 → 257 mln zł)', 'Q4 2025 (szacunki spółki): przychody 1265 mln zł, EBITDA 205 mln zł, zysk netto j.d. 93 mln zł'],
  },
  {
    ...ktyBase,
    quarter: 'Q2 2026',
    periodEnd: '2026-06-30',
    verdict: 'beat',
    headline: 'Q2 2026 wyraźnie powyżej konsensusu: zysk netto j.d. 241 mln zł (+14,3% vs kons.), EBITDA 379 mln zł (+11,5%).',
    metrics: [m('Przychody', 1654, null, 1442), m('EBITDA', 379, 340, 295), m('EBIT', 318, null, 235), m('Zysk netto j.d.', 241, 210.8, 169), m('Marża EBITDA', 22.9, null, 20.5, '%'), m('Marża EBIT', 19.2, null, 16.3, '%'), m('Marża netto', 14.6, null, 11.7, '%')],
    quarters: [
      { quarter: 'Q2 2025', revenue: 1442, netIncome: 169, ebitda: 295, eps: null },
      { quarter: 'Q1 2026', revenue: 1374, netIncome: 145, ebitda: 257, eps: null },
      { quarter: 'Q2 2026', revenue: 1654, netIncome: 241, ebitda: 379, eps: null },
    ],
    highlights: ['Przychody +14,7% r/r, EBITDA +28,5% r/r, EBIT +35,3% r/r, zysk netto j.d. +42,6% r/r', 'Wynik finalny powyżej szacunków spółki (zysk netto 234 → 241 mln zł, EBITDA 375 → 379 mln zł)'],
  },
  {
    ...ktyBase,
    quarter: 'Q3 2026',
    periodEnd: '2026-09-30',
    verdict: 'beat',
    headline: 'Q3 2026 zgodnie z oczekiwaniami / lekko powyżej: przychody 1635 mln zł (+4,1% vs kons.), zysk netto j.d. 208 mln zł (+4,1%), EBITDA 331 mln zł (+1,7%).',
    metrics: [m('Przychody', 1635, 1570, 1447), m('EBITDA', 331, 325.5, 294), m('EBIT', 270, null, 234), m('Zysk netto j.d.', 208, 199.8, 176), m('Marża EBITDA', 20.2, null, 20.3, '%'), m('Marża EBIT', 16.5, null, 16.2, '%'), m('Marża netto', 12.7, null, 12.2, '%')],
    quarters: [
      { quarter: 'Q3 2025', revenue: 1447, netIncome: 176, ebitda: 294, eps: null },
      { quarter: 'Q2 2026', revenue: 1654, netIncome: 241, ebitda: 379, eps: null },
      { quarter: 'Q3 2026', revenue: 1635, netIncome: 208, ebitda: 331, eps: null },
    ],
    highlights: ['Przychody +13,0% r/r, EBITDA +12,6% r/r, zysk netto j.d. +18,2% r/r', 'Narastająco 9M 2026: przychody 4663 mln zł (+9,9%), EBITDA 967 mln zł (+18,4%), zysk netto j.d. 594 mln zł (+27,5%)', 'Wynik finalny powyżej szacunków spółki (zysk netto 201 → 208 mln zł)'],
  },
];

// Digital Network (DIG): Q1–Q2 2026 z raportów (komunikaty spółki), Q3 2026 – wstępne przychody (pełny raport 30.11.2026 –
// dodaj go zwykłą analizą, nadpisze ten wpis). Brak konsensusu PAP dla spółki – ocena r/r. Q1 2025 EBITDA / EBIT z dynamik
// r/r, Q2 2025 zysk netto z wyników H1 2025 (H1 2026 / 1,62), Q4 2025 przychody = 2025 (112,92) − 9M 2025 (56,7).
const digBase = { company: 'Digital Network', ticker: 'DIG', industry: 'Reklama zewnętrzna DOOH (cyfrowe nośniki) i Premium Outdoor (Braughman Group)', currency: 'PLN', unit: 'mln PLN', basis: 'yoy', verdict: 'unknown' };
export const DIG_SEED = [
  {
    ...digBase,
    quarter: 'Q1 2026',
    periodEnd: '2026-03-31',
    headline: 'Q1 2026: przychody 42,9 mln zł (+179% r/r), EBITDA 22,6 mln zł (+165%), zysk netto j.d. 6,7 mln zł (+43%) – efekt przejęcia Braughman (2 miesiące konsolidacji).',
    metrics: [yoy('Przychody', 42.9, 15.4), yoy('EBITDA', 22.6, 8.5), yoy('EBIT', 13.0, 5.5), yoy('Zysk netto j.d.', 6.7, 4.7), yoy('Marża EBITDA', 52.7, 55.2, '%'), yoy('Marża netto', 15.6, 30.5, '%')],
    quarters: [
      { quarter: 'Q1 2025', revenue: 15.4, netIncome: 4.7, ebitda: 8.5, eps: null },
      { quarter: 'Q4 2025', revenue: 56.2, netIncome: null, ebitda: null, eps: null },
      { quarter: 'Q1 2026', revenue: 42.9, netIncome: 6.7, ebitda: 22.6, eps: null },
    ],
    highlights: ['Konsolidacja Premium Outdoor (Braughman) – niższa marża segmentu i wyższe koszty finansowe obniżyły rentowność r/r', 'Cały 2025: przychody 112,9 mln zł (+51%), EBITDA 66,9 mln zł (+53%), EBIT 50,5 mln zł (+59%), zysk netto j.d. 37,6 mln zł (+50%)'],
    risks: ['Marża netto 15,6% wobec 30,5% rok wcześniej (koszty finansowania przejęcia)'],
    outlook: 'Zarząd zapowiadał ambitne plany na 2026 r. i istotny wzrost wyników w 2027 r.',
  },
  {
    ...digBase,
    quarter: 'Q2 2026',
    periodEnd: '2026-06-30',
    headline: 'Q2 2026: przychody 60,8 mln zł (+197% r/r), EBITDA 38,2 mln zł (+196%), zysk netto j.d. 13,0 mln zł (+73%).',
    metrics: [yoy('Przychody', 60.8, 20.5), yoy('EBITDA', 38.2, 12.9), yoy('Zysk netto j.d.', 13.0, 7.5), yoy('Marża EBITDA', 62.9, 63.1, '%'), yoy('Marża netto', 21.4, 36.6, '%')],
    quarters: [
      { quarter: 'Q2 2025', revenue: 20.5, netIncome: 7.5, ebitda: 12.9, eps: null },
      { quarter: 'Q1 2026', revenue: 42.9, netIncome: 6.7, ebitda: 22.6, eps: null },
      { quarter: 'Q2 2026', revenue: 60.8, netIncome: 13.0, ebitda: 38.2, eps: null },
    ],
    highlights: ['H1 2026: przychody 103,7 mln zł (+189% r/r), EBITDA 60,9 mln zł (+183%), zysk netto j.d. 19,7 mln zł (+62%)', 'Marża EBITDA utrzymana ok. 63% mimo konsolidacji Braughman'],
    risks: ['Zysk netto rośnie wolniej niż EBITDA – wyższe koszty finansowe i amortyzacja po przejęciu'],
    outlook: '',
  },
  {
    ...digBase,
    quarter: 'Q3 2026',
    periodEnd: '2026-09-30',
    headline: 'Q3 2026 (wstępnie): przychody 53,0 mln zł (+154% r/r); pełne wyniki w raporcie 30.11.2026.',
    metrics: [yoy('Przychody', 53.0, 20.9)],
    quarters: [
      { quarter: 'Q3 2025', revenue: 20.9, netIncome: null, ebitda: null, eps: null },
      { quarter: 'Q2 2026', revenue: 60.8, netIncome: 13.0, ebitda: 38.2, eps: null },
      { quarter: 'Q3 2026', revenue: 53.0, netIncome: null, ebitda: null, eps: null },
    ],
    highlights: ['Narastająco 9M 2026: przychody 156,7 mln zł (+176% r/r)', 'Zarząd podtrzymuje zapowiedzi na cały 2026 r. mimo niższej dynamiki q/q', 'Wstępny szacunek przychodów – EBITDA i zysk netto po publikacji raportu'],
    risks: ['Przychody −12,8% q/q po rekordowym Q2'],
    outlook: '',
  },
];

// Starsze okresy (tylko liczby w historii, bez pełnych analiz) – źródła publiczne: komunikaty spółek i tabele PAP Biznes
const P = (quarter, revenue, ebitda, netIncome, metrics) => ({ quarter, revenue, ebitda, netIncome, metrics });
const EXTRA_HISTORY = {
  XTB: [
    P('Q1 2024', 556.0, 355.7, 302.8, { Przychody: 556.0, EBIT: 351.0, 'Zysk netto j.d.': 302.8, 'Marża EBIT': [63.1, '%'], 'Marża netto': [54.5, '%'] }),
    P('Q2 2024', 382.1, null, 160.3, { Przychody: 382.1, EBIT: 176.7, 'Zysk netto j.d.': 160.3, 'Marża EBIT': [46.2, '%'], 'Marża netto': [42.0, '%'] }),
    P('Q3 2024', 470.2, null, 203.8, { Przychody: 470.2, EBIT: 261.7, 'Zysk netto j.d.': 203.8, 'Marża EBIT': [55.7, '%'], 'Marża netto': [43.3, '%'] }),
    P('Q4 2024', 465.4, 205.8, 192.6, { Przychody: 465.4, EBITDA: 205.8, EBIT: 200.7, 'Zysk netto j.d.': 192.6, 'Marża EBIT': [43.1, '%'], 'Marża netto': [41.4, '%'] }),
  ],
  LPP: [
    P('Q1 2024', 4306, 795, 276, { Przychody: 4306, EBITDA: 795, EBIT: 411, 'Zysk netto j.d.': 276, 'Marża EBITDA': [18.5, '%'], 'Marża EBIT': [9.5, '%'], 'Marża netto': [6.4, '%'] }),
    P('Q2 2024', 5005, 1018, 444, { Przychody: 5005, EBITDA: 1018, EBIT: 611, 'Zysk netto j.d.': 444, 'Marża EBITDA': [20.3, '%'], 'Marża EBIT': [12.2, '%'], 'Marża netto': [8.9, '%'] }),
    P('Q3 2024', 5212, 1157, 579, { Przychody: 5212, EBITDA: 1157, EBIT: 731, 'Zysk netto j.d.': 579, 'Marża EBITDA': [22.2, '%'], 'Marża EBIT': [14.0, '%'], 'Marża netto': [11.1, '%'] }),
  ],
  SNT: [
    P('Q1 2023/24', 271.3, null, 34.7, { Przychody: 271.3, 'EBITDA znormalizowana': 53.2, 'Zysk netto j.d.': 34.7 }),
    P('Q2 2023/24', 87.7, null, 12.2, { Przychody: 87.7, 'EBITDA znormalizowana': 25.6, 'Zysk netto j.d.': 12.2 }),
    P('Q3 2023/24', 124.0, null, 16.7, { Przychody: 124.0, 'EBITDA znormalizowana': 32.4, 'Zysk netto j.d.': 16.7 }),
    P('Q4 2023/24', 141.8, null, 21.0, { Przychody: 141.8, 'EBITDA znormalizowana': 35.2, 'Zysk netto j.d.': 21.0 }),
  ],
  // Digital Network: Q3 2025 z raportu kwartalnego (przychody, EBIT, zysk netto j.d.; EBITDA = 9M 34,9 − H1 21,5),
  // Q4 2025 = cały 2025 − 9M 2025 (przychody 112,92 − 56,74; EBITDA 66,91 − 34,9; EBIT 50,52 − 25,8; zysk j.d. 37,61 − 20,4).
  // 2024: Q1 – komunikat spółki; Q2 EBITDA = 9M 2024 (27,0) − Q1 − Q3; Q3 – raport kwartalny + tabela DM BOŚ (zysk j.d. po udziałach
  // mniejszości 6,5); Q4 przychody i EBITDA – tabela DM BOŚ, zysk j.d. = 2024 (25,15) − 9M. Kontrola: Σ przychodów 74,7, Σ EBITDA 43,7 = rok 2024
  DIG: [
    P('Q1 2024', 12.4, 6.0, 2.9, { Przychody: 12.4, EBITDA: 6.0, EBIT: 3.2, 'Zysk netto j.d.': 2.9, 'Marża EBITDA': [48.4, '%'], 'Marża netto': [23.4, '%'] }),
    P('Q2 2024', 16.4, 9.7, 5.4, { Przychody: 16.4, EBITDA: 9.7, 'Zysk netto j.d.': 5.4, 'Marża EBITDA': [59.1, '%'], 'Marża netto': [32.9, '%'] }),
    P('Q3 2024', 18.6, 11.4, 6.5, { Przychody: 18.6, EBITDA: 11.4, EBIT: 8.3, 'Zysk netto j.d.': 6.5, 'Marża EBITDA': [61.0, '%'], 'Marża netto': [34.9, '%'] }),
    P('Q4 2024', 27.3, 16.7, 10.4, { Przychody: 27.3, EBITDA: 16.7, 'Zysk netto j.d.': 10.4, 'Marża EBITDA': [61.2, '%'], 'Marża netto': [38.1, '%'] }),
    P('Q3 2025', 20.9, 13.4, 8.3, { Przychody: 20.9, EBITDA: 13.4, EBIT: 10.5, 'Zysk netto j.d.': 8.3, 'Marża EBITDA': [64.2, '%'], 'Marża netto': [39.6, '%'] }),
    P('Q4 2025', 56.2, 32.0, 17.2, { Przychody: 56.2, EBITDA: 32.0, EBIT: 24.7, 'Zysk netto j.d.': 17.2, 'Marża EBITDA': [57.0, '%'], 'Marża netto': [30.6, '%'] }),
  ],
  // cyber_Folks 2024: raporty kwartalne i komunikaty spółki/PAP Biznes; Q3 2024 przychody = 2024 (657,0) − Q1 − Q2 − Q4,
  // EBITDA skor. Q3 2024 = 2024 (176,0) − pozostałe kwartały; zysk netto j.d. Q3 2024 znormalizowany (raportowany 62,3 – sprzedaż Profitroom)
  CBF: [
    P('Q1 2024', 144.0, 40.0, 16.0, { Przychody: 144.0, 'EBITDA skorygowana': 40.0, EBIT: 30.8, 'Zysk netto j.d.': 16.0 }),
    P('Q2 2024', 154.0, 42.0, 17.8, { Przychody: 154.0, 'EBITDA skorygowana': 42.0, 'Zysk netto j.d.': 17.8 }),
    P('Q3 2024', 185.8, 45.8, 17.1, { Przychody: 185.8, 'EBITDA skorygowana': 45.8, EBITDA: 41.1, EBIT: 32.3, 'Zysk netto j.d.': 17.1 }),
    P('Q4 2024', 173.2, 48.2, 21.0, { Przychody: 173.2, 'EBITDA skorygowana': 48.2, EBIT: 38.2, 'Zysk netto j.d.': 21.0 }),
    P('Q3 2025', 215.9, 75.5, 13.7, { Przychody: 215.9, 'EBITDA skorygowana': 75.5, EBITDA: 69.9, 'Zysk netto j.d.': 13.7 }),
    P('Q4 2025', 236.7, 82.4, 24.2, { Przychody: 236.7, 'EBITDA skorygowana': 82.4, 'Zysk netto j.d.': 24.2 }),
  ],
};
// Wersja starszych okresów per spółka – podbicie dopisuje nowe okresy także u użytkowników, którzy mieli już poprzednią wersję
const EXTRA_VERSION = { CBF: 2, DIG: 2 };
const extraFlag = (key) => `wealth-app-earnings-extra-${key.toLowerCase()}-v${EXTRA_VERSION[key] || 1}`;
function recordExtras(key) {
  const seed = COMPANY_SEEDS.find((c) => c.key === key);
  const extra = EXTRA_HISTORY[key];
  if (!seed || !extra) return false;
  const first = seed.data[0];
  for (const e of extra) {
    recordHistory({
      company: first.company,
      ticker: first.ticker,
      industry: first.industry,
      unit: first.unit,
      quarter: e.quarter,
      quarters: [{ quarter: e.quarter, revenue: e.revenue, ebitda: e.ebitda, netIncome: e.netIncome, eps: null }],
      metrics: Object.entries(e.metrics).map(([name, v]) => ({ name, actual: Array.isArray(v) ? v[0] : v, previous: null, unit: Array.isArray(v) ? v[1] : 'mln PLN' })),
    });
  }
  try {
    localStorage.setItem(extraFlag(key), new Date().toISOString());
  } catch {
    // brak localStorage
  }
  return true;
}
const extraDone = (key) => {
  try {
    return !!localStorage.getItem(extraFlag(key));
  } catch {
    return true;
  }
};
// Dopisanie starszych okresów u użytkowników, którzy dane startowe wczytali wcześniej (jednorazowo na spółkę)
export function applyExtras() {
  const hist = readHistory();
  let changed = false;
  for (const key of Object.keys(EXTRA_HISTORY)) {
    if (!hist[key] || extraDone(key)) continue;
    preserveOwn(key, () => {
      changed = recordExtras(key) || changed;
    });
  }
  return changed;
}

// Rejestr danych startowych (dowolna liczba spółek): każda ma własną flagę „wczytane” per użytkownik
export const COMPANY_SEEDS = [
  { key: 'XTB', label: 'XTB (Q1–Q3 2026 vs konsensus)', flag: SEED_KEY, data: XTB_SEED },
  { key: 'LPP', label: 'LPP (Q4 2025 – Q2 2026 vs konsensus)', flag: 'wealth-app-earnings-seed-lpp-v1', data: LPP_SEED },
  { key: 'SNT', label: 'Synektik (Q1–Q3 2025/26 vs konsensus)', flag: 'wealth-app-earnings-seed-snt-v1', data: SNT_SEED },
  { key: 'CBF', label: 'cyber_Folks (Q1–Q2 2026, raporty kwartalne)', flag: 'wealth-app-earnings-seed-cbf-v1', data: CBF_SEED },
  { key: 'KTY', label: 'Grupa Kęty (Q1–Q3 2026 vs konsensus)', flag: 'wealth-app-earnings-seed-kty-v1', data: KTY_SEED },
  { key: 'DIG', label: 'Digital Network (Q1–Q3 2026, raporty spółki)', flag: 'wealth-app-earnings-seed-dig-v1', data: DIG_SEED },
];
const flagSet = (flag) => {
  try {
    return !!localStorage.getItem(flag);
  } catch {
    return true;
  }
};
// Spółki z danymi startowymi do zaproponowania: nie wczytane wcześniej i bez historii w bazie użytkownika
// Spółki z danymi startowymi do wczytania: wystarczy, że nie były wczytane wcześniej – własna historia spółki nie blokuje
// (dane startowe są dołączane do niej, a Twoje analizy i liczby mają pierwszeństwo – mergeSeed)
export const availableSeeds = () => COMPANY_SEEDS.filter((c) => !flagSet(c.flag)).map(({ key, label }) => ({ key, label }));

// Nałożenie Twoich danych na dane startowe: zapisana wartość (nie-null) i Twoje wskaźniki mają pierwszeństwo
function overlay(seedP = {}, ownP = {}) {
  const out = { ...seedP, ...Object.fromEntries(Object.entries(ownP).filter(([k, v]) => k !== 'metrics' && v !== null && v !== undefined)) };
  out.metrics = { ...(seedP.metrics || {}), ...(ownP.metrics || {}) };
  return out;
}
// Wykonanie zapisu danych startowych z ochroną Twojej historii spółki (okresy sprzed zapisu nakładane z powrotem)
function preserveOwn(key, fn) {
  const before = readHistory()[key];
  fn();
  if (!before) return;
  const all = readHistory();
  const c = all[key];
  if (!c) return;
  for (const [q, p] of Object.entries(before.periods || {})) c.periods[q] = overlay(c.periods[q], p);
  all[key] = { ...c, company: before.company || c.company, ticker: before.ticker || c.ticker, industry: before.industry || c.industry, unit: before.unit || c.unit };
  writeHistory(all);
}
// Zapis analiz startowych z pominięciem kwartałów, które masz z własnej analizy (Twoja analiza nie jest nadpisywana)
function saveSeedAnalyses(key, data, now) {
  const own = new Set(readEarnings().filter((e) => companyKey(e.analysis) === key && e.model !== SEED_MODEL).map((e) => e.key));
  data.forEach((analysis, i) => {
    if (!own.has(earningsKey(analysis))) saveEarnings({ analysis, sources: [], grounded: false, model: SEED_MODEL }, now - (data.length - i) * 1000);
    else recordHistory(analysis, now); // tylko liczby w historii – uzupełnią braki, Twoje wartości wrócą w preserveOwn
  });
}
export function applySeed(key, now = Date.now()) {
  if (key === 'XTB') return applyXtbSeed(now);
  const seed = COMPANY_SEEDS.find((c) => c.key === key);
  if (!seed || !availableSeeds().some((c) => c.key === key)) return false;
  preserveOwn(key, () => {
    saveSeedAnalyses(key, seed.data, now);
    if (!extraDone(key)) recordExtras(key);
  });
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
export const seedAvailable = () => !done();
export function applyXtbSeed(now = Date.now()) {
  if (!seedAvailable()) return false;
  preserveOwn('XTB', () => {
    saveSeedAnalyses('XTB', XTB_SEED, now);
    if (!extraDone('XTB')) recordExtras('XTB');
  });
  setVersion();
  try {
    localStorage.setItem(SEED_KEY, new Date(now).toISOString());
    window.dispatchEvent(new CustomEvent(PREFS_CHANGED_EVENT, { detail: { key: SEED_KEY } }));
  } catch {
    // brak localStorage
  }
  return true;
}
