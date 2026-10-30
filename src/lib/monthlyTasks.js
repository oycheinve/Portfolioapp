// Zadania miesięczne: miesiące 'RRRR-MM' (czas lokalny), widoczność zadań w miesiącu, postęp i historia miesięcy.
// Zapis – Supabase (monthly_tasks / monthly_task_logs, supabase/monthly_tasks.sql) po zalogowaniu, a w trybie lokalnym
// (albo gdy tabel jeszcze nie utworzono) localStorage `wealth-app-monthly-tasks-v1`.
// Osobne tabele i klucz – zadania dzienne, tygodniowe i portfel pozostają bez zmian.
import { getClient } from './cloud.js';
import { MissingTablesError } from './weeklyTasks.js';

export const MONTHLY_LOCAL_KEY = 'wealth-app-monthly-tasks-v1';

// ── Miesiące ──
export function monthId(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
export function shiftMonthId(id, delta) {
  const [y, m] = id.split('-').map(Number);
  return monthId(new Date(y, m - 1 + delta, 1));
}
const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
export function monthLabel(id) {
  const [y, m] = id.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
// Pierwszy i ostatni dzień miesiąca (Date, czas lokalny)
export function monthBounds(id) {
  const [y, m] = id.split('-').map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0) };
}
export function daysLeftInMonth(id, now = new Date()) {
  const { end } = monthBounds(id);
  return monthId(now) === id ? end.getDate() - now.getDate() + 1 : 0;
}

// ── Widoczność, postęp, historia ──
// Co miesiąc: od miesiąca dodania do miesiąca zakończenia (wyłącznie); jednorazowe: tylko w swoim miesiącu
export function tasksForMonth(tasks, month) {
  return tasks
    .filter((t) => (t.isRecurring ? t.month <= month && (!t.archivedMonth || month < t.archivedMonth) : t.month === month))
    .sort((a, b) => Number(b.isRecurring) - Number(a.isRecurring) || a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
}

export const monthKey = (taskId, month) => `${taskId}|${month}`;

// Wpisy wykonania: done === false – tylko częściowy postęp (cel liczbowy jeszcze nieosiągnięty)
export const monthDoneSet = (logs) => new Set(logs.filter((l) => l.done !== false).map((l) => monthKey(l.taskId, l.month)));
export const monthProgressMap = (logs) => new Map(logs.filter((l) => Number(l.progress) > 0).map((l) => [monthKey(l.taskId, l.month), Number(l.progress)]));
export const hasTarget = (t) => Number(t?.target) > 0;

export function monthProgress(tasks, doneSet, month) {
  // doneSet – monthDoneSet(logs): wpisy z częściowym postępem (done === false) nie liczą się jako wykonane
  const list = tasksForMonth(tasks, month);
  const done = list.filter((t) => doneSet.has(monthKey(t.id, month))).length;
  return { total: list.length, done, pct: list.length ? done / list.length : 0 };
}

// Historia: minione miesiące z zadaniami (najnowsze najpierw, najwyżej `limit`)
export function historyMonths(tasks, doneSet, current, limit = 12) {
  if (!tasks.length) return [];
  const first = tasks.reduce((m, t) => (t.month < m ? t.month : m), current);
  const out = [];
  for (let m = shiftMonthId(current, -1); m >= first && out.length < limit; m = shiftMonthId(m, -1)) {
    const p = monthProgress(tasks, doneSet, m);
    if (p.total) out.push({ month: m, ...p });
  }
  return out;
}

const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

// target / unit / step – opcjonalny postęp liczbowy na miesiąc (jak w Celach)
export function makeMonthlyTask({ title, isRecurring, month, target = null, unit = '', step = 1 }) {
  const t = Number(target) > 0 ? Number(target) : null;
  return {
    id: newId(),
    title: String(title).trim().slice(0, 120),
    isRecurring: !!isRecurring,
    month,
    archivedMonth: null,
    sortOrder: Date.now() % 2147483647,
    createdAt: new Date().toISOString(),
    target: t,
    unit: t ? String(unit || '').trim().slice(0, 20) : '',
    step: t ? Number(step) > 0 ? Number(step) : 1 : null,
  };
}

// ── Zapis lokalny ──
function readLocal() {
  try {
    const v = JSON.parse(localStorage.getItem(MONTHLY_LOCAL_KEY) || 'null');
    return { tasks: Array.isArray(v?.tasks) ? v.tasks : [], logs: Array.isArray(v?.logs) ? v.logs : [] };
  } catch {
    return { tasks: [], logs: [] };
  }
}
function writeLocal(data) {
  try {
    localStorage.setItem(MONTHLY_LOCAL_KEY, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('wealth-app-prefs-changed', { detail: { key: MONTHLY_LOCAL_KEY } }));
  } catch {
    // brak localStorage
  }
}

export const monthlyLocalStore = {
  kind: 'local',
  async load() {
    return readLocal();
  },
  async addTask(task) {
    const d = readLocal();
    writeLocal({ ...d, tasks: [...d.tasks, task] });
  },
  async archiveTask(id, month) {
    const d = readLocal();
    writeLocal({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, archivedMonth: month } : t)) });
  },
  async deleteTask(id) {
    const d = readLocal();
    writeLocal({ tasks: d.tasks.filter((t) => t.id !== id), logs: d.logs.filter((l) => l.taskId !== id) });
  },
  async setDone(taskId, month, done) {
    const d = readLocal();
    const logs = d.logs.filter((l) => !(l.taskId === taskId && l.month === month));
    if (done) logs.push({ taskId, month, doneAt: new Date().toISOString() });
    writeLocal({ ...d, logs });
  },
  // Postęp liczbowy w miesiącu (0 – wpis usunięty)
  async setProgress(taskId, month, progress, done) {
    const d = readLocal();
    const logs = d.logs.filter((l) => !(l.taskId === taskId && l.month === month));
    if (progress > 0 || done) logs.push({ taskId, month, progress, done, doneAt: new Date().toISOString() });
    writeLocal({ ...d, logs });
  },
  async updateTask(id, patch) {
    const d = readLocal();
    writeLocal({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  },
  progressReady: true,
};

// ── Zapis w Supabase ──
const fromRow = (r) => ({
  id: r.id,
  title: r.title,
  isRecurring: r.is_recurring,
  month: r.month,
  archivedMonth: r.archived_month,
  sortOrder: r.sort_order ?? 0,
  createdAt: r.created_at,
  target: r.target != null ? Number(r.target) : null,
  unit: r.unit || '',
  step: r.step != null ? Number(r.step) : null,
});
// Brak kolumn postępu (skrypt sprzed tej wersji): 42703 (Postgres) / PGRST204 (PostgREST)
const isMissingColumn = (e) => !!e && (e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist|could not find the .* column/i.test(e.message || ''));
function check(error) {
  if (!error) return;
  if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message || '')) throw new MissingTablesError(error.message);
  throw new Error(error.message || 'Błąd zapisu w chmurze');
}

