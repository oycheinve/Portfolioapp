// Etap 4: dywidendy – DPS (TTM), stopa dywidendy portfela, harmonogram ogłoszonych wypłat,
// kalendarz 12 miesięcy (wypłacona / w drodze / ogłoszona / prognoza), przypomnienia i prognoza z DGR i DRIP.
import { computeHoldings, fxToPLN, incomeEventsWithTax, isoDay, livePriceLookup, valuePortfolio } from './engine.js';
import { belkaRateForAccount, computeIncomeTax } from './tax.js';

const DAY = 86400000;

function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDay(new Date(y, m - 1, d + n));
}

export function daysUntil(iso, today = isoDay(new Date())) {
  const [y1, m1, d1] = today.split('-').map(Number);
  const [y2, m2, d2] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY);
}

// Liczba sztuk instrumentu na dzień – per konto
export function sharesAt(state, instrumentId, date) {
  const out = {};
  for (const h of computeHoldings(state, date, null)) {
    if (h.instrumentId === instrumentId && h.quantity > 0) out[h.accountId] = h.quantity;
  }
  return out;
}

// Historia DPS instrumentu: każda wypłata liczona dla konta, na które wpłynęła – liczba akcji na tym koncie
// dzień przed wypłatą (stan historyczny, nie obecny). Gdy akcji nie da się odtworzyć (np. sprzedane po dniu
// dywidendy, import samych otwartych pozycji) – stawka na akcję zapisana przy wypłacie (np. „5.0/ SHR” z XTB).
export function dividendHistory(state, instrumentId) {
  const fx = state.prices?.fx;
  const byDate = new Map();
  const sharesCache = new Map();
  for (const i of state.income) {
    if (i.type !== 'DIVIDEND' || i.instrumentId !== instrumentId) continue;
    const gross = Number(i.gross);
    if (!Number.isFinite(gross)) continue;
    const day = addDays(i.date, -1);
    if (!sharesCache.has(day)) sharesCache.set(day, sharesAt(state, instrumentId, day));
    const shares = sharesCache.get(day)[i.accountId] || 0;
    const recorded = Number(i.dps) > 0 ? Number(i.dps) * fxToPLN(fx, i.dpsCurrency || 'PLN') : null;
    const row = byDate.get(i.date) || { date: i.date, gross: 0, shares: 0, tradeGross: 0, tradeShares: 0, recordedDpsPLN: null, accounts: new Set() };
    row.gross += gross;
    if (shares > 0) {
      // Kilka wpisów tego samego dnia na jednym koncie (np. dwie wypłaty w raporcie XTB) – akcje liczone raz
      if (!row.accounts.has(i.accountId)) row.tradeShares += shares;
      row.accounts.add(i.accountId);
      row.tradeGross += gross;
    }
    if (recorded && row.recordedDpsPLN === null) row.recordedDpsPLN = recorded;
    byDate.set(i.date, row);
  }
  const rows = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const r of rows) {
    r.dpsPLN = r.tradeShares > 0 ? r.tradeGross / r.tradeShares : r.recordedDpsPLN || 0;
    r.shares = r.dpsPLN > 0 ? r.gross / r.dpsPLN : r.tradeShares;
    delete r.accounts;
  }
  return rows;
}

// Roczny DPS (12 mies. wstecz) w PLN – lub wartość ręczna z instrumentu (w walucie instrumentu)
export function annualDps(state, instrument, today = isoDay(new Date())) {
  const fx = fxToPLN(state.prices?.fx, instrument.currency);
  const manual = Number(instrument.dividend?.dps);
  if (instrument.dividend && instrument.dividend.dps !== undefined && instrument.dividend.dps !== '' && Number.isFinite(manual)) {
    return { dpsPLN: manual * fx, dps: manual, source: 'ręcznie' };
  }
  const yearAgo = addDays(today, -365);
  const ttm = dividendHistory(state, instrument.id).filter((r) => r.date > yearAgo && r.date <= today);
  const dpsPLN = ttm.reduce((s, r) => s + r.dpsPLN, 0);
  return { dpsPLN, dps: fx > 0 ? dpsPLN / fx : dpsPLN, source: ttm.length ? `TTM (${ttm.length} wypł.)` : 'brak' };
}

