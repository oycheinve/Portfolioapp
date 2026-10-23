// Wiadomości giełdowe przez serwer aplikacji (/api/news: Google News RSS + Yahoo Finance) – Google News nie obsługuje
// CORS, więc pobieranie wyłącznie przez własny endpoint. Wyniki trzymane w pamięci 5 min (odświeżenie je pomija).
import { mapLimited } from './yahooFetch.js';

const TTL_MS = 5 * 60 * 1000;
const cache = new Map();

export const TOPICS_KEY = 'wealth-app-news-topics';

export function readTopics() {
  try {
    const v = JSON.parse(localStorage.getItem(TOPICS_KEY) || '[]');
    return Array.isArray(v) ? v.filter((t) => typeof t === 'string' && t.trim()) : [];
  } catch {
    return [];
  }
}

export function writeTopics(list) {
  try {
    localStorage.setItem(TOPICS_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('wealth-app-prefs-changed', { detail: { key: TOPICS_KEY } }));
  } catch {
    // brak localStorage – tematy tylko do końca sesji
  }
}

// Temat → { items: [{ title, link, pubDate, source }], errors }
const pending = new Map(); // to samo zapytanie w toku – jedno pobranie

export function fetchNews(topic, { force = false } = {}) {
  const key = `${topic.query}|${topic.symbol || ''}`;
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.data);
  if (!force && pending.has(key)) return pending.get(key);
  const run = load(topic, force, key).finally(() => pending.delete(key));
  pending.set(key, run);
  return run;
}

async function load({ query, symbol }, force, key) {
  const params = new URLSearchParams({ q: query });
  if (symbol) params.set('symbol', symbol);
  if (force) params.set('t', String(Date.now()));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`/api/news?${params}`, { signal: controller.signal, cache: force ? 'no-store' : 'default', headers: { Accept: 'application/json' } });
    const text = await res.text();
    if (!/^\s*\{/.test(text)) throw new Error(res.ok ? 'odpowiedź nie jest JSON' : `HTTP ${res.status}`);
    const data = JSON.parse(text);
    if (!res.ok && !data.items?.length) throw new Error(data.errors?.join('; ') || `HTTP ${res.status}`);
    const out = { items: Array.isArray(data.items) ? data.items : [], errors: data.errors || [] };
    cache.set(key, { at: Date.now(), data: out });
    return out;
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'przekroczony czas' : e.message);
  } finally {
    clearTimeout(timer);
  }
}

// Kilka tematów naraz („Wszystkie moje spółki”): wspólna lista od najnowszych, każda pozycja z nazwą tematu
export async function fetchNewsMany(topics, opts) {
  const errors = [];
  const lists = await mapLimited(topics, 3, async (t) => {
    try {
      const r = await fetchNews(t, opts);
      return r.items.map((it) => ({ ...it, topic: t.label }));
    } catch (e) {
      errors.push(`${t.label}: ${e.message}`);
      return [];
    }
  });
  const seen = new Set();
  const items = lists
    .flat()
    .filter((it) => (seen.has(it.link) ? false : seen.add(it.link)))
    .sort((a, b) => (b.pubDate || '').localeCompare(a.pubDate || ''));
  return { items, errors };
}

export function timeAgo(iso, now = Date.now()) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const min = Math.round((now - t) / 60000);
  if (min < 1) return 'przed chwilą';
  if (min < 60) return `${min} min temu`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} godz. temu`;
  const d = Math.round(h / 24);
  if (d < 7) return d === 1 ? 'wczoraj' : `${d} dni temu`;
  return new Date(t).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
}
