import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, CalendarRange, Check, ChevronLeft, ChevronRight, Cloud, Flame, HardDrive, History, Plus, Repeat, Trash2 } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { MissingTablesError } from '../../lib/weeklyTasks.js';
import { daysLeftInMonth, historyMonths, makeMonthlyTask, monthId, monthKey, monthLabel, monthProgress, monthlyCloudStore, monthlyLocalStore, shiftMonthId, tasksForMonth } from '../../lib/monthlyTasks.js';
import { Card, Segmented } from '../ui.jsx';

const pct = (v) => `${Math.round(v * 100)}%`;
const plDays = (n) => (n === 1 ? 'dzień' : 'dni');
const plMonths = (n) => (n === 1 ? 'miesiąc' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'miesiące' : 'miesięcy');

// Seria zadania co miesiąc: kolejne wykonane miesiące do wskazanego (bieżący nieodhaczony nie przerywa serii)
function monthStreak(task, doneSet, month) {
  let m = doneSet.has(monthKey(task.id, month)) ? month : shiftMonthId(month, -1);
  let n = 0;
  while (m >= task.month && doneSet.has(monthKey(task.id, m))) {
    n += 1;
    m = shiftMonthId(m, -1);
  }
  return n;
}

// Zadania miesięczne: większe obowiązki co miesiąc (audyt portfela, przegląd subskrypcji…) i zadania na dany miesiąc,
// postęp miesiąca, seria, historia minionych miesięcy. Po zalogowaniu – tabele Supabase monthly_*, inaczej localStorage.
// onDataChange(data) – zgłoszenie zmian (wskaźnik konsekwencji w widoku Zadań).
export default function MonthlyTasksPanel({ onDataChange }) {
  const { cloud, actions } = useApp();
  const userId = cloud?.enabled ? cloud.user?.id : null;
  const current = monthId();
  const [month, setMonth] = useState(current);
  const [missingTables, setMissingTables] = useState(false);
  const store = useMemo(() => (userId && !missingTables ? monthlyCloudStore(userId) : monthlyLocalStore), [userId, missingTables]);
  const [data, setData] = useState({ tasks: [], logs: [] });
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('HABIT');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await store.load());
    } catch (e) {
      if (e instanceof MissingTablesError) setMissingTables(true);
      else actions.notify(`Zadania miesięczne: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [store, actions]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!loading) onDataChange?.(data);
  }, [data, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zmiana optymistyczna: od razu na ekranie, zapis w tle; przy błędzie – ponowne wczytanie i komunikat
  const run = async (apply, persist) => {
    setData(apply);
    try {
      await persist();
    } catch (e) {
      if (e instanceof MissingTablesError) setMissingTables(true);
      else actions.notify(`Nie udało się zapisać zadania: ${e.message}`, 'error');
      load();
    }
  };

  const doneSet = useMemo(() => new Set(data.logs.map((l) => monthKey(l.taskId, l.month))), [data.logs]);
  const list = useMemo(() => tasksForMonth(data.tasks, month), [data.tasks, month]);
  const progress = monthProgress(data.tasks, doneSet, month);
  const history = useMemo(() => historyMonths(data.tasks, doneSet, current), [data.tasks, doneSet, current]);
  const isCurrent = month === current;

  const toggle = (task) => {
    const done = !doneSet.has(monthKey(task.id, month));
    run(
      (d) => ({ ...d, logs: done ? [...d.logs, { taskId: task.id, month, doneAt: new Date().toISOString() }] : d.logs.filter((l) => !(l.taskId === task.id && l.month === month)) }),
      () => store.setDone(task.id, month, done),
    );
  };
  const add = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    const task = makeMonthlyTask({ title, isRecurring: kind === 'HABIT', month });
    setTitle('');
    run((d) => ({ ...d, tasks: [...d.tasks, task] }), () => store.addTask(task));
  };
  // Zadanie co miesiąc z historią – zakończone od tego miesiąca (zostaje w historii); nowe lub jednorazowe – usunięte
  const remove = (task) => {
    if (task.isRecurring && task.month < month) {
      run((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === task.id ? { ...t, archivedMonth: month } : t)) }), () => store.archiveTask(task.id, month));
    } else {
      if (!window.confirm(`Usunąć zadanie „${task.title}”?`)) return;
      run((d) => ({ tasks: d.tasks.filter((t) => t.id !== task.id), logs: d.logs.filter((l) => l.taskId !== task.id) }), () => store.deleteTask(task.id));
    }
  };

  const groups = [
    { key: 'H', title: 'Co miesiąc', hint: 'wracają w każdym miesiącu', icon: Repeat, items: list.filter((t) => t.isRecurring) },
    { key: 'D', title: isCurrent ? 'Na ten miesiąc' : 'Zadania tego miesiąca', hint: 'tylko w tym miesiącu', icon: CalendarRange, items: list.filter((t) => !t.isRecurring) },
  ];
  const navBtn = 'inline-flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 disabled:opacity-40 dark:text-stone-400 dark:hover:bg-white/5';

  return (
    <div className="space-y-4 sm:space-y-6">
      {missingTables && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          W bazie Supabase brakuje tabel zadań miesięcznych – uruchom raz skrypt <code className="font-mono text-xs">supabase/monthly_tasks.sql</code> (SQL Editor → Run). Do tego czasu zadania miesięczne zapisują się tylko w tej przeglądarce.
        </p>
      )}

      <section className="min-w-0 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5 dark:border-white/10 dark:bg-neutral-900" aria-label="Miesiąc">
        <div className="flex items-center gap-2">
          <button type="button" className={navBtn} onClick={() => setMonth(shiftMonthId(month, -1))} aria-label="Poprzedni miesiąc">
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <h2 className="text-base font-semibold first-letter:uppercase">
              {monthLabel(month)} {isCurrent ? <span className="text-blue-600 dark:text-blue-400">· bieżący miesiąc</span> : <span className="text-stone-400">· historia</span>}
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">{isCurrent ? `Do końca miesiąca: ${daysLeftInMonth(month)} ${plDays(daysLeftInMonth(month))}` : 'Miesiąc zakończony'}</p>
          </div>
          <button type="button" className={navBtn} onClick={() => setMonth(shiftMonthId(month, 1))} disabled={isCurrent} aria-label="Następny miesiąc">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-stone-100 dark:bg-white/[0.06]" role="progressbar" aria-label="Postęp miesiąca" aria-valuenow={Math.round(progress.pct * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full rounded-full transition-all ${progress.pct >= 1 ? 'bg-emerald-500' : 'bg-blue-600 dark:bg-blue-500'}`} style={{ width: `${progress.pct * 100}%` }} />
          </div>
          <span className="shrink-0 text-sm font-semibold tabular">
            {progress.done} / {progress.total} · {pct(progress.pct)}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-500 dark:text-stone-400">
          <span className="inline-flex items-center gap-1">
            {store.kind === 'cloud' ? <Cloud size={12} /> : <HardDrive size={12} />}
            {store.kind === 'cloud' ? 'Zapis w chmurze (Supabase)' : 'Zapis w tej przeglądarce'}
          </span>
          {!isCurrent && (
            <button type="button" onClick={() => setMonth(current)} className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
              Wróć do bieżącego miesiąca
            </button>
          )}
        </div>
      </section>

      {isCurrent && (
        <form onSubmit={add} className="flex flex-col gap-2 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center dark:border-white/10 dark:bg-neutral-900" aria-label="Nowe zadanie miesięczne">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Nowe zadanie, np. Głęboki audyt portfela, Przegląd subskrypcji"
            aria-label="Nazwa zadania miesięcznego"
            className="h-10 w-full min-w-0 shrink-0 rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 sm:w-auto sm:flex-1 dark:border-white/10 dark:bg-neutral-800"
          />
          <div className="flex items-center justify-between gap-2">
            <Segmented
              size="sm"
              value={kind}
              onChange={setKind}
              ariaLabel="Rodzaj zadania miesięcznego"
              options={[
                { value: 'HABIT', label: 'Co miesiąc' },
                { value: 'TODAY', label: 'Tylko w tym miesiącu' },
              ]}
            />
            <button type="submit" disabled={!title.trim()} className="inline-flex h-10 shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:text-neutral-950">
              <Plus size={16} /> Dodaj
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="h-32 animate-pulse rounded-2xl bg-stone-100 dark:bg-white/[0.04]" />
      ) : (
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
          {groups.map((g) => (
            <Card key={g.key} title={`${g.title} (${g.items.filter((t) => doneSet.has(monthKey(t.id, month))).length}/${g.items.length})`} subtitle={g.hint} icon={g.icon} bodyClassName="p-2 sm:p-3">
              {g.items.length === 0 ? (
                <p className="px-2 py-4 text-center text-sm text-stone-500 dark:text-stone-400">{isCurrent ? (g.key === 'H' ? 'Dodaj zadanie „Co miesiąc” – np. głęboki audyt portfela.' : 'Brak zadań tylko na ten miesiąc.') : 'Brak zadań.'}</p>
              ) : (
                <ul className="space-y-1">
                  {g.items.map((t) => {
                    const done = doneSet.has(monthKey(t.id, month));
                    const streak = t.isRecurring ? monthStreak(t, doneSet, month) : 0;
                    return (
                      <li key={t.id} className="group flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-stone-50 dark:hover:bg-white/[0.03]">
                        <button type="button" role="checkbox" aria-checked={done} onClick={() => toggle(t)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 text-left">
                          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-stone-300 dark:border-white/25'}`}>
                            {done && <Check size={15} strokeWidth={3} />}
                          </span>
                          <span className={`min-w-0 flex-1 text-sm break-words ${done ? 'text-stone-400 line-through dark:text-stone-500' : 'font-medium'}`}>{t.title}</span>
                          {streak > 1 && (
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-orange-50 px-1.5 py-0.5 text-[11px] font-semibold text-orange-600 dark:bg-orange-500/10 dark:text-orange-400" title={`${streak} ${plMonths(streak)} z rzędu`}>
                              <Flame size={12} /> {streak}
                            </span>
                          )}
                        </button>
                        {isCurrent && (
                          <button
                            type="button"
                            onClick={() => remove(t)}
                            aria-label={`Usuń zadanie ${t.title}`}
                            title={t.isRecurring && t.month < month ? 'Zakończ zadanie (zostanie w historii)' : 'Usuń zadanie'}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-stone-300 hover:bg-red-50 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100 dark:text-stone-600 dark:hover:bg-red-500/10"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      <Card title="Historia miesięcy" subtitle="Wykonanie zadań w minionych miesiącach – kliknij, aby zobaczyć szczegóły" icon={History} bodyClassName="p-2 sm:p-3">
        {history.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-stone-500 dark:text-stone-400">Historia pojawi się po zakończeniu pierwszego miesiąca z zadaniami.</p>
        ) : (
          <ul className="space-y-1">
            {history.map((h) => (
              <li key={h.month}>
                <button
                  type="button"
                  onClick={() => {
                    setMonth(h.month);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-stone-50 dark:hover:bg-white/[0.03] ${h.month === month ? 'bg-blue-50/70 dark:bg-blue-500/10' : ''}`}
                >
                  <CalendarCheck2 size={16} className={`shrink-0 ${h.pct >= 1 ? 'text-emerald-500' : 'text-stone-400'}`} />
                  <span className="w-28 shrink-0 text-sm font-semibold first-letter:uppercase sm:w-36">{monthLabel(h.month)}</span>
                  <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100 dark:bg-white/[0.06]">
                    <span className={`block h-full rounded-full ${h.pct >= 1 ? 'bg-emerald-500' : 'bg-blue-600 dark:bg-blue-500'}`} style={{ width: `${h.pct * 100}%` }} />
                  </span>
                  <span className="w-20 shrink-0 text-right text-xs font-semibold tabular">
                    {h.done}/{h.total} · {pct(h.pct)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
