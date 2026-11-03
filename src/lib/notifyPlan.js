// Treść powiadomień – czyste funkcje wspólne dla aplikacji (harmonogram lokalny) i serwera (/api/push-cron):
//  • wieczorne przypomnienie o niewykonanych zadaniach dziennych,
//  • poranne / południowe podsumowanie wiadomości z poprzedniego dnia o spółkach z portfela (od progu liczby artykułów).
// Bez zależności od przeglądarki i Reacta.
import { GENERAL_ID, classifyArticle } from './newsSubject.js';

export const NEWS_SLOTS = { MORNING: { hour: 8, label: 'rano (8:00)' }, NOON: { hour: 12, label: 'w południe (12:00)' } };

export const DEFAULT_PREFS = {
  enabled: false, // powiadomienia na tym urządzeniu (zgoda systemu + włącznik)
  tasks: { on: true, hour: 20 },
  news: { on: false, min: 3, slot: 'MORNING' },
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
  const names = left.slice(0, 3).map((t) => t.title).join(', ');
  return {
    title: `Zadania na dziś: zostało ${left.length}`,
    body: `${names}${left.length > 3 ? '…' : ''} – uzupełnij przed końcem dnia.`,
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
  const top = digest.byCompany.slice(0, 4).map((c) => `${c.label} (${c.count})`).join(', ');
  const n = digest.total;
  return {
    title: `Wczoraj: ${n} ${n === 1 ? 'artykuł' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'artykuły' : 'artykułów'} o Twoich spółkach`,
    body: `${top}${digest.byCompany.length > 4 ? '…' : ''}`,
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
