// Podsumowania AI w Newsach: zapytanie do /api/news-summary (z tokenem sesji Supabase, gdy użytkownik jest
// zalogowany) i pamięć ostatnich podsumowań w przeglądarce. Klucz bez prefiksu „wealth-app-” – pamięć podręczna
// nie trafia do kopii zapasowej ani synchronizacji ustawień.
import { getClient } from './cloud.js';

const CACHE_KEY = 'fintrack-news-ai-v1';
const CACHE_LIMIT = 80;

function readCache() {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
function writeCache(key, value) {
  try {
    const all = { ...readCache(), [key]: { ...value, at: Date.now() } };
    const keys = Object.keys(all).sort((a, b) => (all[b].at || 0) - (all[a].at || 0));
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(keys.slice(0, CACHE_LIMIT).map((k) => [k, all[k]]))));
  } catch {
    // brak localStorage – podsumowanie tylko do końca sesji
  }
}

export const articleKey = (link) => `a|${link}`;
// Podsumowanie dnia – klucz z dnia i zestawu artykułów (nowy artykuł = nowe podsumowanie)
const hash = (text) => {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = (h * 33 + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
};
export const digestKey = (day, items) => `d3|${day}|${hash(items.map((it) => it.link).sort().join(' '))}`;
// Skrót z samego tytułu (portal blokował treść) – ważny 30 min, potem ponowna próba pobrania pełnej treści
const TITLE_ONLY_TTL = 30 * 60 * 1000;
export const cachedSummary = (key) => {
  const hit = readCache()[key] || null;
  if (hit?.basis === 'title' && Date.now() - (hit.at || 0) > TITLE_ONLY_TTL) return null;
  return hit;
};

async function sessionToken() {
  try {
    const sb = await getClient();
    const { data } = await sb.auth.getSession();
    return data?.session?.access_token || '';
  } catch {
    return ''; // tryb lokalny bez Supabase
  }
}

// payload: { mode: 'article', link, title, source, pubDate, topic } | { mode: 'digest', label, items }
// To samo podsumowanie zamówione kilka razy naraz (np. podwójne zamontowanie komponentu) – jedno zapytanie
const inflight = new Map();
export function requestSummary(key, payload, { force = false } = {}) {
  if (!force) {
    const hit = cachedSummary(key);
    if (hit) return Promise.resolve(hit);
  }
  if (inflight.has(key)) return inflight.get(key);
  const p = fetchSummary(key, payload).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function fetchSummary(key, payload) {
  const token = await sessionToken();
  const res = await fetch('/api/news-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.summary) throw new Error(body.error ? `${body.error}${body.detail ? ` – Google: ${body.detail}` : ''}` : (res.status === 404 ? 'Podsumowania AI są dostępne po wdrożeniu na serwerze (Vercel)' : res.status === 504 ? 'Serwer AI nie odpowiedział na czas – spróbuj ponownie za chwilę' : `HTTP ${res.status}`));
  const value = { summary: body.summary, basis: body.basis, ...(body.period ? { period: body.period } : {}), ...(body.note ? { note: body.note } : {}), ...(body.via ? { via: body.via } : {}) };
  writeCache(key, value);
  return value;
}