// Pozycje dywidendowe na dziś: per konto (podatek zależy od konta)
export function dividendPositions(state, today = isoDay(new Date())) {
  const lookup = livePriceLookup(state);
  const v = valuePortfolio(state, { asOf: today, accountIds: null, priceLookup: lookup });
  return v.positions
    .filter((p) => p.instrument)
    .map((p) => {
      const dps = annualDps(state, p.instrument, today);
      const tax = belkaRateForAccount(p.account, state.settings);
      const gross = dps.dpsPLN * p.quantity;
      return {
        ...p,
        dpsPLN: dps.dpsPLN,
        dps: dps.dps,
        dpsSource: dps.source,
        taxRate: tax,
        annualGross: gross,
        annualNet: gross * (1 - tax),
        yield: p.pricePLN > 0 ? dps.dpsPLN / p.pricePLN : 0,
        yieldOnCost: p.costPLN > 0 ? gross / p.costPLN : 0,
      };
    });
}

// Wypłaty z rejestru pasujące do pozycji harmonogramu (ta sama spółka, od 5 dni przed dniem dywidendy
// do 60 dni po wypłacie) – np. dywidenda z importu XTB sparowana z danymi Yahoo
export function matchingIncome(state, item) {
  if (!item?.instrumentId || !item.exDate) return [];
  const from = addDays(item.exDate, -5);
  const to = addDays(item.payDate || item.exDate, 60);
  return state.income.filter((i) => i.type === 'DIVIDEND' && i.instrumentId === item.instrumentId && i.date >= from && i.date <= to);
}

// Status pozycji harmonogramu (state – opcjonalnie: wypłata już w rejestrze = wypłacona)
export function scheduleStatus(item, today = isoDay(new Date()), state = null) {
  if (item.bookedAt) return 'PAID';
  if (state && matchingIncome(state, item).length) return 'PAID';
  if (item.estimated) return 'FORECAST';
  if (item.exDate && item.exDate <= today) return 'PENDING';
  return 'ANNOUNCED';
}

export const STATUS_META = {
  PAID: { label: 'Wypłacona', tone: 'green' },
  PENDING: { label: 'W drodze', tone: 'amber' },
  ANNOUNCED: { label: 'Ogłoszona', tone: 'blue' },
  FORECAST: { label: 'Prognoza', tone: 'neutral' },
};

// Wycena pozycji harmonogramu: sztuki na Ex-Date (dzień przed) × DPS × kurs, podatek per konto
export function evaluateScheduleItem(state, item, today = isoDay(new Date())) {
  const inst = state.instruments.find((i) => i.id === item.instrumentId);
  const refDate = item.exDate && item.exDate <= today ? addDays(item.exDate, -1) : today;
  const shares = inst ? sharesAt(state, inst.id, refDate) : {};
  const fx = fxToPLN(state.prices?.fx, item.currency || inst?.currency || 'PLN');
  const accountsById = Object.fromEntries(state.accounts.map((a) => [a.id, a]));
  const perAccount = Object.entries(shares).map(([accountId, qty]) => {
    const gross = qty * (Number(item.dps) || 0) * fx;
    const foreignTax = gross * ((Number(item.withholdingPct) || 0) / 100);
    const t = computeIncomeTax({ gross, foreignTax }, accountsById[accountId], state.settings);
    return { accountId, account: accountsById[accountId], shares: qty, gross, foreignTax, net: t.net };
  });
  // Pozycja zaksięgowana / sparowana – kwoty rzeczywiste z rejestru
  const paired = item.incomeIds?.length ? item.incomeIds : matchingIncome(state, item).map((i) => i.id);
  if (paired.length) {
    const ids = new Set(paired);
    const rows = incomeEventsWithTax(state).filter((i) => ids.has(i.id));
    if (rows.length) {
      return {
        instrument: inst,
        status: 'PAID',
        shares: perAccount.reduce((s, a) => s + a.shares, 0),
        gross: rows.reduce((s, i) => s + (Number(i.gross) || 0), 0),
        net: rows.reduce((s, i) => s + (Number.isFinite(i.net) ? i.net : 0), 0),
        perAccount,
        fx,
        paired: true,
      };
    }
  }
  return {
    instrument: inst,
    status: scheduleStatus(item, today),
    shares: perAccount.reduce((s, a) => s + a.shares, 0),
    gross: perAccount.reduce((s, a) => s + a.gross, 0),
    net: perAccount.reduce((s, a) => s + a.net, 0),
    perAccount,
    fx,
  };
}

