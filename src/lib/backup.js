// Etap 6: walidacja pliku kopii zapasowej przed importem – struktura, typy pól i spójność odwołań
import { ACCOUNT_TYPES } from './constants.js';
import { COLLECTIONS, STATE_VERSION } from '../state/schema.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const RULES = {
  accounts: { required: ['id', 'name', 'type'], check: (x) => (ACCOUNT_TYPES[x.type] ? null : `nieznany typ konta „${x.type}”`) },
  instruments: { required: ['id', 'ticker'] },
  trades: { required: ['id', 'accountId', 'instrumentId', 'date', 'side', 'quantity', 'price'], date: 'date', account: true, check: (x) => (['BUY', 'SELL'].includes(x.side) ? null : `nieznany typ transakcji „${x.side}”`) },
  cashflows: { required: ['id', 'accountId', 'date', 'type', 'amount'], date: 'date', account: true, check: (x) => (['DEPOSIT', 'WITHDRAWAL'].includes(x.type) ? null : `nieznany typ operacji „${x.type}”`) },
  income: { required: ['id', 'accountId', 'date', 'type', 'gross'], date: 'date', account: true },
  bonds: { required: ['id', 'accountId', 'type', 'purchaseDate', 'quantity'], date: 'purchaseDate', account: true },
  otherAssets: { required: ['id', 'name'] },
  goals: { required: ['id', 'name'] },
  snapshots: { required: ['date'], date: 'date' },
  dividendSchedule: { required: ['id', 'instrumentId'] },
  journal: { required: ['id', 'date', 'title'], date: 'date' },
};

const LABELS = {
  accounts: 'Konta',
  instruments: 'Instrumenty',
  trades: 'Transakcje',
  cashflows: 'Wpłaty/wypłaty',
  income: 'Dywidendy i odsetki',
  bonds: 'Obligacje',
  otherAssets: 'Inne aktywa',
  goals: 'Cele',
  snapshots: 'Migawki dzienne',
  dividendSchedule: 'Ogłoszone dywidendy',
  journal: 'Dziennik',
};

export function collectionLabel(c) {
  return LABELS[c] || c;
}

// ---------------------------------------------------------------------------------------------
// Naprawa rekordów ze starszych / nietypowych kopii: brakujące lub inaczej nazwane pola dostają bezpieczne wartości
// domyślne (np. „type” zamiast „side” w transakcji, brak id, liczby jako tekst, daty z godziną lub „dd.mm.rrrr”).
// Rekordy, których nie da się sensownie odtworzyć (np. transakcja bez daty), są pomijane – z ostrzeżeniem, bez blokady.

let seq = 0;
function genId(prefix) {
  seq += 1;
  return `${prefix}_imp${Date.now().toString(36)}${seq.toString(36)}`;
}

function toNumber(v, fallback = 0) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function toIsoDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function normSide(v, qty) {
  const t = String(v ?? '').trim().toUpperCase();
  if (/^(SELL|SPRZEDA|S$|CLOSE)/.test(t)) return 'SELL';
  if (/^(BUY|KUPNO|ZAKUP|B$|OPEN)/.test(t)) return 'BUY';
  return qty < 0 ? 'SELL' : 'BUY';
}

