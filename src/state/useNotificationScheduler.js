import { useEffect, useRef } from 'react';
import { loadAllTasks } from '../lib/taskStats.js';
import { fetchNewsMany, heldNewsTopics } from '../lib/news.js';
import { dueKinds, localClock, newsDigest, newsDigestMessage, previousDay, priceAlertMessage, priceAlerts, tasksReminderMessage, unfinishedDailyTasks } from '../lib/notifyPlan.js';
import { heldDayChanges } from '../lib/priceAlerts.js';
import { markSent, notificationPermission, readNotifySettings, readSent, showNotification, syncPushSubscription, writeSentState } from '../lib/notifications.js';

const CHECK_MS = 5 * 60 * 1000;
const MAX_TOPICS = 15;

// Harmonogram powiadomień w aplikacji (gdy działa – także w tle): wieczorne przypomnienie o niewykonanych zadaniach
// i poranne / południowe podsumowanie wiadomości z poprzedniego dnia o spółkach z portfela. Raz dziennie każdego
// rodzaju. Przy aktywnym Web Push serwer wysyła te same powiadomienia także przy zamkniętej aplikacji – ten sam `tag`
// sprawia, że system zastępuje powiadomienie zamiast je dublować. Dodatkowo synchronizuje ustawienia i spółki w
// subskrypcji Web Push (serwer korzysta z aktualnej godziny i listy spółek).
export function useNotificationScheduler(state, userId) {
  const busy = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const check = async () => {
      const prefs = readNotifySettings();
      if (!prefs.enabled || busy.current || notificationPermission() !== 'granted') return;
      const clock = localClock(new Date());
      const kinds = dueKinds(prefs, clock, readSent());
      if (!kinds.length) return;
      busy.current = true;
      try {
        if (userId) await syncPushSubscription(userId, prefs, heldNewsTopics(stateRef.current).slice(0, MAX_TOPICS)).catch(() => false);
        for (const kind of kinds) {
          markSent(kind, clock.day);
          if (kind === 'tasks') {
            const { daily } = await loadAllTasks(userId);
            const msg = tasksReminderMessage(unfinishedDailyTasks(daily, clock.day));
            if (msg) await showNotification(msg.title, msg);
          } else if (kind === 'news') {
            const topics = heldNewsTopics(stateRef.current).slice(0, MAX_TOPICS);
            if (!topics.length) continue;
            const { items } = await fetchNewsMany(topics, { force: false });
            const msg = newsDigestMessage(newsDigest(items, topics, previousDay(clock.day)), prefs.news.min);
            if (msg) await showNotification(msg.title, msg);
          }
        }
      } catch {
        // brak danych / sieci – kolejna próba przy następnym sprawdzeniu następnego dnia
      } finally {
        busy.current = false;
      }
    };
    const t = setInterval(check, CHECK_MS);
    const first = setTimeout(check, 4000);
    const onVis = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('wealth-app-notify-check', check);
    return () => {
      clearInterval(t);
      clearTimeout(first);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('wealth-app-notify-check', check);
    };
  }, [userId]);

  // Krytyczne zmiany notowań: sprawdzenie po każdym pobraniu kursów (automatycznym i ręcznym)
  const lastRefresh = state.prices?.lastRefresh;
  useEffect(() => {
    const prefs = readNotifySettings();
    if (!lastRefresh || !prefs.enabled || !prefs.prices.on || notificationPermission() !== 'granted') return;
    const day = localClock(new Date()).day;
    const { alerts, state: next } = priceAlerts(heldDayChanges(stateRef.current), prefs.prices.threshold, readSent().prices, day);
    writeSentState('prices', next);
    const msg = priceAlertMessage(alerts, prefs.prices.threshold);
    if (msg) showNotification(msg.title, msg);
  }, [lastRefresh]);
}
