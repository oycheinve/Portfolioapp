// Automatyczne dane dywidend: historia z Yahoo Finance (dni dywidendy i kwoty na akcję) albo – bez dostępu
// do Yahoo – prognoza na podstawie wypłat z rejestru. Tworzy wpisy harmonogramu i (opcjonalnie) księguje wypłaty.
import { computeHoldings, isoDay } from './engine.js';
import { bookingEntries, dividendHistory, scheduleStatus, sharesAt } from './dividends.js';
import { fetchYahooDividends } from './prices.js';
import { mapLimited, yahooSymbolFor } from './yahooFetch.js';

const DAY = 86400000;

function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDay(new Date(y, m - 1, d + n));
}

function addYears(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDay(new Date(y + n, m - 1, d));
}

function daysApart(a, b) {
  return Math.abs((new Date(a) - new Date(b)) / DAY);
}

// Instrumenty, które posiadamy lub posiadaliśmy (z symbolem Yahoo)
export function dividendInstruments(state) {
  const ids = new Set(computeHoldings(state, isoDay(new Date()), null).map((h) => h.instrumentId));
  return state.instruments.filter((i) => ids.has(i.id));
}

export async function fetchDividendHistories(state) {
  const out = {};
  const log = [];
  if (state.settings.priceMode === 'mock') return { histories: out, log: [{ level: 'info', message: 'Tryb symulacji – prognoza z historii wypłat' }] };
  await mapLimited(
    dividendInstruments(state).filter((i) => yahooSymbolFor(i)),
    3,
    async (inst) => {
      try {
        out[inst.id] = await fetchYahooDividends(yahooSymbolFor(inst), state.settings.corsProxy);
      } catch (e) {
        log.push({ level: 'warn', message: `${inst.ticker}: ${e.message}` });
      }
    },
  );
  return { histories: out, log };
}

function hasNearby(list, instrumentId, date, days) {
  return list.some((s) => s.instrumentId === instrumentId && s.exDate && daysApart(s.exDate, date) <= days);
}

// Plan synchronizacji (czysta funkcja): nowe wpisy harmonogramu + księgowania
export function planDividendSync(state, histories, { autoBook = false, today = isoDay(new Date()) } = {}) {
  const schedule = [...state.dividendSchedule];
  const newItems = [];
  // Deterministyczne id (instrument + dzień dywidendy) – ponowna synchronizacja nie tworzy duplikatów
  const id = (inst, exDate, kind) => `dauto_${inst.id}_${exDate}_${kind}`;
  const horizon = addDays(today, 400);

  for (const inst of dividendInstruments(state)) {
    const firstBuy = state.trades.filter((t) => t.instrumentId === inst.id && t.side === 'BUY').reduce((m, t) => (!m || t.date < m ? t.date : m), null);
    const h = histories[inst.id];
    // Yahoo bez kwot (puste stawki) → prognoza z rejestru wypłat, jak przy braku Yahoo
    const yahooEvents = (h?.events || []).filter((e) => Number(e.amount) > 0 && e.exDate);
    if (yahooEvents.length) {
      // 1) Dywidendy z Yahoo, których nie ma w rejestrze: sztuki posiadane w dniu przed dniem dywidendy
      for (const ev of yahooEvents) {
        if (!firstBuy || ev.exDate <= firstBuy || ev.exDate > today) continue;
        const held = Object.values(sharesAt(state, inst.id, addDays(ev.exDate, -1))).reduce((s, q) => s + q, 0);
        if (held <= 0) continue;
        const paid = state.income.some((i) => i.type === 'DIVIDEND' && i.instrumentId === inst.id && i.date >= addDays(ev.exDate, -5) && i.date <= addDays(ev.exDate, 90));
        if (paid || hasNearby([...schedule, ...newItems], inst.id, ev.exDate, 10)) continue;
        newItems.push({ id: id(inst, ev.exDate, 'y'), instrumentId: inst.id, dps: ev.amount, currency: h.currency || inst.currency, exDate: ev.exDate, payDate: addDays(ev.exDate, 14), payDateEstimated: true, withholdingPct: 0, source: 'YAHOO', note: 'Dane z Yahoo Finance' });
      }
      // 2) Prognoza: powtórzenie wypłat z ostatnich 13 miesięcy za rok, z ostatnią kwotą
      const recent = yahooEvents.filter((e) => e.exDate > addDays(today, -395) && e.exDate <= today);
      for (const ev of recent) {
        const next = addYears(ev.exDate, 1);
        if (next <= today || next > horizon || hasNearby([...schedule, ...newItems], inst.id, next, 30)) continue;
        newItems.push({ id: id(inst, next, 'f'), instrumentId: inst.id, dps: ev.amount, currency: h.currency || inst.currency, exDate: next, payDate: addDays(next, 14), payDateEstimated: true, estimated: true, withholdingPct: 0, source: 'YAHOO', note: 'Prognoza na podstawie dywidendy sprzed roku (Yahoo)' });
      }
    } else {
      // Bez Yahoo: prognoza z rejestru przychodów (DPS w PLN z ostatnich wypłat)
      const hist = dividendHistory(state, inst.id).filter((r) => r.date > addDays(today, -395) && r.date <= today && r.dpsPLN > 0);
      for (const r of hist) {
        const pay = addYears(r.date, 1);
        const ex = addDays(pay, -14);
        if (pay <= today || pay > horizon || hasNearby([...schedule, ...newItems], inst.id, ex, 30)) continue;
        newItems.push({ id: id(inst, ex, 'h'), instrumentId: inst.id, dps: Math.round(r.dpsPLN * 10000) / 10000, currency: 'PLN', exDate: ex, payDate: pay, payDateEstimated: true, estimated: true, withholdingPct: 0, source: 'HISTORY', note: 'Prognoza z historii wypłat (ta sama kwota co przed rokiem)' });
      }
    }
  }

  // 3) Automatyczne księgowanie potwierdzonych wypłat po dniu wypłaty
  const bookings = [];
  if (autoBook) {
    for (const item of [...schedule, ...newItems]) {
      if (item.estimated || item.bookedAt || !item.payDate || item.payDate > today || scheduleStatus(item, today) !== 'PENDING') continue;
      const entries = bookingEntries(state, item);
      if (entries.length) bookings.push({ item, entries });
    }
  }
  return { newItems, bookings };
}

export async function runDividendSync(state, actions, { silent = false } = {}) {
  const prefs = state.settings.dividendPrefs || {};
  const { histories, log } = await fetchDividendHistories(state);
  const online = Object.keys(histories).length;
  const { newItems, bookings } = planDividendSync(state, histories, { autoBook: !!prefs.autoBook });
  if (newItems.length) actions.addMany('dividendSchedule', newItems);
  for (const b of bookings) {
    actions.addMany('income', b.entries);
    actions.upsert('dividendSchedule', { ...b.item, bookedAt: new Date().toISOString(), incomeIds: b.entries.map((e) => e.id) });
  }
  const source = online ? `Yahoo Finance (${online} spółek)` : 'prognoza z historii wypłat';
  actions.updateSettings({ dividendPrefs: { ...prefs, lastSync: new Date().toISOString(), lastSyncSource: source, lastSyncLog: log.slice(0, 10) } });
  if (!silent || newItems.length || bookings.length) {
    actions.notify(
      newItems.length || bookings.length
        ? `Dywidendy: dodano ${newItems.length} wpisów${bookings.length ? `, zaksięgowano ${bookings.length}` : ''} (${source})`
        : `Dywidendy aktualne (${source})`,
      'success',
    );
  }
  return { newItems, bookings, source };
}
