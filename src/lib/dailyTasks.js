// Zadania dzienne / codzienne nawyki: dni kalendarzowe ('RRRR-MM-DD', czas lokalny), widoczność zadań w dniu, postęp,
// historia dni i seria (dni z rzędu) nawyku. Zapis – Supabase (daily_tasks / daily_task_logs, supabase/daily_tasks.sql)
// po zalogowaniu, a w trybie lokalnym (albo gdy tabel jeszcze nie utworzono) localStorage `wealth-app-daily-tasks-v1`.
// Osobne tabele i klucz – zadania tygodniowe (weeklyTasks.js) i portfel pozostają bez zmian.
import { getClient } from './cloud.js';
import { MissingTablesError } from './weeklyTasks.js';

export const DAILY_LOCAL_KEY = 'wealth-app-daily-tasks-v1';

// ── Dni ──
export function dayId(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
const parseDay = (id) => {
  const [y, m, d] = id.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export function shiftDay(id, delta) {
  const d = parseDay(id);
  d.setDate(d.getDate() + delta);
  return dayId(d);
}
const WEEKDAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
export function dayLabel(id) {
  const d = parseDay(id);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export function dayShort(id) {
  const d = parseDay(id);
  return `${WEEKDAYS[d.getDay()].slice(0, 3)}. ${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── Widoczność, postęp, historia ──
// Nawyki: od dnia dodania do dnia zakończenia (wyłącznie); zadania jednodniowe: tylko w swoim dniu
export function tasksForDay(tasks, day) {
  return tasks
    .filter((t) => (t.isRecurring ? t.day <= day && (!t.archivedDay || day < t.archivedDay) : t.day === day))
    .sort((a, b) => Number(b.isRecurring) - Number(a.isRecurring) || a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
}

export const dayKey = (taskId, day) => `${taskId}|${day}`;

export function dayProgress(tasks, doneSet, day) {
  const list = tasksForDay(tasks, day);
  const done = list.filter((t) => doneSet.has(dayKey(t.id, day))).length;
  return { total: list.length, done, pct: list.length ? done / list.length : 0 };
}

// Historia: minione dni z zadaniami (najnowsze najpierw, najwyżej `limit`)
export function historyDays(tasks, doneSet, today, limit = 14) {
  if (!tasks.length) return [];
  const first = tasks.reduce((m, t) => (t.day < m ? t.day : m), today);
  const out = [];
  for (let d = shiftDay(today, -1); d >= first && out.length < limit; d = shiftDay(d, -1)) {
    const p = dayProgress(tasks, doneSet, d);
    if (p.total) out.push({ day: d, ...p });
  }
  return out;
}

// Seria nawyku: kolejne wykonane dni do wskazanego dnia (dzień jeszcze nieodhaczony nie przerywa serii)
export function habitStreak(task, doneSet, day) {
  let d = doneSet.has(dayKey(task.id, day)) ? day : shiftDay(day, -1);
  let n = 0;
  while (d >= task.day && doneSet.has(dayKey(task.id, d))) {
    n += 1;
    d = shiftDay(d, -1);
  }
  return n;
}

const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

export function makeDailyTask({ title, isRecurring, day }) {
  return { id: newId(), title: String(title).trim().slice(0, 120), isRecurring: !!isRecurring, day, archivedDay: null, sortOrder: Date.now() % 2147483647, createdAt: new Date().toISOString() };
}

// ── Zapis lokalny ──
function readLocal() {
  try {
    const v = JSON.parse(localStorage.getItem(DAILY_LOCAL_KEY) || 'null');
    return { tasks: Array.isArray(v?.tasks) ? v.tasks : [], logs: Array.isArray(v?.logs) ? v.logs : [] };
  } catch {
    return { tasks: [], logs: [] };
  }
}
function writeLocal(data) {
  try {
    localStorage.setItem(DAILY_LOCAL_KEY, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('wealth-app-prefs-changed', { detail: { key: DAILY_LOCAL_KEY } }));
  } catch {
    // brak localStorage
  }
}

export const dailyLocalStore = {
  kind: 'local',
  async load() {
    return readLocal();
  },
  async addTask(task) {
    const d = readLocal();
    writeLocal({ ...d, tasks: [...d.tasks, task] });
  },
  async archiveTask(id, day) {
    const d = readLocal();
    writeLocal({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, archivedDay: day } : t)) });
  },
  async deleteTask(id) {
    const d = readLocal();
    writeLocal({ tasks: d.tasks.filter((t) => t.id !== id), logs: d.logs.filter((l) => l.taskId !== id) });
  },
  async setDone(taskId, day, done) {
    const d = readLocal();
    const logs = d.logs.filter((l) => !(l.taskId === taskId && l.day === day));
    if (done) logs.push({ taskId, day, doneAt: new Date().toISOString() });
    writeLocal({ ...d, logs });
  },
};

// ── Zapis w Supabase ──
const fromRow = (r) => ({ id: r.id, title: r.title, isRecurring: r.is_recurring, day: r.day, archivedDay: r.archived_day, sortOrder: r.sort_order ?? 0, createdAt: r.created_at });
function check(error) {
  if (!error) return;
  if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message || '')) throw new MissingTablesError(error.message);
  throw new Error(error.message || 'Błąd zapisu w chmurze');
}

export function dailyCloudStore(userId) {
  return {
    kind: 'cloud',
    async load() {
      const sb = await getClient();
      const [t, l] = await Promise.all([
        sb.from('daily_tasks').select('id, title, is_recurring, day, archived_day, sort_order, created_at').eq('user_id', userId),
        sb.from('daily_task_logs').select('task_id, day, done_at').eq('user_id', userId),
      ]);
      check(t.error);
      check(l.error);
      return { tasks: (t.data || []).map(fromRow), logs: (l.data || []).map((r) => ({ taskId: r.task_id, day: r.day, doneAt: r.done_at })) };
    },
    async addTask(task) {
      const sb = await getClient();
      const { error } = await sb.from('daily_tasks').insert({ id: task.id, user_id: userId, title: task.title, is_recurring: task.isRecurring, day: task.day, sort_order: task.sortOrder });
      check(error);
    },
    async archiveTask(id, day) {
      const sb = await getClient();
      const { error } = await sb.from('daily_tasks').update({ archived_day: day, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId);
      check(error);
    },
    async deleteTask(id) {
      const sb = await getClient();
      const { error } = await sb.from('daily_tasks').delete().eq('id', id).eq('user_id', userId);
      check(error);
    },
    async setDone(taskId, day, done) {
      const sb = await getClient();
      const { error } = done
        ? await sb.from('daily_task_logs').upsert({ task_id: taskId, day, user_id: userId, done_at: new Date().toISOString() }, { onConflict: 'task_id,day' })
        : await sb.from('daily_task_logs').delete().eq('task_id', taskId).eq('day', day).eq('user_id', userId);
      check(error);
    },
  };
}
