// Treść powiadomień – czyste funkcje wspólne dla aplikacji (harmonogram lokalny) i serwera (/api/push-cron):
//  • wieczorne przypomnienie o niewykonanych zadaniach dziennych,
//  • poranne / południowe podsumowanie wiadomości z poprzedniego dnia o spółkach z portfela (od progu liczby artykułów),
//  • zmiany notowań – dzisiejsza zmiana spółki z portfela przekracza próg (domyślnie ±4%).
// Bez zależności od przeglądarki i Reacta.
import { GENERAL_ID, classifyArticle } from './newsSubject.js';

// Stały tytuł wszystkich powiadomień (zamiast adresu domeny); treść niesie cała wiadomość
export const NOTIFY_TITLE = 'FinTrack 📊';

// Odmiana: 1 zadanie, 2–4 zadania, 5+ zadań
export const plural = (n, one, few, many) => (n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);

export const NEWS_SLOTS = { MORNING: { hour: 8, label: 'rano (8:00)' }, NOON: { hour: 12, label: 'w południe (12:00)' } };

export const DEFAULT_PREFS = {
  enabled: false, // powiadomienia na tym urządzeniu (zgoda systemu + włącznik)
  tasks: { on: true, hour: 20 },
  news: { on: false, min: 3, slot: 'MORNING' },
  prices: { on: false, threshold: 4 },
};

// Ustawienia z zapisu (także starszego formatu { enabled, taskHour }) z poprawnymi wartościami domyślnymi
export function normalizePrefs(raw = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const hour = (h, d) => (Number.isInteger(h) && h >= 0 && h <= 23 ? h : d);
  return {
    enabled: !!r.enabled,
    tasks: { on: r.tasks ? r.tasks.on !== false : true, hour: hour(r.tasks?.hour ?? r.taskHour, DEFAULT_PREFS.tasks.hour) },
    news: {
      on: !!r.news?.on,
      min: Math.max(1, Math.min(50, Math.round(Number(r.news?.min) || DEFAULT_PREFS.news.min))),
      slot: NEWS_SLOTS[r.news?.slot] ? r.news.slot : DEFAULT_PREFS.news.slot,
    },
    prices: {
      on: !!r.prices?.on,
      threshold: Math.max(1, Math.min(20, Number(r.prices?.threshold) || DEFAULT_PREFS.prices.threshold)),
    },
  };
}

// Dzień kalendarzowy 'RRRR-MM-DD' i godzina w wybranej strefie czasowej (serwer liczy w strefie użytkownika)
export function localClock(now = new Date(), timeZone) {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
        .formatToParts(now)
        .map((p) => [p.type, p.value]),
    );
    return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
  } catch {
    const d = now;
    return { day: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, hour: d.getHours() };
  }
}

export function previousDay(day) {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - 1));
  return t.toISOString().slice(0, 10);
}

// Zadania dzienne widoczne w dniu (nawyki od dnia startu do zakończenia, jednodniowe w swoim dniu), niewykonane
export function unfinishedDailyTasks({ tasks = [], logs = [] }, day) {
  const done = new Set(logs.map((l) => `${l.taskId}|${l.day}`));
  return tasks
    .filter((t) => (t.isRecurring ? t.day <= day && (!t.archivedDay || day < t.archivedDay) : t.day === day))
    .filter((t) => !done.has(`${t.id}|${day}`));
}

export function tasksReminderMessage(left) {
  if (!left.length) return null;
  const n = left.length;
  const names = left.slice(0, 3).map((t) => t.title).join(', ');
  return {
    title: NOTIFY_TITLE,
    body: `⏳ ${plural(n, 'Zostało Ci 1 zadanie', `Zostały Ci ${n} zadania`, `Zostało Ci ${n} zadań`)} na dziś: ${names}${n > 3 ? ` i ${n - 3} więcej` : ''}. ✅ Odhacz je przed końcem dnia!`,
    url: '/#/tasks',
    tag: 'tasks-daily',
  };
}

// Dzień publikacji artykułu w strefie czasowej użytkownika
const pubDay = (iso, timeZone) => (iso ? localClock(new Date(iso), timeZone).day : null);

