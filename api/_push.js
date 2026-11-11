// Wspólna logika serwerowych powiadomień Web Push (Vercel). Plik z „_” nie jest publicznym endpointem.
// Zmienne środowiskowe (Vercel → Settings → Environment Variables):
//   SUPABASE_URL (albo VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY – dostęp serwera do tabel (omija RLS),
//   VAPID_PUBLIC_KEY (albo VITE_VAPID_PUBLIC_KEY), VAPID_PRIVATE_KEY, VAPID_SUBJECT (np. mailto:ty@example.com),
//   CRON_SECRET – sekret wywołań /api/push-cron (harmonogram w Supabase: pg_cron, supabase/push_subscriptions.sql).
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { env, envLike, supabaseServiceKey, supabaseUrl } from './_env.js';
import { fetchNews } from './news.js';
import { proxyYahoo } from './yahoo.js';
import { parseYahooChart } from '../src/lib/prices.js';
import { quoteDayChangePct } from '../src/lib/engine.js';
import { dueKinds, localClock, newsDigest, newsDigestMessage, normalizePrefs, previousDay, priceAlertMessage, priceAlerts, tasksReminderMessage, unfinishedDailyTasks } from '../src/lib/notifyPlan.js';

const MAX_TOPICS = 15;

export function pushConfig() {
  const cfg = {
    supabaseUrl: supabaseUrl(),
    serviceKey: supabaseServiceKey(),
    vapidPublic: env('VAPID_PUBLIC_KEY', 'VITE_VAPID_PUBLIC_KEY') || envLike(/VAPID.*PUB|PUB.*VAPID/),
    vapidPrivate: env('VAPID_PRIVATE_KEY') || envLike(/VAPID.*PRIV|PRIV.*VAPID/),
    vapidSubject: env('VAPID_SUBJECT') || 'mailto:admin@example.com',
    cronSecret: env('CRON_SECRET'),
  };
  const missing = [
    !cfg.supabaseUrl && 'SUPABASE_URL',
    !cfg.serviceKey && 'SUPABASE_SERVICE_ROLE_KEY',
    !cfg.vapidPublic && 'VAPID_PUBLIC_KEY',
    !cfg.vapidPrivate && 'VAPID_PRIVATE_KEY',
  ].filter(Boolean);
  return { ...cfg, missing };
}

export function serviceClient(cfg) {
  return createClient(cfg.supabaseUrl, cfg.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

let vapidSet = '';
export async function sendPush(cfg, sub, message) {
  if (vapidSet !== cfg.vapidPublic) {
    webpush.setVapidDetails(cfg.vapidSubject, cfg.vapidPublic, cfg.vapidPrivate);
    vapidSet = cfg.vapidPublic;
  }
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(message), { TTL: 6 * 3600, urgency: 'normal' });
    return { ok: true };
  } catch (e) {
    // 404 / 410 – subskrypcja wygasła (odinstalowana aplikacja, cofnięta zgoda) – do usunięcia
    return { ok: false, gone: e.statusCode === 404 || e.statusCode === 410, error: e.statusCode ? `HTTP ${e.statusCode}` : e.message };
  }
}

async function loadDailyTasks(sb, userId) {
  const [t, l] = await Promise.all([
    sb.from('daily_tasks').select('id, title, is_recurring, day, archived_day').eq('user_id', userId),
    sb.from('daily_task_logs').select('task_id, day').eq('user_id', userId),
  ]);
  if (t.error || l.error) return { tasks: [], logs: [] }; // brak tabel zadań dziennych – brak przypomnienia
  return {
    tasks: (t.data || []).map((r) => ({ id: r.id, title: r.title, isRecurring: r.is_recurring, day: r.day, archivedDay: r.archived_day })),
    logs: (l.data || []).map((r) => ({ taskId: r.task_id, day: r.day })),
  };
}

async function loadNews(watch) {
  const topics = (Array.isArray(watch) ? watch : []).filter((t) => t?.id && t?.query).slice(0, MAX_TOPICS);
  const items = [];
  for (let i = 0; i < topics.length; i += 3) {
    const batch = await Promise.all(topics.slice(i, i + 3).map((t) => fetchNews(t.query, t.symbol).then((r) => r.body?.items || []).catch(() => [])));
    items.push(...batch.flat());
  }
  return { topics, items };
}

// Dzisiejsza zmiana notowania symbolu (Yahoo / Stooq przez ten sam pośrednik co aplikacja); null – brak danych
async function quoteChange(symbol, now) {
  if (!symbol) return null;
  try {
    const r = await proxyYahoo(`/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`);
    if (r.status !== 200) return null;
    const q = parseYahooChart(JSON.parse(r.body));
    return quoteDayChangePct(q, now);
  } catch {
    return null;
  }
}

