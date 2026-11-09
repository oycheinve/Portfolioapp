// Analityk wyników spółek (BETA): archiwum analiz per użytkownik (`wealth-app-earnings-v1`, urządzenie + chmura).
// Retencja 12 miesięcy (starsze wpisy usuwane przy odczycie i zapisie), unikalny klucz [Spółka + Kwartał] –
// ponowna analiza tego samego kwartału nadpisuje wpis zamiast tworzyć duplikat.
import { PREFS_CHANGED_EVENT } from './budget.js';

export const EARNINGS_KEY = 'wealth-app-earnings-v1';
export const RETENTION_DAYS = 365;

const normQuarter = (q) => {
  const t = String(q || '').toUpperCase().replace(/\s+/g, ' ').trim();
  const m = t.match(/(?:Q|KW\.?\s*)?([1-4])\s*(?:Q|KW\.?)?\s*[ /-]?\s*((?:19|20)\d{2})/) || t.match(/((?:19|20)\d{2})\s*[ /-]?\s*Q([1-4])/);
  if (!m) return t;
  return /^(19|20)\d{2}$/.test(m[1]) ? `Q${m[2]} ${m[1]}` : `Q${m[1]} ${m[2]}`;
};
const normCompany = (a) => String(a.ticker || a.company || '').toUpperCase().replace(/\.(WA|PL)$/, '').replace(/[^A-Z0-9ĄĆĘŁŃÓŚŹŻ]+/g, '');
export const earningsKey = (a) => `${normCompany(a)}|${normQuarter(a.quarter)}`;

const fresh = (list, now = Date.now()) => list.filter((e) => e && e.key && now - new Date(e.at).getTime() < RETENTION_DAYS * 86400000);

export function readEarnings(now = Date.now()) {
  try {
    const v = JSON.parse(localStorage.getItem(EARNINGS_KEY) || '[]');
    return Array.isArray(v) ? fresh(v, now).sort((a, b) => String(b.at).localeCompare(String(a.at))) : [];
  } catch {
    return [];
  }
}
function writeEarnings(list) {
  try {
    localStorage.setItem(EARNINGS_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(PREFS_CHANGED_EVENT, { detail: { key: EARNINGS_KEY } }));
  } catch {
    // brak localStorage
  }
}
// Zapis analizy: rotacja (12 mies.) + nadpisanie wpisu o tym samym kluczu [Spółka + Kwartał]
export function saveEarnings({ analysis, sources = [], grounded = false, searchNote = '', model = '' }, now = Date.now()) {
  const entry = { key: earningsKey(analysis), analysis, sources, grounded, ...(searchNote ? { searchNote } : {}), model, at: new Date(now).toISOString() };
  const list = readEarnings(now).filter((e) => e.key !== entry.key);
  writeEarnings([entry, ...list]);
  return entry;
}
export function deleteEarnings(key) {
  writeEarnings(readEarnings().filter((e) => e.key !== key));
}
// Odchylenie od konsensusu (%), gdy oba znane
export const surprise = (actual, consensus) => (actual === null || consensus === null || !consensus ? null : ((actual - consensus) / Math.abs(consensus)) * 100);