// Podsumowanie: artykuły z danego dnia, których głównym podmiotem jest spółka z portfela (bez „Analiz ogólnych”)
export function newsDigest(items, topics, day, timeZone) {
  const byId = Object.fromEntries(topics.map((t) => [t.id, t]));
  const seen = new Set();
  const counts = new Map();
  for (const it of items) {
    if (!it?.link || seen.has(it.link) || pubDay(it.pubDate, timeZone) !== day) continue;
    seen.add(it.link);
    const { mainId } = classifyArticle(it, topics);
    if (mainId === GENERAL_ID || !byId[mainId]) continue;
    counts.set(mainId, (counts.get(mainId) || 0) + 1);
  }
  const byCompany = [...counts.entries()].map(([id, count]) => ({ id, label: byId[id].label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pl'));
  return { total: byCompany.reduce((s, c) => s + c.count, 0), byCompany };
}

export function newsDigestMessage(digest, min) {
  if (!digest || digest.total < Math.max(1, min)) return null;
  const n = digest.total;
  const count = plural(n, 'pojawił się 1 nowy artykuł', `pojawiły się ${n} nowe artykuły`, `pojawiło się ${n} nowych artykułów`);
  return {
    title: NOTIFY_TITLE,
    // Krótko, bez listy spółek (szczegóły po kliknięciu w zakładce Newsy)
    body: `📰 Wczoraj ${count} o Twoich spółkach. Sprawdź, co słychać na rynkach! 🚀`,
    url: '/#/news',
    tag: 'news-digest',
  };
}

// Czy o tej godzinie (lokalnie) należy wysłać dany rodzaj powiadomienia i czy nie wysłano go już dziś
export function dueKinds(prefs, clock, lastSent = {}) {
  const p = normalizePrefs(prefs);
  const out = [];
  if (p.tasks.on && clock.hour >= p.tasks.hour && lastSent.tasks !== clock.day) out.push('tasks');
  // Podsumowanie wiadomości w oknie 6 godzin od wybranej pory (nie wieczorem, gdy aplikację otwarto później)
  const h = NEWS_SLOTS[p.news.slot].hour;
  if (p.news.on && clock.hour >= h && clock.hour < h + 6 && lastSent.news !== clock.day) out.push('news');
  return out;
}

// ── Zmiany notowań (alarm cenowy) ──
// changes: [{ id, label, title, pct }] – dzisiejsza zmiana (ułamek, np. -0.046); próg (domyślnie ±4%) jest tylko
// warunkiem wysyłki i nie trafia do treści. Anty-spam: o danej spółce najwyżej jedno powiadomienie dziennie w danym
// kierunku; drugie tylko przy zwrocie (np. spadek ponad próg, potem wzrost ponad próg) – alert z reversal: true.
// state: { day, levels: { [id]: ±1 – wysłano w tym kierunku, 'both' – wysłano w obu (koniec na dziś) } } – zapis
// wysłanych (starsze poziomy ±2… liczą się jako ten sam kierunek).
export function priceAlerts(changes, threshold, state = {}, day) {
  const t = Math.max(0.1, Number(threshold) || DEFAULT_PREFS.prices.threshold);
  const prev = state && state.day === day ? state.levels || {} : {};
  const levels = { ...prev };
  const alerts = [];
  for (const c of changes) {
    if (!Number.isFinite(c?.pct)) continue;
    if (Math.abs(c.pct * 100) + 1e-9 < t) continue;
    const dir = Math.sign(c.pct);
    const before = prev[c.id];
    if (before === 'both' || Math.sign(before || 0) === dir) continue; // w tym kierunku już dziś wysłano
    const reversal = Math.sign(before || 0) === -dir;
    levels[c.id] = reversal ? 'both' : dir;
    alerts.push({ ...c, level: dir, reversal });
  }
  alerts.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  return { alerts, state: { day, levels } };
}

const arrow = (pct) => (pct < 0 ? '📉' : '📈');
const fmtPct = (pct) => `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct * 100).toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

// Treść bez progu: „📈 Zmiana notowań: X zanotowała zmianę o +4,9%!”; przy zwrocie w ciągu dnia –
// „🔄 Odbicie: X …” (ze spadku na wzrost) albo „🔄 Zwrot w dół: X …” (ze wzrostu na spadek)
export function priceAlertMessage(alerts) {
  if (!alerts.length) return null;
  const name = (a) => a.title || a.label;
  const msg = (body) => ({ title: NOTIFY_TITLE, body, url: '/#/portfolio', tag: 'price-alert', renotify: true });
  if (alerts.length === 1) {
    const a = alerts[0];
    if (a.reversal) return msg(`🔄 ${a.pct > 0 ? 'Odbicie' : 'Zwrot w dół'}: ${name(a)} zanotowała zmianę o ${fmtPct(a.pct)}! ${arrow(a.pct)}`);
    return msg(`${arrow(a.pct)} Zmiana notowań: ${name(a)} zanotowała zmianę o ${fmtPct(a.pct)}!`);
  }
  const list = alerts.slice(0, 5).map((a) => `${a.reversal ? '🔄' : arrow(a.pct)} ${a.label} ${fmtPct(a.pct)}`).join(' · ');
  return msg(`📊 Zmiany notowań (${alerts.length}): ${list}${alerts.length > 5 ? '…' : ''}`);
}