// Wpisy przychodu do zaksięgowania wypłaty z harmonogramu
export function bookingEntries(state, item) {
  const ev = evaluateScheduleItem(state, item);
  return ev.perAccount
    .filter((a) => a.gross > 0)
    .map((a) => ({
      id: `divsch_${item.id}_${a.accountId}`,
      accountId: a.accountId,
      instrumentId: item.instrumentId,
      date: item.payDate || isoDay(new Date()),
      type: 'DIVIDEND',
      gross: Math.round(a.gross * 100) / 100,
      foreignTax: Math.round(a.foreignTax * 100) / 100,
      note: `${a.shares} szt. × ${Number(item.dps).toFixed(4)} ${item.currency || ev.instrument?.currency || 'PLN'} (harmonogram)`,
      scheduleId: item.id,
    }));
}

// Kalendarz roku: dla każdego miesiąca lista wydarzeń z kwotą netto i statusem
export function buildCalendar(state, year, today = isoDay(new Date())) {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i, items: [], totalNet: 0 }));
  const instById = Object.fromEntries(state.instruments.map((i) => [i.id, i]));
  const income = incomeEventsWithTax(state).filter((i) => i.type === 'DIVIDEND');
  const covered = new Set(); // instrument|miesiąc z wpisem rzeczywistym lub ogłoszonym

  // 1) wypłacone (rejestr przychodów) – zgrupowane per instrument i miesiąc
  const paid = new Map();
  for (const i of income) {
    if (Number(i.date.slice(0, 4)) !== year) continue;
    const m = Number(i.date.slice(5, 7)) - 1;
    const key = `${i.instrumentId}|${m}`;
    const row = paid.get(key) || { instrumentId: i.instrumentId, month: m, date: i.date, net: 0, gross: 0 };
    row.net += i.net;
    row.gross += Number(i.gross) || 0;
    paid.set(key, row);
  }
  for (const r of paid.values()) {
    months[r.month].items.push({ ...r, ticker: instById[r.instrumentId]?.ticker || '—', status: 'PAID' });
    covered.add(`${r.instrumentId}|${r.month}`);
  }

  // 2) harmonogram niezaksięgowany (w drodze / ogłoszona) – miesiąc wypłaty
  for (const item of state.dividendSchedule) {
    if (item.bookedAt || !(Number(item.dps) > 0) || matchingIncome(state, item).length) continue;
    const date = item.payDate || item.exDate;
    if (!date || Number(date.slice(0, 4)) !== year) continue;
    const m = Number(date.slice(5, 7)) - 1;
    const ev = evaluateScheduleItem(state, item, today);
    months[m].items.push({
      instrumentId: item.instrumentId,
      ticker: ev.instrument?.ticker || '—',
      date,
      exDate: item.exDate,
      net: ev.net,
      gross: ev.gross,
      status: ev.status,
      scheduleId: item.id,
    });
    covered.add(`${item.instrumentId}|${m}`);
  }

  // 3) prognoza: miesiące wypłat z poprzedniego roku, dla obecnej liczby sztuk, jeśli brak wpisu w tym roku
  const currentMonth = Number(today.slice(5, 7)) - 1;
  const currentYear = Number(today.slice(0, 4));
  const positions = dividendPositions(state, today);
  for (const i of income) {
    if (Number(i.date.slice(0, 4)) !== year - 1) continue;
    const m = Number(i.date.slice(5, 7)) - 1;
    const key = `${i.instrumentId}|${m}`;
    if (covered.has(key)) continue;
    if (year < currentYear || (year === currentYear && m < currentMonth)) continue;
    const hist = dividendHistory(state, i.instrumentId).find((h) => h.date === i.date);
    const pos = positions.filter((p) => p.instrumentId === i.instrumentId);
    if (!hist || pos.length === 0) continue;
    const net = pos.reduce((s, p) => s + hist.dpsPLN * p.quantity * (1 - p.taxRate), 0);
    const gross = pos.reduce((s, p) => s + hist.dpsPLN * p.quantity, 0);
    months[m].items.push({ instrumentId: i.instrumentId, ticker: instById[i.instrumentId]?.ticker || '—', date: `${year}${i.date.slice(4)}`, net, gross, status: 'FORECAST' });
    covered.add(key);
  }

  for (const m of months) {
    // Pozycje bez kwoty (np. pusta stawka z Yahoo) nie zerują ani nie psują sum
    m.items = m.items.filter((it) => Number.isFinite(it.net));
    m.items.sort((a, b) => (a.date < b.date ? -1 : 1));
    m.totalNet = m.items.reduce((s, it) => s + it.net, 0);
  }
  return months;
}

