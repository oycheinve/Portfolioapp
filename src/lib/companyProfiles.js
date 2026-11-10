// Profile spółek (Ustawienia): opis działalności, profil (segmenty, model biznesowy, ważne wskaźniki) i własne notatki.
// Zapis per użytkownik: `wealth-app-company-profiles-v1` (urządzenie + chmura, ui_prefs po user_id) – bez limitu liczby
// spółek. Analityk wyników dołącza dopasowany profil jako kontekst biznesowy do analizy wgranych materiałów.
import { PREFS_CHANGED_EVENT } from './budget.js';
import { companyKey } from './earnings.js';

export const PROFILES_KEY = 'wealth-app-company-profiles-v1';
export const MAX_PROFILE_TEXT = 6000; // na pole – kontekst dla AI (limit długości tekstu, nie liczby spółek)

export function readProfiles() {
  try {
    const v = JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]');
    return Array.isArray(v) ? v.filter((p) => p && p.id) : [];
  } catch {
    return [];
  }
}
export function writeProfiles(list) {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(PREFS_CHANGED_EVENT, { detail: { key: PROFILES_KEY } }));
  } catch {
    // brak localStorage
  }
}
export const makeProfile = ({ ticker = '', name = '' } = {}) => ({ id: `cp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ticker: String(ticker).trim().toUpperCase().slice(0, 16), name: String(name).trim().slice(0, 80), industry: '', profile: '', notes: '', updatedAt: new Date().toISOString() });

// Dopasowanie profilu do spółki: ticker albo nazwa (te same reguły co klucz historii analityka)
export function findProfile(list, { ticker = '', company = '' } = {}) {
  const keys = new Set([companyKey({ ticker }), companyKey({ company }), companyKey({ ticker: company }), companyKey({ company: ticker })].filter(Boolean));
  if (!keys.size) return null;
  return list.find((p) => keys.has(companyKey({ ticker: p.ticker })) || keys.has(companyKey({ company: p.name }))) || null;
}
// Profil „uzupełniony” = opis albo notatki (sama branża przepisana z portfela to jeszcze nie profil)
export const hasContent = (p) => !!(p && (String(p.profile || '').trim() || String(p.notes || '').trim()));
// Kontekst dla AI (zwięzły tekst)
export function profileContext(p) {
  if (!hasContent(p)) return '';
  return [`Spółka: ${p.name || p.ticker}${p.ticker && p.name ? ` (${p.ticker})` : ''}`, p.industry ? `Branża: ${p.industry}` : '', p.profile ? `Opis / profil działalności:\n${String(p.profile).slice(0, MAX_PROFILE_TEXT)}` : '', p.notes ? `Notatki inwestora (teza, na co patrzeć):\n${String(p.notes).slice(0, MAX_PROFILE_TEXT)}` : ''].filter(Boolean).join('\n');
}
