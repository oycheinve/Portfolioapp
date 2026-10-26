// Zadania tygodniowe / nawyki: tygodnie ISO ('RRRR-Www'), widoczność zadań w tygodniu, postęp i archiwum oraz zapis –
// w Supabase (tabele weekly_tasks / weekly_task_logs, supabase/weekly_tasks.sql) po zalogowaniu, a w trybie lokalnym
// (albo gdy tabel jeszcze nie utworzono) w localStorage `wealth-app-weekly-tasks-v1` (także w kopii zapasowej JSON).
// Moduł nie zmienia stanu portfela ani tabeli `portfolios`.
import { getClient } from './cloud.js';

export const LOCAL_KEY = 'wealth-app-weekly-tasks-v1';

// ── Tygodnie ISO 8601 (poniedziałek–niedziela) ──
export function weekId(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); // czwartek tego tygodnia wyznacza rok ISO
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// Poniedziałek tygodnia (data lokalna)
export function weekStart(id) {
  const [y, w] = id.split('-W').map(Number);
  const jan4 = new Date(y, 0, 4);
  const monday = new Date(y, 0, 4 - ((jan4.getDay() || 7) - 1));
  monday.setDate(monday.getDate() + (w - 1) * 7);
  return monday;
}

export function shiftWeek(id, delta) {
  const d = weekStart(id);
  d.setDate(d.getDate() + delta * 7);
  return weekId(d);
}

const DM = (d) => `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
export function weekLabel(id) {
  const a = weekStart(id);
  const b = new Date(a);
  b.setDate(b.getDate() + 6);
  return `${DM(a)} – ${DM(b)}.${b.getFullYear()}`;
}
export const weekNumber = (id) => Number(id.split('-W')[1]);

// ── Widoczność i postęp ──
// Cykliczne: od tygodnia utworzenia do tygodnia archiwizacji (wyłącznie); jednorazowe: tylko w swoim tygodniu
export function tasksForWeek(tasks, week) {
  return tasks
    .filter((t) => (t.isRecurring ? t.weekId <= week && (!t.archivedWeek || week < t.archivedWeek) : t.weekId === week))
    .sort((a, b) => Number(b.isRecurring) - Number(a.isRecurring) || a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
}

export const logKey = (taskId, week) => `${taskId}|${week}`;

export function weekProgress(tasks, doneSet, week) {
  const list = tasksForWeek(tasks, week);
  const done = list.filter((t) => doneSet.has(logKey(t.id, week))).length;
  return { total: list.length, done, pct: list.length ? done / list.length : 0 };
}

// Archiwum: minione tygodnie od pierwszego zadania (najnowsze najpierw, najwyżej `limit`)
export function archiveWeeks(tasks, doneSet, current, limit = 12) {
  if (!tasks.length) return [];
  const first = tasks.reduce((m, t) => (t.weekId < m ? t.weekId : m), current);
  const out = [];
  for (let w = shiftWeek(current, -1); w >= first && out.length < limit; w = shiftWeek(w, -1)) {
    const p = weekProgress(tasks, doneSet, w);
    if (p.total) out.push({ week: w, ...p });
  }
  return out;
}

const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

export function makeTask({ title, isRecurring, week }) {
  const now = new Date().toISOString();
  return { id: newId(), title: String(title).trim().slice(0, 120), isRecurring: !!isRecurring, weekId: week, archivedWeek: null, sortOrder: Date.now() % 2147483647, createdAt: now };
}

// ── Zapis lokalny ──
function readLocal() {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
    return { tasks: Array.isArray(v?.tasks) ? v.tasks : [], logs: Array.isArray(v?.logs) ? v.logs : [] };
  } catch {
    return { tasks: [], logs: [] };
  }
}
function writeLocal(data) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('wealth-app-prefs-changed', { detail: { key: LOCAL_KEY } }));
  } catch {
    // brak localStorage
  }
}

export const localStore = {
  kind: 'local',
  async load() {
    return readLocal();
  },
  async addTask(task) {
    const d = readLocal();
    writeLocal({ ...d, tasks: [...d.tasks, task] });
  },
  async archiveTask(id, week) {
    const d = readLocal();
    writeLocal({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, archivedWeek: week } : t)) });
  },
  async deleteTask(id) {
    const d = readLocal();
    writeLocal({ tasks: d.tasks.filter((t) => t.id !== id), logs: d.logs.filter((l) => l.taskId !== id) });
  },
  async setDone(taskId, week, done) {
    const d = readLocal();
    const logs = d.logs.filter((l) => !(l.taskId === taskId && l.weekId === week));
    if (done) logs.push({ taskId, weekId: week, doneAt: new Date().toISOString() });
    writeLocal({ ...d, logs });
  },
};

// ── Zapis w Supabase ──
export class MissingTablesError extends Error {}
const fromRow = (r) => ({ id: r.id, title: r.title, isRecurring: r.is_recurring, weekId: r.week_id, archivedWeek: r.archived_week, sortOrder: r.sort_order ?? 0, createdAt: r.created_at });
function check(error) {
  if (!error) return;
  // Brak tabel (skrypt SQL nie został uruchomiony): 42P01 (Postgres) / PGRST205 (PostgREST)
  if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message || '')) throw new MissingTablesError(error.message);
  throw new Error(error.message || 'Błąd zapisu w chmurze');
}

export function cloudStore(userId) {
  return {
    kind: 'cloud',
    async load() {
      const sb = await getClient();
      const [t, l] = await Promise.all([
        sb.from('weekly_tasks').select('id, title, is_recurring, week_id, archived_week, sort_order, created_at').eq('user_id', userId),
        sb.from('weekly_task_logs').select('task_id, week_id, done_at').eq('user_id', userId),
      ]);
      check(t.error);
      check(l.error);
      return { tasks: (t.data || []).map(fromRow), logs: (l.data || []).map((r) => ({ taskId: r.task_id, weekId: r.week_id, doneAt: r.done_at })) };
    },
    async addTask(task) {
      const sb = await getClient();
      const { error } = await sb.from('weekly_tasks').insert({ id: task.id, user_id: userId, title: task.title, is_recurring: task.isRecurring, week_id: task.weekId, sort_order: task.sortOrder });
      check(error);
    },
    async archiveTask(id, week) {
      const sb = await getClient();
      const { error } = await sb.from('weekly_tasks').update({ archived_week: week, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId);
      check(error);
    },
    async deleteTask(id) {
      const sb = await getClient();
      const { error } = await sb.from('weekly_tasks').delete().eq('id', id).eq('user_id', userId);
      check(error);
    },
    async setDone(taskId, week, done) {
      const sb = await getClient();
      const { error } = done
        ? await sb.from('weekly_task_logs').upsert({ task_id: taskId, week_id: week, user_id: userId, done_at: new Date().toISOString() }, { onConflict: 'task_id,week_id' })
        : await sb.from('weekly_task_logs').delete().eq('task_id', taskId).eq('week_id', week).eq('user_id', userId);
      check(error);
    },
  };
}