async function loadChanges(watch, now, cache) {
  const topics = (Array.isArray(watch) ? watch : []).filter((t) => t?.id && t?.symbol).slice(0, MAX_TOPICS);
  // Po 4 symbole naraz (wspólna pamięć między subskrypcjami w jednym przebiegu)
  const todo = [...new Set(topics.map((t) => t.symbol))].filter((s) => !cache.has(s));
  for (let i = 0; i < todo.length; i += 4) {
    const chunk = todo.slice(i, i + 4);
    const res = await Promise.all(chunk.map((s) => quoteChange(s, now)));
    chunk.forEach((s, j) => cache.set(s, res[j]));
  }
  return topics
    .map((t) => ({ id: t.id, label: t.label, title: t.title || t.label, pct: cache.get(t.symbol) }))
    .filter((c) => Number.isFinite(c.pct));
}

// Sesje giełdowe: dni robocze 9:00–22:00 w strefie użytkownika (GPW, giełdy europejskie i sesja w USA)
function marketWindow(now, timeZone) {
  try {
    const wd = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now);
    const { hour } = localClock(now, timeZone);
    return wd !== 'Sat' && wd !== 'Sun' && hour >= 9 && hour < 22;
  } catch {
    return true;
  }
}

// Przegląd wszystkich subskrypcji: co jest należne o tej godzinie (strefa użytkownika), treść i wysyłka.
// dry – bez wysyłki i bez zapisu last_sent (podgląd planu). Zwraca raport.
export async function runPushCron({ cfg, sb, now = new Date(), dry = false, loaders = {} }) {
  const loadTasks = loaders.loadTasks || ((userId) => loadDailyTasks(sb, userId));
  const loadNewsFn = loaders.loadNews || loadNews;
  const send = loaders.send || ((sub, msg) => sendPush(cfg, sub, msg));
  const quoteCache = new Map();
  const loadChangesFn = loaders.loadChanges || ((watch) => loadChanges(watch, now, quoteCache));
  const { data: subs, error } = await sb.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth, prefs, watch, tz, last_sent');
  if (error) throw new Error(error.message);
  const report = [];
  const taskCache = new Map();
  for (const sub of subs || []) {
    const prefs = normalizePrefs(sub.prefs);
    if (!prefs.enabled) continue;
    const clock = localClock(now, sub.tz || 'Europe/Warsaw');
    const kinds = dueKinds(prefs, clock, sub.last_sent || {});
    if (prefs.prices.on && (loaders.anyTime || marketWindow(now, sub.tz || 'Europe/Warsaw'))) kinds.push('prices'); // zmiany notowań – co godzinę w czasie sesji
    // Ślad przebiegu harmonogramu (diagnostyka w aplikacji: „serwer ostatnio sprawdzał …”)
    const lastSent = { ...(sub.last_sent || {}), checked: now.toISOString() };
    if (!kinds.length) {
      if (!dry) await sb.from('push_subscriptions').update({ last_sent: lastSent }).eq('id', sub.id);
      continue;
    }
    for (const kind of kinds) {
      let msg = null;
      if (kind === 'tasks') {
        if (!taskCache.has(sub.user_id)) taskCache.set(sub.user_id, await loadTasks(sub.user_id));
        msg = tasksReminderMessage(unfinishedDailyTasks(taskCache.get(sub.user_id), clock.day));
      } else if (kind === 'news') {
        const { topics, items } = await loadNewsFn(sub.watch);
        msg = topics.length ? newsDigestMessage(newsDigest(items, topics, previousDay(clock.day), sub.tz), prefs.news.min) : null;
      } else if (kind === 'prices') {
        const { alerts, state } = priceAlerts(await loadChangesFn(sub.watch), prefs.prices.threshold, lastSent.prices, clock.day);
        msg = priceAlertMessage(alerts);
        lastSent.prices = state;
        if (!msg) continue; // bez przekroczeń – bez wpisu w raporcie
      }
      const entry = { sub: sub.id, user: sub.user_id, kind, day: clock.day, hour: clock.hour, message: msg };
      if (msg && !dry) {
        const r = await send(sub, msg);
        entry.sent = r.ok;
        if (!r.ok) entry.error = r.error;
        if (r.gone) {
          await sb.from('push_subscriptions').delete().eq('id', sub.id);
          entry.removed = true;
          break;
        }
      }
      // Odnotowanie także bez treści (np. wszystkie zadania wykonane) – kolejne sprawdzenie dopiero następnego dnia
      if (kind !== 'prices') lastSent[kind] = clock.day;
      report.push(entry);
    }
    if (!dry && !report.some((e) => e.sub === sub.id && e.removed)) {
      await sb.from('push_subscriptions').update({ last_sent: lastSent }).eq('id', sub.id);
    }
  }
  return report;
}

export function bearer(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || '';
  return String(h).replace(/^Bearer\s+/i, '').trim();
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
