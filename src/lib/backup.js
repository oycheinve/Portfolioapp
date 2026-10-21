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

export function validateBackup(raw) {
  const errors = [];
  const warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['Plik nie zawiera obiektu stanu aplikacji.'], warnings, info: null };
  }
  if (!Array.isArray(raw.accounts)) errors.push('Brak listy kont (accounts) – to nie jest kopia tej aplikacji.');
  if (!Array.isArray(raw.cashflows)) errors.push('Brak rejestru wpłat (cashflows).');
  if (raw.version && raw.version > STATE_VERSION) errors.push(`Plik pochodzi z nowszej wersji aplikacji (v${raw.version}).`);
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
      if (['accounts', 'cashflows', 'trades'].includes(c)) errors.push(msg);
      else warnings.push(msg);
    }
    if (orphans) warnings.push(`${collectionLabel(c)}: ${orphans} rekordów odwołuje się do nieistniejącego konta.`);
  }
  if (raw.settings !== undefined && (typeof raw.settings !== 'object' || Array.isArray(raw.settings))) errors.push('Ustawienia (settings) mają błędny format.');

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    info: {
      exportedAt: raw.meta?.exportedAt || raw.meta?.updatedAt || null,
      version: raw.version || 1,
      counts,
      accounts: accountList.map((a) => a?.name).filter(Boolean),
      demo: !!raw.meta?.demo,
    },
  };
}
