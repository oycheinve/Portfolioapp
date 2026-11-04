// Automatyczne dane dywidend: historia z Yahoo Finance (dni dywidendy i kwoty na akcję) albo – bez dostępu
// do Yahoo – prognoza na podstawie wypłat z rejestru. Tworzy wpisy harmonogramu i (opcjonalnie) księguje wypłaty.
import { computeHoldings, isoDay } from './engine.js';
import { bookingEntries, canAutoBook, dividendHistory, eligibleShares, scheduleStatus, sharesAt } from './dividends.js';
import { fetchYahooDividends } from './prices.js';
import { factsFor } from './dividendFacts.js';
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

// Instrumenty obecnie w portfelu – spółek sprzedanych nie dodajemy do harmonogramu ani kalendarza
export function dividendInstruments(state) {
  const ids = new Set(computeHoldings(state, isoDay(new Date()), null).filter((h) => h.quantity > 1e-9).map((h) => h.instrumentId));
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
        const paid = state.income.some((i) => i.type === 'DIVIDEND' && i.instrumentId === inst.id && i.date >= ev.exDate && i.date <= addDays(ev.exDate, 60));
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

  // 3) Zweryfikowane dywidendy (dividendFacts.js): poprawa dnia wypłaty i stawki w harmonogramie albo nowa pozycja
  const updates = [];
  for (const inst of state.instruments) {
    for (const f of factsFor(inst)) {
      const held = Object.values(eligibleShares(state, inst.id, addDays(f.exDate, -1), f.forceShares ? f.shares : null)).reduce((sum, q) => sum + q, 0);
      if (held <= 0) continue;
      const fields = { dps: f.dps, currency: f.currency, exDate: f.exDate, payDate: f.payDate, payDateEstimated: false, estimated: false, source: 'VERIFIED', note: f.note, verified: true };
      const near = (list) => list.filter((it) => it.instrumentId === inst.id && it.exDate && daysApart(it.exDate, f.exDate) <= 10);
      const inNew = near(newItems);
      const inSchedule = near(schedule);
      const differs = (it) => Object.entries(fields).some(([k, v]) => it[k] !== v);
      if (inNew.length || inSchedule.length) {
        // Prognozy / dane Yahoo z tego terminu → jedna pozycja z prawdziwymi danymi (pozostałe nowe pomijane)
        const target = inSchedule.find((it) => it.bookedAt) || inSchedule[0] || inNew[0];
        for (const it of inNew) if (it !== target) newItems.splice(newItems.indexOf(it), 1);
        if (inNew.includes(target)) Object.assign(target, fields);
        else if (differs(target)) updates.push({ ...target, ...fields });
      } else {
        newItems.push({ id: id(inst, f.exDate, 'v'), instrumentId: inst.id, ...fields, withholdingPct: 0 });
      }
    }
  }
  const withUpdates = [...schedule.map((it) => updates.find((u) => u.id === it.id) || it), ...newItems];

  // 4) Automatyczne księgowanie potwierdzonych wypłat po dniu wypłaty (zweryfikowane – zawsze, gdy brak w rejestrze)
  const bookings = [];
  {
    for (const item of withUpdates) {
      if (!autoBook && !item.verified) continue;
      // zweryfikowane: także sprawdzenie rejestru (wypłata z importu XTB = już wypłacona, bez duplikatu)
      if (item.bookedAt || !canAutoBook(item, today) || scheduleStatus(item, today, item.verified ? state : null) !== 'PENDING') continue;
      const entries = bookingEntries(state, item, today);
      if (entries.length) bookings.push({ item, entries });
    }
  }
  return { newItems, updates, bookings };
}

export async function runDividendSync(state, actions, { silent = false } = {}) {
  const prefs = state.settings.dividendPrefs || {};
  const { histories, log } = await fetchDividendHistories(state);
  const online = Object.keys(histories).length;
  const { newItems, updates, bookings } = planDividendSync(state, histories, { autoBook: !!prefs.autoBook });
  if (newItems.length) actions.addMany('dividendSchedule', newItems);
  for (const u of updates) if (!bookings.some((b) => b.item.id === u.id)) actions.upsert('dividendSchedule', u);
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