// Kafelki główne
export function dividendKpis(state, today = isoDay(new Date())) {
  const year = today.slice(0, 4);
  const income = incomeEventsWithTax(state).filter((i) => i.type === 'DIVIDEND');
  const ytdNet = income.filter((i) => i.date.startsWith(year) && i.date <= today).reduce((s, i) => s + (Number.isFinite(i.net) ? i.net : 0), 0);
  const ytdGross = income.filter((i) => i.date.startsWith(year) && i.date <= today).reduce((s, i) => s + (Number(i.gross) || 0), 0);
  const last12Net = income.filter((i) => i.date > addDays(today, -365) && i.date <= today).reduce((s, i) => s + (Number.isFinite(i.net) ? i.net : 0), 0);
  const pending = state.dividendSchedule
    .filter((s) => scheduleStatus(s, today, state) === 'PENDING')
    .map((s) => evaluateScheduleItem(state, s, today));
  const positions = dividendPositions(state, today);
  const marketValue = positions.reduce((s, p) => s + p.value, 0);
  const forwardGross = positions.reduce((s, p) => s + (Number.isFinite(p.annualGross) ? p.annualGross : 0), 0);
  const forwardNet = positions.reduce((s, p) => s + (Number.isFinite(p.annualNet) ? p.annualNet : 0), 0);
  const cost = positions.reduce((s, p) => s + p.costPLN, 0);
  return {
    ytdNet,
    ytdGross,
    last12Net,
    monthlyAvg: last12Net / 12,
    pendingNet: pending.reduce((s, p) => s + (Number.isFinite(p.net) ? p.net : 0), 0),
    pendingCount: pending.length,
    yield: marketValue > 0 ? forwardGross / marketValue : 0,
    yieldOnCost: cost > 0 ? forwardGross / cost : 0,
    forwardGross,
    forwardNet,
    marketValue,
  };
}

// Przypomnienia: Ex-Date, wypłaty i wydarzenia spółek (raport/WZA) w najbliższych N dniach
export function upcomingReminders(state, days = 30, today = isoDay(new Date()), { includeEvents = false } = {}) {
  const out = [];
  const instById = Object.fromEntries(state.instruments.map((i) => [i.id, i]));
  for (const s of state.dividendSchedule) {
    if (s.bookedAt) continue;
    const inst = instById[s.instrumentId];
    if (s.exDate && s.exDate >= today && daysUntil(s.exDate, today) <= days) {
      out.push({ id: `${s.id}-ex`, date: s.exDate, kind: 'EX', estimated: !!s.estimated, title: `${inst?.ticker || '—'}: Dzień dywidendy (Ex-Date)${s.estimated ? ' – prognoza' : ''}`, detail: `Kup najpóźniej sesję wcześniej, aby otrzymać ${Number(s.dps).toFixed(2)} ${s.currency || inst?.currency || 'PLN'}/akcję`, instrument: inst, scheduleId: s.id });
    }
    if (s.payDate && s.payDate >= today && daysUntil(s.payDate, today) <= days) {
      out.push({ id: `${s.id}-pay`, date: s.payDate, kind: 'PAY', estimated: !!s.estimated || !!s.payDateEstimated, title: `${inst?.ticker || '—'}: wypłata dywidendy${s.estimated || s.payDateEstimated ? ' (szac.)' : ''}`, detail: `${Number(s.dps).toFixed(2)} ${s.currency || inst?.currency || 'PLN'}/akcję`, instrument: inst, scheduleId: s.id });
    }
  }
  for (const inst of includeEvents ? state.instruments : []) {
    const ev = inst.dividend?.nextEvent;
    if (ev?.date && ev.date >= today && daysUntil(ev.date, today) <= days) {
      out.push({ id: `${inst.id}-event`, date: ev.date, kind: 'EVENT', title: `${inst.ticker}: ${ev.label || 'wydarzenie'}`, detail: inst.name, instrument: inst });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1)).map((r) => ({ ...r, inDays: daysUntil(r.date, today) }));
}

