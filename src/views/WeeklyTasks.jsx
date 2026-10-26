import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, CalendarCheck2, Check, ChevronLeft, ChevronRight, Cloud, HardDrive, ListChecks, Plus, Repeat, Target, Trash2 } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { MissingTablesError, archiveWeeks, cloudStore, localStore, logKey, makeTask, shiftWeek, tasksForWeek, weekId, weekLabel, weekNumber, weekProgress } from '../lib/weeklyTasks.js';
import { Card, Segmented } from '../components/ui.jsx';
import DailyTasksPanel from '../components/tasks/DailyTasksPanel.jsx';

const pct = (v) => `${Math.round(v * 100)}%`;

const TAB_KEY = 'wealth-app-tasks-tab';

// Zadania: przełącznik „Dzienne” (nawyki codzienne i zadania na dzień) / „Tygodniowe”; wybór zapamiętany
export default function TasksView() {
  const [tab, setTabState] = useState(() => {
    try {
      return localStorage.getItem(TAB_KEY) === 'WEEKLY' ? 'WEEKLY' : 'DAILY';
    } catch {
      return 'DAILY';
    }
  });
  const setTab = (v) => {
    setTabState(v);
    try {
      localStorage.setItem(TAB_KEY, v);
    } catch {
      // brak localStorage – wybór tylko do końca sesji
    }
  };
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex justify-center">
        <Segmented
          value={tab}
          onChange={setTab}
          ariaLabel="Rodzaj zadań"
          options={[
            { value: 'DAILY', label: 'Zadania dzienne' },
            { value: 'WEEKLY', label: 'Zadania tygodniowe' },
          ]}
        />
      </div>
      {tab === 'DAILY' ? <DailyTasksPanel /> : <WeeklyTasksPanel />}
    </div>
  );
}

