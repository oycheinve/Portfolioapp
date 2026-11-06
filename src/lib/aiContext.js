// Kontekst portfela dla podsumowań AI (Newsy): aktywne spółki i ETF-y z portfela inwestycyjnego – ticker, nazwa,
// sektor, udział w portfelu (%), stopa dywidendy i najbliższa dywidenda. Bez kwot w zł i bez poduszki finansowej;
// konto „IKE - Julka” nie jest częścią stanu portfela, więc nigdy tu nie trafia.
import { isSafeAccount, isoDay, livePriceLookup, valuePortfolio } from './engine.js';
import { dividendPositions } from './dividends.js';

// Sektory popularnych spółek (import XTB nie podaje sektora) – zapas, gdy instrument nie ma własnego
const SECTORS = {
  PKO: 'Banki', PEO: 'Banki', SPL: 'Banki', MBK: 'Banki', ING: 'Banki', MIL: 'Banki', ALR: 'Banki', BHW: 'Banki', PKN: 'Paliwa i energetyka (Orlen)',
  PZU: 'Ubezpieczenia', LPP: 'Handel – odzież', DNP: 'Handel – spożywczy', PCO: 'Handel – dyskonty', ALE: 'E-commerce', CCC: 'Handel – obuwie',
  KGH: 'Górnictwo – miedź', JSW: 'Górnictwo – węgiel koksowy', KTY: 'Przemysł – aluminium', CDR: 'Gry wideo', TEN: 'Gry wideo', PGE: 'Energetyka',
  TPE: 'Energetyka', ENA: 'Energetyka', OPL: 'Telekomunikacja', CPS: 'Telekomunikacja i media', KRU: 'Windykacja', BDX: 'Budownictwo',
  DIG: 'IT – centra danych', ACP: 'IT – oprogramowanie', ATT: 'Chemia – nawozy', XTB: 'Finanse – dom maklerski', GPW: 'Finanse – giełda',
  PEP: 'Energetyka odnawialna', BFT: 'IT – oprogramowanie', ZAB: 'Handel – spożywczy', ASB: 'Handel – motoryzacja', DOM: 'Deweloperzy', DVL: 'Deweloperzy',
};
const pct = (v) => Math.round(v * 1000) / 10;

export function portfolioContext(state, today = isoDay(new Date())) {
  try {
    const v = valuePortfolio(state, { asOf: today, accountIds: null, priceLookup: livePriceLookup(state) });
    const invest = v.positions.filter((p) => p.instrument && !isSafeAccount(p.account) && p.value > 0);
    const total = invest.reduce((s, p) => s + p.value, 0);
    if (!(total > 0)) return [];
    const yields = {};
    for (const p of dividendPositions(state, today)) if (p.instrument && p.yield > 0) yields[p.instrumentId] = p.yield;
    const next = {};
    for (const it of state.dividendSchedule || []) {
      const d = it.payDate || it.exDate;
      if (!it.instrumentId || !d || d < today || it.estimated) continue;
      if (!next[it.instrumentId] || d < next[it.instrumentId].date) next[it.instrumentId] = { date: d, exDate: it.exDate, dps: Number(it.dps) || 0, currency: it.currency || 'PLN' };
    }
    const byInst = new Map();
    for (const p of invest) byInst.set(p.instrumentId, { inst: p.instrument, value: (byInst.get(p.instrumentId)?.value || 0) + p.value });
    return [...byInst.entries()]
      .map(([id, { inst, value }]) => {
        const ticker = String(inst.ticker || '').toUpperCase().replace(/\.(PL|WA|US|DE|UK)$/, '');
        const n = next[id];
        return {
          ticker,
          name: String(inst.name || ticker).slice(0, 60),
          sector: String(inst.sector || SECTORS[ticker] || (inst.kind === 'ETF' ? 'ETF' : '')).slice(0, 40),
          kind: inst.kind === 'ETF' ? 'ETF' : 'akcje',
          weight: pct(value / total),
          ...(yields[id] ? { dividendYield: pct(yields[id]) } : {}),
          ...(n ? { nextDividend: `${n.dps ? `${n.dps} ${n.currency}/akcję, ` : ''}${n.exDate ? `dzień dywidendy ${n.exDate}, ` : ''}wypłata ${n.date}` } : {}),
        };
      })
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 30);
  } catch {
    return []; // brak kontekstu – podsumowanie ogólne jak dotąd
  }
}

// Skrót składu portfela do klucza pamięci podsumowań (zmiana spółek = nowe podsumowanie; zmiana wag – nie)
export function portfolioKey(ctx) {
  const s = ctx.map((c) => c.ticker).sort().join(',');
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
