// Konta użytkowników i zapis danych w chmurze (Supabase: logowanie e-mail + hasło, tabela `portfolios`).
// Jeden wiersz na użytkownika: cały stan aplikacji (jsonb) + ustawienia widoków; dostęp chroniony RLS
// (każdy widzi tylko swój wiersz – zob. supabase/schema.sql). Biblioteka ładowana dopiero, gdy chmura jest
// skonfigurowana, więc tryb lokalny (bez konta) działa jak dotąd.
// Konfiguracja: zmienne VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY albo wpisana w Ustawieniach (localStorage).

import { STORAGE_KEY } from '../state/schema.js';

const CONFIG_KEY = 'portfolio-cloud-config';
export const MODE_KEY = 'portfolio-cloud-mode'; // 'local' – użytkownik wybrał pracę bez konta
export const OWNER_KEY = 'portfolio-cloud-owner'; // id użytkownika, którego dane leżą w localStorage
export const PENDING_KEY = 'portfolio-cloud-pending'; // id użytkownika z niewysłanymi zmianami
export const SYNCED_AT_KEY = 'portfolio-cloud-synced-at'; // updated_at ostatnio zsynchronizowanej wersji
export const CONFLICT_KEY = 'portfolio-cloud-conflict-backup'; // lokalna wersja odrzucona przy konflikcie
const TABLE = 'portfolios';

function ls(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // brak localStorage
  }
  return null;
}
export const storage = ls;

export function cloudConfig() {
  const envUrl = import.meta.env.VITE_SUPABASE_URL;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (envUrl && envKey) return { url: envUrl, anonKey: envKey, source: 'env' };
  try {
    const c = JSON.parse(ls(CONFIG_KEY) || 'null');
    if (c?.url && c?.anonKey) return { url: c.url, anonKey: c.anonKey, source: 'local' };
  } catch {
    // uszkodzona konfiguracja
  }
  return null;
}

export function saveCloudConfig({ url, anonKey }) {
  const clean = String(url || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\/.+/i.test(clean)) throw new Error('Adres projektu musi zaczynać się od https://');
  if (String(anonKey || '').trim().length < 20) throw new Error('Wklej klucz „anon public” z ustawień projektu Supabase.');
  ls(CONFIG_KEY, JSON.stringify({ url: clean, anonKey: String(anonKey).trim() }));
  client = null;
}

export function clearCloudConfig() {
  ls(CONFIG_KEY, null);
  client = null;
}

export const isLocalMode = () => ls(MODE_KEY) === 'local';
export const setLocalMode = (on) => ls(MODE_KEY, on ? 'local' : null);

let client = null;
export async function getClient() {
  const cfg = cloudConfig();
  if (!cfg) return null;
  if (client?.__url === cfg.url) return client;
  const { createClient } = await import('@supabase/supabase-js');
  client = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  client.__url = cfg.url;
  return client;
}

// Komunikaty Supabase / sieci po polsku
export function cloudError(e) {
  const msg = String(e?.message || e || '');
  const code = e?.code || '';
  if (/invalid login credentials/i.test(msg)) return 'Nieprawidłowy e-mail lub hasło.';
  if (/email not confirmed/i.test(msg)) return 'Adres e-mail nie jest jeszcze potwierdzony – kliknij link w wiadomości od serwisu.';
  if (/already registered|already exists/i.test(msg)) return 'Konto z tym adresem e-mail już istnieje – zaloguj się.';
  if (/password.*(at least|short|characters)/i.test(msg)) return 'Hasło jest za krótkie (minimum 6 znaków).';
  if (/invalid.*email|email.*invalid/i.test(msg)) return 'Nieprawidłowy adres e-mail.';
  if (/rate limit|too many/i.test(msg)) return 'Zbyt wiele prób – odczekaj chwilę i spróbuj ponownie.';
  if (code === '42P01' || code === 'PGRST205' || /relation .*portfolios|could not find the table/i.test(msg)) return 'W bazie brakuje tabeli „portfolios” – uruchom skrypt supabase/schema.sql w edytorze SQL Supabase.';
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(msg)) return 'Brak połączenia z serwerem – sprawdź internet.';
  return msg || 'Nieznany błąd serwera.';
}

export async function getSession() {
  const sb = await getClient();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data?.session || null;
}