// Zadania tygodniowe / nawyki: bieżący tydzień z postępem, zadania cykliczne (co tydzień) i jednorazowe,
// archiwum minionych tygodni. Po zalogowaniu – tabele Supabase, w trybie lokalnym – localStorage.
function WeeklyTasksPanel() {
  const { cloud, actions } = useApp();
  const userId = cloud?.enabled ? cloud.user?.id : null;
  const current = weekId();
  const [week, setWeek] = useState(current);
  const [missingTables, setMissingTables] = useState(false);
  const store = useMemo(() => (userId && !missingTables ? cloudStore(userId) : localStore), [userId, missingTables]);
  const [data, setData] = useState({ tasks: [], logs: [] });
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [recurring, setRecurring] = useState('RECURRING');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await store.load());
    } catch (e) {
      if (e instanceof MissingTablesError) setMissingTables(true);
      else actions.notify(`Zadania: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [store, actions]);
  useEffect(() => {
    load();
  }, [load]);

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

  const doneSet = useMemo(() => new Set(data.logs.map((l) => logKey(l.taskId, l.weekId))), [data.logs]);
  const list = useMemo(() => tasksForWeek(data.tasks, week), [data.tasks, week]);
  const progress = weekProgress(data.tasks, doneSet, week);
  const archive = useMemo(() => archiveWeeks(data.tasks, doneSet, current), [data.tasks, doneSet, current]);
  const isCurrent = week === current;
  const isPast = week < current;

  const toggle = (task) => {
    const done = !doneSet.has(logKey(task.id, week));
    run(
      (d) => ({ ...d, logs: done ? [...d.logs, { taskId: task.id, weekId: week, doneAt: new Date().toISOString() }] : d.logs.filter((l) => !(l.taskId === task.id && l.weekId === week)) }),
      () => store.setDone(task.id, week, done),
    );
  };
  const add = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    const task = makeTask({ title, isRecurring: recurring === 'RECURRING', week });
    setTitle('');
    run((d) => ({ ...d, tasks: [...d.tasks, task] }), () => store.addTask(task));
  };
  // Usunięcie: zadanie cykliczne z historią w minionych tygodniach jest archiwizowane (znika od tego tygodnia,
  // zostaje w archiwum); zadanie nowe lub jednorazowe – usuwane razem z wpisami wykonania
  const remove = (task) => {
    if (task.isRecurring && task.weekId < week) {
      run((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === task.id ? { ...t, archivedWeek: week } : t)) }), () => store.archiveTask(task.id, week));
    } else {
      if (!window.confirm(`Usunąć zadanie „${task.title}”?`)) return;
      run((d) => ({ tasks: d.tasks.filter((t) => t.id !== task.id), logs: d.logs.filter((l) => l.taskId !== task.id) }), () => store.deleteTask(task.id));
    }
  };

  const groups = [
    { key: 'R', title: 'Cykliczne', hint: 'wracają co tydzień', icon: Repeat, items: list.filter((t) => t.isRecurring) },
    { key: 'O', title: 'Jednorazowe', hint: 'tylko w tym tygodniu', icon: Target, items: list.filter((t) => !t.isRecurring) },
  ];
  const navBtn = 'inline-flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 disabled:opacity-40 dark:text-stone-400 dark:hover:bg-white/5';

  return (
    <div className="space-y-4 sm:space-y-6">
      {missingTables && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          W bazie Supabase brakuje tabel zadań – uruchom raz skrypt <code className="font-mono text-xs">supabase/weekly_tasks.sql</code> (SQL Editor → Run). Do tego czasu zadania zapisują się tylko w tej przeglądarce.
        </p>
      )}

      <section className="min-w-0 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5 dark:border-white/10 dark:bg-neutral-900">
        <div className="flex items-center gap-2">
          <button type="button" className={navBtn} onClick={() => setWeek(shiftWeek(week, -1))} aria-label="Poprzedni tydzień">
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <h2 className="text-base font-semibold">
              Tydzień {weekNumber(week)} {isCurrent ? <span className="text-blue-600 dark:text-blue-400">· bieżący</span> : isPast ? <span className="text-stone-400">· archiwum</span> : null}
            </h2>
            <p className="text-xs text-stone-500 tabular dark:text-stone-400">{weekLabel(week)}</p>
          </div>
          <button type="button" className={navBtn} onClick={() => setWeek(shiftWeek(week, 1))} disabled={!isPast} aria-label="Następny tydzień">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-stone-100 dark:bg-white/[0.06]" role="progressbar" aria-label="Postęp tygodnia" aria-valuenow={Math.round(progress.pct * 100)} aria-valuemin={0} aria-valuemax={100}>
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
            <button type="button" onClick={() => setWeek(current)} className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
              Wróć do bieżącego tygodnia
            </button>
          )}
        </div>
      </section>

      {isCurrent && (
        <form onSubmit={add} className="flex flex-col gap-2 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center dark:border-white/10 dark:bg-neutral-900" aria-label="Nowe zadanie">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Nowe zadanie, np. Przegląd budżetu, Dopłata do IKE"
            aria-label="Nazwa zadania"
            className="h-10 w-full min-w-0 shrink-0 rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none sm:w-auto sm:flex-1 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 dark:border-white/10 dark:bg-neutral-800"
          />
          <div className="flex items-center justify-between gap-2">
            <Segmented
              size="sm"
              value={recurring}
              onChange={setRecurring}
              ariaLabel="Rodzaj zadania"
              options={[
                { value: 'RECURRING', label: 'Co tydzień' },
                { value: 'ONCE', label: 'Jednorazowe' },
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
            <Card key={g.key} title={`${g.title} (${g.items.filter((t) => doneSet.has(logKey(t.id, week))).length}/${g.items.length})`} subtitle={g.hint} icon={g.icon} bodyClassName="p-2 sm:p-3">
              {g.items.length === 0 ? (
                <p className="px-2 py-4 text-center text-sm text-stone-500 dark:text-stone-400">{isCurrent ? (g.key === 'R' ? 'Dodaj zadanie „Co tydzień” – np. nawyk lub stały przegląd.' : 'Brak zadań jednorazowych w tym tygodniu.') : 'Brak zadań.'}</p>
              ) : (
                <ul className="space-y-1">
                  {g.items.map((t) => {
                    const done = doneSet.has(logKey(t.id, week));
                    return (
                      <li key={t.id} className="group flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-stone-50 dark:hover:bg-white/[0.03]">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={done}
                          onClick={() => toggle(t)}
                          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 text-left"
                        >
                          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-stone-300 dark:border-white/25'}`}>
                            {done && <Check size={15} strokeWidth={3} />}
                          </span>
                          <span className={`min-w-0 flex-1 text-sm break-words ${done ? 'text-stone-400 line-through dark:text-stone-500' : 'font-medium'}`}>{t.title}</span>
                          {t.isRecurring && <Repeat size={13} className="shrink-0 text-stone-300 dark:text-stone-600" aria-label="cykliczne" />}
                        </button>
                        {isCurrent && (
                          <button
                            type="button"
                            onClick={() => remove(t)}
                            aria-label={`Usuń zadanie ${t.title}`}
                            title={t.isRecurring && t.weekId < week ? 'Zakończ zadanie (zostanie w archiwum)' : 'Usuń zadanie'}
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

      <Card title="Archiwum tygodni" subtitle="Wykonanie zadań w minionych tygodniach – kliknij, aby zobaczyć szczegóły" icon={Archive} bodyClassName="p-2 sm:p-3">
        {archive.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-stone-500 dark:text-stone-400">Archiwum pojawi się po zakończeniu pierwszego tygodnia z zadaniami.</p>
        ) : (
          <ul className="space-y-1">
            {archive.map((a) => (
              <li key={a.week}>
                <button
                  type="button"
                  onClick={() => {
                    setWeek(a.week);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-stone-50 dark:hover:bg-white/[0.03] ${a.week === week ? 'bg-blue-50/70 dark:bg-blue-500/10' : ''}`}
                >
                  <CalendarCheck2 size={16} className={`shrink-0 ${a.pct >= 1 ? 'text-emerald-500' : 'text-stone-400'}`} />
                  <span className="w-28 shrink-0 text-sm sm:w-40">
                    <span className="font-semibold">Tydz. {weekNumber(a.week)}</span>
                    <span className="block text-[11px] text-stone-500 tabular dark:text-stone-400">{weekLabel(a.week)}</span>
                  </span>
                  <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100 dark:bg-white/[0.06]">
                    <span className={`block h-full rounded-full ${a.pct >= 1 ? 'bg-emerald-500' : 'bg-blue-600 dark:bg-blue-500'}`} style={{ width: `${a.pct * 100}%` }} />
                  </span>
                  <span className="w-20 shrink-0 text-right text-xs font-semibold tabular">
                    {a.done}/{a.total} · {pct(a.pct)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="flex items-center justify-center gap-1.5 text-[11px] text-stone-400">
        <ListChecks size={12} /> Zadania nie wpływają na wyliczenia portfela ani budżetu.
      </p>
    </div>
  );
}