// Prognoza dywidend na N lat z DGR i opcjonalną reinwestycją (DRIP).
// Przy DRIP dywidenda netto kupuje nowe akcje po cenie rosnącej w tempie DGR (stała stopa dywidendy).
export function projectDividends(positions, { years = 10, dgr = 0.06, drip = true } = {}) {
  const startYear = new Date().getFullYear();
  const state = positions
    .filter((p) => p.dpsPLN > 0)
    .map((p) => ({ id: p.key, shares: p.quantity, dps: p.dpsPLN, price: p.pricePLN, tax: p.taxRate }));
  const run = (reinvest) => {
    const s = state.map((x) => ({ ...x }));
    const rows = [];
    for (let y = 1; y <= years; y += 1) {
      let gross = 0;
      let net = 0;
      for (const x of s) {
        const dps = x.dps * Math.pow(1 + dgr, y - 1);
        const g = x.shares * dps;
        const n = g * (1 - x.tax);
        gross += g;
        net += n;
        if (reinvest) {
          const price = x.price * Math.pow(1 + dgr, y - 1);
          if (price > 0) x.shares += n / price;
        }
      }
      rows.push({ year: String(startYear + y - 1), gross, net, monthly: net / 12 });
    }
    return rows;
  };
  const withDrip = run(true);
  const noDrip = run(false);
  return withDrip.map((r, i) => ({
    year: r.year,
    drip: r.net,
    noDrip: noDrip[i].net,
    selected: drip ? r.net : noDrip[i].net,
    alternative: drip ? noDrip[i].net : r.net,
    monthly: (drip ? r.net : noDrip[i].net) / 12,
  }));
}

// Uzgodnienie harmonogramu z rejestrem (bez ręcznego „Zaksięguj”):
// 1) pozycja z wypłatą w rejestrze (np. import XTB) → oznaczona jako wypłacona i powiązana z tymi wpisami;
//    jeśli wcześniej zaksięgowano ją automatycznie z danych Yahoo – automatyczne wpisy zastępuje prawdziwa wypłata,
// 2) przy włączonym autoksięgowaniu: pozycje po dniu wypłaty bez wpisu w rejestrze → wypłata wyliczona
//    z liczby akcji na każdym koncie w dniu przed dniem dywidendy (stan historyczny).
export function reconcileDividends(state, { autoBook = true, today = isoDay(new Date()) } = {}) {
  const removeIncome = [];
  const addIncome = [];
  const updates = [];
  const auto = (id) => String(id).startsWith('divsch_');
  for (const item of state.dividendSchedule) {
    const real = matchingIncome(state, item).filter((i) => !auto(i.id));
    if (real.length) {
      const ids = real.map((i) => i.id).sort();
      const current = [...(item.incomeIds || [])].sort();
      const autoIds = current.filter(auto);
      if (autoIds.length) removeIncome.push(...autoIds);
      if (!item.bookedAt || ids.join('|') !== current.join('|')) {
        updates.push({ ...item, bookedAt: item.bookedAt || new Date().toISOString(), incomeIds: ids, pairedWith: 'rejestr' });
      }
      continue;
    }
    if (!autoBook || item.bookedAt || item.estimated || !item.payDate || item.payDate > today || !(Number(item.dps) > 0)) continue;
    if (scheduleStatus(item, today) !== 'PENDING') continue;
    const entries = bookingEntries(state, item);
    if (!entries.length) continue;
    addIncome.push(...entries);
    updates.push({ ...item, bookedAt: new Date().toISOString(), incomeIds: entries.map((e) => e.id), autoBooked: true });
  }
  return { removeIncome, addIncome, updates };
}