const FIXERS = {
  accounts: (x) => ({ ...x, id: x.id || genId('acc'), name: String(x.name || x.label || 'Konto'), type: ACCOUNT_TYPES[x.type] ? x.type : 'BROKERAGE' }),
  instruments: (x) => ({ ...x, id: x.id || genId('inst'), ticker: String(x.ticker || x.symbol || x.name || 'BRAK').toUpperCase() }),
  trades: (x) => {
    const date = toIsoDate(x.date || x.tradeDate || x.time);
    if (!date) return null;
    const rawQty = toNumber(x.quantity ?? x.qty ?? x.shares ?? x.volume);
    return {
      ...x,
      id: x.id || genId('trd'),
      accountId: x.accountId || x.account || '',
      instrumentId: x.instrumentId || x.instrument || x.ticker || '',
      date,
      side: normSide(x.side ?? x.type ?? x.direction ?? x.kind, rawQty),
      quantity: Math.abs(rawQty),
      price: toNumber(x.price ?? x.unitPrice),
      fee: toNumber(x.fee ?? x.commission),
    };
  },
  cashflows: (x) => {
    const date = toIsoDate(x.date);
    if (!date) return null;
    const amount = toNumber(x.amount ?? x.value);
    const t = String(x.type ?? x.side ?? x.kind ?? '').toUpperCase();
    const type = /WITHDRAW|WYP[ŁL]/.test(t) ? 'WITHDRAWAL' : /DEPOSIT|WP[ŁL]/.test(t) ? 'DEPOSIT' : amount < 0 ? 'WITHDRAWAL' : 'DEPOSIT';
    return { ...x, id: x.id || genId('cf'), accountId: x.accountId || x.account || '', date, type, amount: Math.abs(amount) };
  },
  income: (x) => {
    const date = toIsoDate(x.date);
    if (!date) return null;
    const t = String(x.type ?? '').toUpperCase();
    return { ...x, id: x.id || genId('inc'), accountId: x.accountId || x.account || '', date, type: /INTEREST|ODSET/.test(t) ? 'INTEREST' : 'DIVIDEND', gross: toNumber(x.gross ?? x.amount), foreignTax: toNumber(x.foreignTax) };
  },
  bonds: (x) => {
    const purchaseDate = toIsoDate(x.purchaseDate || x.date);
    if (!purchaseDate) return null;
    return { ...x, id: x.id || genId('bond'), accountId: x.accountId || '', type: x.type || 'EDO', purchaseDate, quantity: toNumber(x.quantity, 0) };
  },
  otherAssets: (x) => ({ ...x, id: x.id || genId('oth'), name: String(x.name || 'Aktywo') }),
  goals: (x) => ({ ...x, id: x.id || genId('goal'), name: String(x.name || 'Cel') }),
  snapshots: (x) => {
    const date = toIsoDate(x.date);
    return date ? { ...x, date } : null;
  },
  dividendSchedule: (x) => (x.instrumentId ? { ...x, id: x.id || genId('div') } : null),
  journal: (x) => {
    const date = toIsoDate(x.date);
    return date ? { ...x, id: x.id || genId('jr'), title: String(x.title || 'Wpis') } : null;
  },
};

// Zwraca { data, repaired: { kolekcja: liczba }, dropped: { kolekcja: liczba } }
export function normalizeBackup(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { data: raw, repaired: {}, dropped: {} };
  const data = { ...raw };
  const repaired = {};
  const dropped = {};
  for (const c of COLLECTIONS) {
    if (raw[c] === undefined || raw[c] === null) {
      data[c] = [];
      continue;
    }
    if (!Array.isArray(raw[c])) {
      // Obiekt zamiast listy (np. mapa id → rekord) – zamiana na listę
      data[c] = typeof raw[c] === 'object' ? Object.values(raw[c]) : [];
      repaired[c] = (repaired[c] || 0) + 1;
    }
    const fix = FIXERS[c];
    if (!fix) continue;
    const seen = new Set();
    const out = [];
    for (const item of data[c]) {
      if (!item || typeof item !== 'object') {
        dropped[c] = (dropped[c] || 0) + 1;
        continue;
      }
      let fixed = fix(item);
      if (!fixed) {
        dropped[c] = (dropped[c] || 0) + 1;
        continue;
      }
      // Powtórzone id – nowe id dla duplikatu (dane zostają)
      if (fixed.id !== undefined && seen.has(fixed.id)) fixed = { ...fixed, id: genId(c.slice(0, 3)) };
      if (fixed.id !== undefined) seen.add(fixed.id);
      if (JSON.stringify(fixed) !== JSON.stringify(item)) repaired[c] = (repaired[c] || 0) + 1;
      out.push(fixed);
    }
    data[c] = out;
  }
  if (data.settings !== undefined && (typeof data.settings !== 'object' || Array.isArray(data.settings))) {
    data.settings = {};
    repaired.settings = 1;
  }
  return { data, repaired, dropped };
}

