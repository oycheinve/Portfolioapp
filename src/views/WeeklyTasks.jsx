import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, Check, ChevronLeft, ChevronRight, Gauge, ListChecks, Plus, Repeat, Target, Trash2 } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { MissingTablesError, archiveWeeks, cloudStore, localStore, logKey, makeTask, shiftWeek, tasksForWeek, weekId, weekLabel, weekNumber, weekProgress, weekStart } from '../lib/weeklyTasks.js';
import TaskAccordion from '../components/tasks/TaskAccordion.jsx';
import ScheduledCard, { PlanInput } from '../components/tasks/ScheduledCard.jsx';
import { dayId } from '../lib/dailyTasks.js';
import { Card, Segmented } from '../components/ui.jsx';
import DailyTasksPanel from '../components/tasks/DailyTasksPanel.jsx';
import MonthlyTasksPanel from '../components/tasks/MonthlyTasksPanel.jsx';
import { consistencyScore, loadAllTasks } from '../lib/taskStats.js';

const pct = (v) => `${Math.round(v * 100)}%`;

const TAB_KEY = 'wealth-app-tasks-tab';
const TABS = ['DAILY', 'WEEKLY', 'MONTHLY'];

// Zadania: wskaźnik konsekwencji na górze i przełącznik „Dzienne” / „Tygodniowe” / „Miesięczne” (wybór zapamiętany)
export default function TasksView() {
  const { cloud } = useApp();
  const userId = cloud?.enabled ? cloud.user?.id : null;
  const [tab, setTabState] = useState(() => {
    try {
      const v = localStorage.getItem(TAB_KEY);
      return TABS.includes(v) ? v : 'DAILY';
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
  // Dane wszystkich kategorii do wskaźnika; otwarty panel zgłasza swoje zmiany na bieżąco
  const [all, setAll] = useState(null);
  useEffect(() => {
    let alive = true;
    loadAllTasks(userId).then((d) => alive && setAll((prev) => ({ ...d, ...(prev || {}) })));
    return () => {
      alive = false;
    };
  }, [userId]);
  const report = useCallback((kind) => (data) => setAll((prev) => ({ ...(prev || {}), [kind]: data })), []);
  const onDaily = useMemo(() => report('daily'), [report]);
  const onWeekly = useMemo(() => report('weekly'), [report]);
  const onMonthly = useMemo(() => report('monthly'), [report]);

  return (
    <div className="space-y-3 sm:space-y-4">
      <ConsistencyCard data={all} />
      <div className="flex justify-center">
        <Segmented
          value={tab}
          onChange={setTab}
          ariaLabel="Rodzaj zadań"
          options={[
            { value: 'DAILY', label: 'Dzienne' },
            { value: 'WEEKLY', label: 'Tygodniowe' },
            { value: 'MONTHLY', label: 'Miesięczne' },
          ]}
        />
      </div>
      {tab === 'DAILY' && <DailyTasksPanel onDataChange={onDaily} />}
      {tab === 'WEEKLY' && <WeeklyTasksPanel onDataChange={onWeekly} />}
      {tab === 'MONTHLY' && <MonthlyTasksPanel onDataChange={onMonthly} />}
    </div>
  );
}

const scoreTone = (p) => (p === null ? 'text-stone-400' : p >= 0.8 ? 'text-emerald-600 dark:text-emerald-400' : p >= 0.5 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400');
const ringTone = (p) => (p === null ? '#a8a29e' : p >= 0.8 ? '#10b981' : p >= 0.5 ? '#f59e0b' : '#ef4444');
const fmtPct = (p) => (p === null ? '—' : pct(p));
// Akcenty okresów: dzień – błękit, tydzień – fiolet, miesiąc – bursztyn
const KINDS = [
  { key: 'daily', label: 'Dziś', dot: 'bg-sky-400', bar: 'from-sky-500 to-sky-300', text: 'text-sky-600 dark:text-sky-300' },
  { key: 'weekly', label: 'Ten tydzień', dot: 'bg-violet-400', bar: 'from-violet-500 to-violet-300', text: 'text-violet-600 dark:text-violet-300' },
  { key: 'monthly', label: 'Ten miesiąc', dot: 'bg-amber-400', bar: 'from-amber-500 to-amber-300', text: 'text-amber-600 dark:text-amber-300' },
];

// Pierścień postępu (SVG) z wynikiem w środku; kolor wg skuteczności (≥80% zielony, ≥50% bursztyn, niżej czerwony)
function ScoreRing({ value, loading }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" className="stroke-stone-100 dark:stroke-white/[0.07]" />
        {value !== null && <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" strokeLinecap="round" stroke={ringTone(value)} strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, value))} className="transition-[stroke-dashoffset] duration-700 ease-out" />}
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-2xl font-bold tracking-tight tabular ${scoreTone(value)}`}>{loading ? '…' : fmtPct(value)}</span>
    </div>
  );
}

// Wskaźnik konsekwencji: wykonane / wymagane do tej pory w bieżących okresach (dziś, ten tydzień, ten miesiąc)
// oraz skuteczność w okresach zakończonych w ostatnich 30 dniach
function ConsistencyCard({ data }) {
  const score = useMemo(() => (data ? consistencyScore(data) : null), [data]);
  const main = score?.current.pct ?? null;
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-white/10 dark:bg-gradient-to-br dark:from-neutral-900 dark:to-neutral-950" aria-label="Konsekwencja">
      <div className="flex items-center gap-4 p-4 sm:gap-6 sm:p-5">
        <ScoreRing value={main} loading={!score} />
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-stone-500 uppercase dark:text-stone-400">
            <Gauge size={13} /> Konsekwencja
          </h2>
          <p className="mt-0.5 text-sm font-medium text-stone-800 dark:text-stone-100">{score ? (score.current.total ? `Wykonane ${score.current.done} z ${score.current.total}` : 'Brak wymaganych zadań') : 'Liczenie…'}</p>
          <p className="text-[11px] text-stone-500 dark:text-stone-400">{score?.current.total ? 'wymaganych do tej pory w bieżącym okresie' : 'Dodaj zadania, aby zobaczyć skuteczność'}</p>
          {score && (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] text-stone-600 dark:bg-white/[0.06] dark:text-stone-300" title="Zakończone dni, tygodnie i miesiące z ostatnich 30 dni">
              Ostatnie 30 dni <span className={`font-semibold tabular ${scoreTone(score.rolling.pct)}`}>{fmtPct(score.rolling.pct)}</span>
              {score.rolling.total ? <span className="tabular text-stone-400 dark:text-stone-500">· {score.rolling.done}/{score.rolling.total}</span> : null}
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-stone-100 border-t border-stone-100 dark:divide-white/5 dark:border-white/5">
        {KINDS.map((k) => {
          const v = score?.current.byKind[k.key];
          return (
            <div key={k.key} className="min-w-0 px-3 py-2.5 sm:px-4">
              <div className="flex items-center gap-1.5 text-[11px] text-stone-500 dark:text-stone-400">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${k.dot}`} />
                <span className="truncate">{k.label}</span>
              </div>
              <div className="mt-0.5 flex items-baseline gap-1">
                <span className={`text-base font-semibold tabular ${v?.total ? k.text : 'text-stone-400 dark:text-stone-500'}`}>{v?.total ? fmtPct(v.pct) : '—'}</span>
                {v?.total ? <span className="text-[11px] tabular text-stone-400 dark:text-stone-500">{v.done}/{v.total}</span> : null}
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-white/[0.06]">
                <div className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${k.bar}`} style={{ width: `${(v?.pct || 0) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Zadania tygodniowe / nawyki: bieżący tydzień z postępem, zadania cykliczne (co tydzień) i jednorazowe,
// archiwum minionych tygodni. Po zalogowaniu – tabele Supabase, w trybie lokalnym – localStorage.
function WeeklyTasksPanel({ onDataChange }) {
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

  const doneSet = useMemo(() => new Set(data.logs.map((l) => logKey(l.taskId, l.weekId))), [data.logs]);
  const list = useMemo(() => tasksForWeek(data.tasks, week), [data.tasks, week]);
  const progress = weekProgress(data.tasks, doneSet, week);
  const archive = useMemo(() => archiveWeeks(data.tasks, doneSet, current), [data.tasks, doneSet, current]);
  const isCurrent = week === current;
  const isPast = week < current;
  const isFuture = week > current; // zaplanowany tydzień: dodawanie i usuwanie, odhaczanie dopiero w tym tygodniu
  const canEdit = !isPast;
  const scheduled = useMemo(
    () =>
      data.tasks
        .filter((t) => t.weekId > current && (!t.archivedWeek || t.archivedWeek > t.weekId))
        .sort((a, b) => a.weekId.localeCompare(b.weekId) || a.title.localeCompare(b.title, 'pl'))
        .map((t) => ({ id: t.id, title: t.title, isRecurring: t.isRecurring, period: t.weekId, label: `Tydz. ${weekNumber(t.weekId)} · ${weekLabel(t.weekId).split(' – ')[0]}` })),
    [data.tasks, current],
  );

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
    <div className="space-y-3 sm:space-y-4">
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
              Tydzień {weekNumber(week)} {isCurrent ? <span className="text-blue-600 dark:text-blue-400">· bieżący</span> : isPast ? <span className="text-stone-400">· archiwum</span> : <span className="text-violet-600 dark:text-violet-400">· zaplanowany</span>}
            </h2>
            <p className="text-xs text-stone-500 tabular dark:text-stone-400">{weekLabel(week)}</p>
          </div>
          <button type="button" className={navBtn} onClick={() => setWeek(shiftWeek(week, 1))} aria-label="Następny tydzień">
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
        {!isCurrent && (
          <div className="mt-2 flex justify-end text-[11px]">
            <button type="button" onClick={() => setWeek(current)} className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
              Wróć do bieżącego tygodnia
            </button>
          </div>
        )}
      </section>

      {canEdit && (
        <form onSubmit={add} className="flex flex-col gap-2 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center dark:border-white/10 dark:bg-neutral-900" aria-label="Nowe zadanie">
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
                { value: 'RECURRING', label: isCurrent ? 'Co tydzień' : 'Co tydzień od tego' },
                { value: 'ONCE', label: 'Jednorazowe' },
              ]}
            />
            <button type="submit" disabled={!title.trim()} className="inline-flex h-10 shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:text-neutral-950">
              <Plus size={16} /> {isCurrent ? 'Dodaj' : 'Zaplanuj'}
            </button>
          </div>
          <div className="w-full sm:basis-full">
            <PlanInput value={dayId(weekStart(week))} min={dayId(weekStart(current))} onChange={(v) => setWeek(weekId(new Date(`${v}T12:00:00`)))} label="Tydzień zadania (dowolny dzień tygodnia)" />
          </div>
        </form>
      )}

      {loading ? (
        <div className="h-32 animate-pulse rounded-2xl bg-stone-100 dark:bg-white/[0.04]" />
      ) : (
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
          {groups.map((g) => (
            <Card key={g.key} title={`${g.title} (${g.items.filter((t) => doneSet.has(logKey(t.id, week))).length}/${g.items.length})`} subtitle={g.hint} icon={g.icon} bodyClassName="p-2 sm:p-3">
              {g.items.length === 0 ? (
                <p className="px-2 py-4 text-center text-sm text-stone-500 dark:text-stone-400">{isCurrent ? (g.key === 'R' ? 'Dodaj zadanie „Co tydzień” – np. nawyk lub stały przegląd.' : 'Brak zadań jednorazowych w tym tygodniu.') : isFuture ? 'Brak zadań zaplanowanych na ten tydzień.' : 'Brak zadań.'}</p>
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
                          disabled={isFuture}
                          title={isFuture ? 'Odhaczysz w tym tygodniu' : undefined}
                          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 text-left disabled:cursor-default"
                        >
                          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-stone-300 dark:border-white/25'}`}>
                            {done && <Check size={15} strokeWidth={3} />}
                          </span>
                          <span className={`min-w-0 flex-1 text-sm break-words ${done ? 'text-stone-400 line-through dark:text-stone-500' : 'font-medium'}`}>{t.title}</span>
                          {t.isRecurring && <Repeat size={13} className="shrink-0 text-stone-300 dark:text-stone-600" aria-label="cykliczne" />}
                        </button>
                        {canEdit && (
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

      <ScheduledCard items={scheduled} onOpen={(p) => {
        setWeek(p);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }} unitLabel="tygodnie" />

      <TaskAccordion title="Archiwum tygodni" count={archive.length || null} hint="Wykonanie zadań w minionych tygodniach – kliknij, aby zobaczyć szczegóły">
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
      </TaskAccordion>
      <p className="flex items-center justify-center gap-1.5 text-[11px] text-stone-400">
        <ListChecks size={12} /> Zadania nie wpływają na wyliczenia portfela ani budżetu.
      </p>
    </div>
  );
}
