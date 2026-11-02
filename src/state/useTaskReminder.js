import { useEffect, useRef } from 'react';
import { loadAllTasks } from '../lib/taskStats.js';
import { dayId, dayKey, tasksForDay } from '../lib/dailyTasks.js';
import { markSent, readNotifySettings, sentToday, showNotification } from '../lib/notifications.js';

const CHECK_MS = 5 * 60 * 1000;

// Przypomnienie o niewykonanych zadaniach dziennych: raz dziennie od godziny z ustawień, gdy aplikacja działa
// (sprawdzenie przy starcie, co 5 min i przy powrocie do aplikacji). Nie zmienia danych zadań.
export function useTaskReminder(userId) {
  const busy = useRef(false);
  useEffect(() => {
    const check = async () => {
      const s = readNotifySettings();
      const now = new Date();
      const today = dayId(now);
      if (!s.enabled || busy.current || now.getHours() < s.taskHour || sentToday('tasks', today)) return;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      busy.current = true;
      try {
        const { daily } = await loadAllTasks(userId);
        const list = tasksForDay(daily.tasks, today);
        const done = new Set(daily.logs.map((l) => dayKey(l.taskId, l.day)));
        const left = list.filter((t) => !done.has(dayKey(t.id, today)));
        markSent('tasks', today);
        if (left.length) {
          const names = left.slice(0, 3).map((t) => t.title).join(', ');
          await showNotification(`Zadania na dziś: zostało ${left.length}`, { body: names + (left.length > 3 ? '…' : ''), url: '/#/tasks', tag: 'tasks-daily' });
        }
      } catch {
        // brak danych – spróbuj przy kolejnym sprawdzeniu
      } finally {
        busy.current = false;
      }
    };
    const t = setInterval(check, CHECK_MS);
    const first = setTimeout(check, 4000);
    const onVis = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      clearTimeout(first);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [userId]);
}