export function validateBackup(raw) {
  const errors = [];
  const warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['Plik nie zawiera obiektu stanu aplikacji.'], warnings, info: null };
  }
  const looksLikeBackup = COLLECTIONS.some((c) => raw[c] !== undefined) || raw.settings !== undefined;
  if (!looksLikeBackup) errors.push('Plik nie zawiera danych tej aplikacji (brak kont, transakcji i ustawień).');
  // Walidacja na danych po naprawie – braki w pojedynczych rekordach nie blokują przywrócenia
  const { data: fixedData, repaired, dropped } = normalizeBackup(raw);
  for (const [c, n] of Object.entries(repaired)) warnings.push(`${collectionLabel(c)}: uzupełniono brakujące / inaczej nazwane pola w ${n} ${n === 1 ? 'rekordzie' : 'rekordach'} (wartości domyślne).`);
  for (const [c, n] of Object.entries(dropped)) warnings.push(`${collectionLabel(c)}: pominięto ${n} ${n === 1 ? 'rekord' : 'rekordów'} bez daty lub danych do odtworzenia.`);
  raw = fixedData; // eslint-disable-line no-param-reassign
  if (raw.version && raw.version > STATE_VERSION) warnings.push(`Plik pochodzi z nowszej wersji aplikacji (v${raw.version}) – nieznane pola zostaną pominięte.`);
  if (raw.meta?.app && raw.meta.app !== 'portfolioapp') warnings.push(`Plik oznaczony jako „${raw.meta.app}” – może pochodzić z innej aplikacji.`);

  const accountList = Array.isArray(raw.accounts) ? raw.accounts : [];
  const accountIds = new Set(accountList.map((a) => a?.id));
  const counts = {};
  for (const c of COLLECTIONS) {
    const list = raw[c];
    if (list === undefined) {
      counts[c] = 0;
      continue;
    }
    if (!Array.isArray(list)) {
      errors.push(`${collectionLabel(c)}: oczekiwano listy, a jest ${typeof list}.`);
      continue;
    }
    counts[c] = list.length;
    const rule = RULES[c];
    if (!rule) continue;
    const ids = new Set();
    let issues = 0;
    let orphans = 0;
    for (const item of list) {
      if (!item || typeof item !== 'object') {
        issues += 1;
        continue;
      }
      const missing = rule.required.filter((k) => item[k] === undefined || item[k] === null || item[k] === '');
      const badDate = rule.date && item[rule.date] && !ISO.test(String(item[rule.date]));
      const badValue = rule.check ? !!rule.check(item) : false;
      let bad = missing.length > 0 || badDate || badValue;
      if (item.id !== undefined) {
        if (ids.has(item.id)) bad = true;
        ids.add(item.id);
      }
      if (bad) issues += 1;
      if (rule.account && item.accountId && !accountIds.has(item.accountId)) orphans += 1;
    }
    if (issues) {
      const msg = `${collectionLabel(c)}: ${issues} ${issues === 1 ? 'rekord ma' : 'rekordów ma'} braki lub błędny format (wymagane: ${rule.required.join(', ')}).`;
      warnings.push(msg);
    }
    if (orphans) warnings.push(`${collectionLabel(c)}: ${orphans} rekordów odwołuje się do nieistniejącego konta.`);
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    data: fixedData,
    info: {
      exportedAt: raw.meta?.exportedAt || raw.meta?.updatedAt || null,
      version: raw.version || 1,
      counts,
      accounts: accountList.map((a) => a?.name).filter(Boolean),
      demo: !!raw.meta?.demo,
    },
  };
}