const BASE_TASK_COLS = 'id, title, is_recurring, month, archived_month, sort_order, created_at';
const BASE_LOG_COLS = 'task_id, month, done_at';

// progressReady – czy w bazie są kolumny postępu (ustalane przy wczytaniu; bez nich zadania działają jak dotąd)
export function monthlyCloudStore(userId) {
  const store = {
    kind: 'cloud',
    progressReady: true,
    async load() {
      const sb = await getClient();
      const query = (full) =>
        Promise.all([
          sb.from('monthly_tasks').select(full ? `${BASE_TASK_COLS}, target, unit, step` : BASE_TASK_COLS).eq('user_id', userId),
          sb.from('monthly_task_logs').select(full ? `${BASE_LOG_COLS}, progress, done` : BASE_LOG_COLS).eq('user_id', userId),
        ]);
      let [t, l] = await query(true);
      store.progressReady = !isMissingColumn(t.error) && !isMissingColumn(l.error);
      if (!store.progressReady) [t, l] = await query(false);
      check(t.error);
      check(l.error);
      return {
        tasks: (t.data || []).map(fromRow),
        logs: (l.data || []).map((r) => ({ taskId: r.task_id, month: r.month, doneAt: r.done_at, progress: r.progress != null ? Number(r.progress) : undefined, done: r.done })),
      };
    },
    async addTask(task) {
      const sb = await getClient();
      const row = { id: task.id, user_id: userId, title: task.title, is_recurring: task.isRecurring, month: task.month, sort_order: task.sortOrder };
      if (store.progressReady && task.target) Object.assign(row, { target: task.target, unit: task.unit || null, step: task.step });
      const { error } = await sb.from('monthly_tasks').insert(row);
      check(error);
    },
    async updateTask(id, patch) {
      const sb = await getClient();
      const row = { updated_at: new Date().toISOString() };
      if ('title' in patch) row.title = patch.title;
      if ('target' in patch) Object.assign(row, { target: patch.target, unit: patch.unit || null, step: patch.step });
      const { error } = await sb.from('monthly_tasks').update(row).eq('id', id).eq('user_id', userId);
      check(error);
    },
    async setProgress(taskId, month, progress, done) {
      const sb = await getClient();
      const { error } =
        progress > 0 || done
          ? await sb.from('monthly_task_logs').upsert({ task_id: taskId, month, user_id: userId, progress, done, done_at: new Date().toISOString() }, { onConflict: 'task_id,month' })
          : await sb.from('monthly_task_logs').delete().eq('task_id', taskId).eq('month', month).eq('user_id', userId);
      check(error);
    },
    async archiveTask(id, month) {
      const sb = await getClient();
      const { error } = await sb.from('monthly_tasks').update({ archived_month: month, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId);
      check(error);
    },
    async deleteTask(id) {
      const sb = await getClient();
      const { error } = await sb.from('monthly_tasks').delete().eq('id', id).eq('user_id', userId);
      check(error);
    },
    async setDone(taskId, month, done) {
      const sb = await getClient();
      const { error } = done
        ? await sb.from('monthly_task_logs').upsert({ task_id: taskId, month, user_id: userId, done_at: new Date().toISOString(), ...(store.progressReady ? { done: true } : {}) }, { onConflict: 'task_id,month' })
        : await sb.from('monthly_task_logs').delete().eq('task_id', taskId).eq('month', month).eq('user_id', userId);
      check(error);
    },
  };
  return store;
}