export async function onAuthChange(cb) {
  const sb = await getClient();
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((event, session) => cb(event, session));
  return () => data?.subscription?.unsubscribe();
}

export async function signIn(email, password) {
  const sb = await getClient();
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  return data.session;
}

// { session } – zalogowano od razu; { confirm: true } – potrzebne potwierdzenie adresu e-mail
export async function signUp(email, password) {
  const sb = await getClient();
  const { data, error } = await sb.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin } });
  if (error) throw error;
  // Supabase przy istniejącym adresie (z włączonym potwierdzaniem) zwraca użytkownika bez tożsamości
  if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error('User already registered');
  return data.session ? { session: data.session } : { confirm: true };
}

export async function resetPassword(email) {
  const sb = await getClient();
  const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
  if (error) throw error;
}

export async function signOut() {
  const sb = await getClient();
  if (sb) await sb.auth.signOut();
}

// Wiersz użytkownika: { data, uiPrefs, updatedAt } albo null (nowe konto)
export async function fetchCloud(userId) {
  const sb = await getClient();
  const { data, error } = await sb.from(TABLE).select('data, ui_prefs, updated_at').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { data: data.data, uiPrefs: data.ui_prefs || {}, updatedAt: data.updated_at };
}

export async function fetchCloudUpdatedAt(userId) {
  const sb = await getClient();
  const { data, error } = await sb.from(TABLE).select('updated_at').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data?.updated_at || null;
}

export async function pushCloud(userId, state, uiPrefs) {
  const sb = await getClient();
  const updatedAt = new Date().toISOString();
  const { error } = await sb
    .from(TABLE)
    .upsert({ user_id: userId, data: state, ui_prefs: uiPrefs || {}, schema_version: state?.meta?.version ?? null, updated_at: updatedAt }, { onConflict: 'user_id' });
  if (error) throw error;
  return updatedAt;
}

// Ustawienia widoków i kalkulatorów (klucze „wealth-app-…” poza stanem danych)
export function collectUiPrefs() {
  const uiPrefs = {};
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith('wealth-app-') && k !== STORAGE_KEY && k !== 'wealth-app-logos') uiPrefs[k] = localStorage.getItem(k);
    }
  } catch {
    // brak localStorage
  }
  return uiPrefs;
}

const time = (iso) => (iso ? new Date(iso).getTime() || 0 : 0);

// Po zalogowaniu: wybór wersji danych przed startem aplikacji.
// Chmura ma pierwszeństwo; wyjątki: niewysłane zmiany z tego urządzenia (nowsze niż wersja w chmurze)
// (wersja w chmurze bez zmian od ostatniej synchronizacji) oraz nowe konto – wtedy dane lokalne tego urządzenia (bez właściciela albo tego samego użytkownika) trafiają do chmury.
export function chooseInitialData(userId, remote) {
  const rawLocal = ls(STORAGE_KEY);
  const owner = ls(OWNER_KEY);
  const pending = ls(PENDING_KEY) === userId;
  const syncedAt = ls(SYNCED_AT_KEY);
  const localIsMine = !!rawLocal && (owner === userId || (!owner && !remote));
  let local = null;
  try {
    local = localIsMine ? JSON.parse(rawLocal) : null;
  } catch {
    local = null;
  }

  if (remote?.data) {
    if (local && owner === userId && pending) {
      if (syncedAt && time(remote.updatedAt) === time(syncedAt)) return { data: local, uiPrefs: null, needsPush: true, notice: 'Wysłano do chmury zmiany zapisane na tym urządzeniu bez połączenia.' };
      ls(CONFLICT_KEY, rawLocal);
      return { data: remote.data, uiPrefs: remote.uiPrefs, needsPush: false, syncedAt: remote.updatedAt, notice: 'Dane w chmurze były nowsze niż niewysłane zmiany z tego urządzenia – wczytano wersję z chmury (lokalna kopia zachowana).' };
    }
    return { data: remote.data, uiPrefs: remote.uiPrefs, needsPush: false, syncedAt: remote.updatedAt };
  }
  if (local) return { data: local, uiPrefs: null, needsPush: true, notice: 'Dane z tego urządzenia zostały przeniesione na Twoje konto w chmurze.' };
  return { data: null, uiPrefs: null, needsPush: true };
}
