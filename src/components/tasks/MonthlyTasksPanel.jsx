import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, CalendarRange, Check, ChevronLeft, ChevronRight, Cloud, Flame, HardDrive, History, Minus, Pencil, Plus, Repeat, Target, Trash2 } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { MissingTablesError } from '../../lib/weeklyTasks.js';
import { daysLeftInMonth, hasTarget, historyMonths, makeMonthlyTask, monthDoneSet, monthId, monthKey, monthLabel, monthProgress, monthProgressMap, monthlyCloudStore, monthlyLocalStore, shiftMonthId, tasksForMonth } from '../../lib/monthlyTasks.js';
import { Card, Segmented } from '../ui.jsx';

const pct = (v) => `${Math.round(v * 100)}%`;
const plDays = (n) => (n === 1 ? 'dzień' : 'dni');
const fmtNum = (v) => (Math.round(v * 100) / 100).toLocaleString('pl-PL');
const round2 = (v) => Math.round(v * 100) / 100;
const inputCls = 'h-9 min-w-0 rounded-lg border border-stone-200 bg-white px-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 dark:border-white/10 dark:bg-neutral-800';
const stepBtn = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-200 hover:bg-stone-100 disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5';
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
  // Postęp liczbowy jak w Celach: cel na miesiąc, jednostka, krok przycisków +/−
  const [withTarget, setWithTarget] = useState(false);
  const [goal, setGoal] = useState({ target: '', unit: '', step: '1' });
  const [editing, setEditing] = useState(null); // { id, target, unit, step }

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

  const doneSet = useMemo(() => monthDoneSet(data.logs), [data.logs]);
  const progressMap = useMemo(() => monthProgressMap(data.logs), [data.logs]);
  const progressReady = store.progressReady !== false;
  const list = useMemo(() => tasksForMonth(data.tasks, month), [data.tasks, month]);
  const progress = monthProgress(data.tasks, doneSet, month);
  const history = useMemo(() => historyMonths(data.tasks, doneSet, current), [data.tasks, doneSet, current]);
  const isCurrent = month === current;

  // Postęp w miesiącu: zapis wartości i stanu wykonania (wykonane = cel osiągnięty)
  const setProgressValue = (task, value) => {
    const v = Math.max(0, round2(Number(value) || 0));
    const done = v >= Number(task.target);
    run(
      (d) => ({ ...d, logs: [...d.logs.filter((l) => !(l.taskId === task.id && l.month === month)), ...(v > 0 || done ? [{ taskId: task.id, month, progress: v, done, doneAt: new Date().toISOString() }] : [])] }),
      () => store.setProgress(task.id, month, v, done),
    );
  };
  const bump = (task, dir) => setProgressValue(task, (progressMap.get(monthKey(task.id, month)) || 0) + dir * (Number(task.step) || 1));

  const toggle = (task) => {
    // Zadanie z celem liczbowym: odhaczenie = cel osiągnięty, odznaczenie = jeden krok przed celem
    if (hasTarget(task) && store.setProgress) {
      const isDone = doneSet.has(monthKey(task.id, month));
      setProgressValue(task, isDone ? Math.max(0, Number(task.target) - (Number(task.step) || 1)) : Number(task.target));
      return;
    }
    const done = !doneSet.has(monthKey(task.id, month));
    run(
      (d) => ({ ...d, logs: done ? [...d.logs, { taskId: task.id, month, doneAt: new Date().toISOString() }] : d.logs.filter((l) => !(l.taskId === task.id && l.month === month)) }),
      () => store.setDone(task.id, month, done),
    );
  };
  const add = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    const target = withTarget && progressReady ? Number(String(goal.target).replace(',', '.')) : null;
    const task = makeMonthlyTask({ title, isRecurring: kind === 'HABIT', month, target, unit: goal.unit, step: Number(String(goal.step).replace(',', '.')) || 1 });
    setTitle('');
    setGoal({ target: '', unit: '', step: '1' });
    setWithTarget(false);
    run((d) => ({ ...d, tasks: [...d.tasks, task] }), () => store.addTask(task));
  };
  // Ustawienie / zmiana celu liczbowego istniejącego zadania (puste pole celu – zadanie bez postępu)
  const saveTarget = () => {
    const t = Number(String(editing.target).replace(',', '.'));
    const patch = t > 0 ? { target: t, unit: String(editing.unit || '').trim().slice(0, 20), step: Number(String(editing.step).replace(',', '.')) || 1 } : { target: null, unit: '', step: null };
    const id = editing.id;
    setEditing(null);
    // Wykonanie w bieżącym miesiącu przeliczone dla nowego celu (np. 10 z 12 – już niewykonane)
    const value = progressMap.get(monthKey(id, month));
    const relog = patch.target && value !== undefined;
    const done = relog && value >= patch.target;
    run(
      (d) => ({
        tasks: d.tasks.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        logs: relog ? d.logs.map((l) => (l.taskId === id && l.month === month ? { ...l, done } : l)) : d.logs,
      }),
      async () => {
        await store.updateTask(id, patch);
        if (relog) await store.setProgress(id, month, value, done);
      },
    );
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
        <form onSubmit={add} className="flex flex-col gap-2 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center dark:border-white/10 dark:bg-neutral-900" aria-label="Nowe zadanie miesięczne">
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
            <button
              type="submit"
              disabled={!title.trim() || (withTarget && !(Number(String(goal.target).replace(',', '.')) > 0))}
              className="inline-flex h-10 shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:text-neutral-950"
            >
              <Plus size={16} /> Dodaj
            </button>
          </div>
          <div className="w-full sm:basis-full">
            <button
              type="button"
              onClick={() => setWithTarget((v) => !v)}
              disabled={!progressReady}
              aria-pressed={withTarget}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold disabled:opacity-50 ${withTarget ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-500/10 dark:text-blue-300' : 'border-dashed border-stone-300 text-stone-600 hover:bg-stone-50 dark:border-white/20 dark:text-stone-300 dark:hover:bg-white/5'}`}
            >
              <Target size={14} /> {withTarget ? 'Postęp liczbowy: włączony' : '+ Postęp liczbowy (jak w Celach)'}
            </button>
            {!progressReady && <span className="ml-2 text-[11px] text-amber-700 dark:text-amber-400">uruchom ponownie supabase/monthly_tasks.sql, aby włączyć postęp</span>}
            {withTarget && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <label className="text-[11px] text-stone-500 dark:text-stone-400">
                  Cel w miesiącu
                  <input value={goal.target} onChange={(e) => setGoal({ ...goal, target: e.target.value.replace(/[^\d,.]/g, '') })} inputMode="decimal" placeholder="np. 4" aria-label="Cel w miesiącu" className={`${inputCls} mt-0.5 w-full`} />
                </label>
                <label className="text-[11px] text-stone-500 dark:text-stone-400">
                  Jednostka
                  <input value={goal.unit} onChange={(e) => setGoal({ ...goal, unit: e.target.value })} maxLength={20} placeholder="np. książek" aria-label="Jednostka" className={`${inputCls} mt-0.5 w-full`} />
                </label>
                <label className="text-[11px] text-stone-500 dark:text-stone-400">
                  Krok +/−
                  <input value={goal.step} onChange={(e) => setGoal({ ...goal, step: e.target.value.replace(/[^\d,.]/g, '') })} inputMode="decimal" aria-label="Krok" className={`${inputCls} mt-0.5 w-full`} />
                </label>
              </div>
            )}
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
                    const target = hasTarget(t) ? Number(t.target) : null;
                    const value = progressMap.get(monthKey(t.id, month)) || (target && done ? target : 0);
                    const share = target ? Math.min(1, value / target) : 0;
                    return (
                      <li key={t.id} className="group rounded-xl px-2 py-1.5 hover:bg-stone-50 dark:hover:bg-white/[0.03]">
                       <div className="flex items-center gap-2">
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
                        {isCurrent && progressReady && (
                          <button
                            type="button"
                            onClick={() => setEditing(editing?.id === t.id ? null : { id: t.id, target: target ?? '', unit: t.unit || '', step: t.step ?? 1 })}
                            aria-label={`Cel liczbowy: ${t.title}`}
                            title={target ? 'Zmień cel liczbowy' : 'Dodaj postęp liczbowy'}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-stone-300 hover:bg-stone-100 hover:text-stone-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100 dark:text-stone-600 dark:hover:bg-white/5 dark:hover:text-stone-300"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
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
                       </div>
                        {target && (
                          <div className="mt-1 pl-9">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="text-stone-500 tabular dark:text-stone-400">
                                {fmtNum(value)} z {fmtNum(target)}
                                {t.unit ? ` ${t.unit}` : ''}
                              </span>
                              <span className={`font-bold tabular ${done ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{pct(share)}</span>
                            </div>
                            <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-white/[0.06]">
                              <div className={`h-full rounded-full transition-all ${done ? 'bg-emerald-500' : 'bg-blue-600 dark:bg-blue-500'}`} style={{ width: `${share * 100}%` }} />
                            </div>
                            <div className="mt-1.5 flex items-center gap-1">
                              <button type="button" className={stepBtn} onClick={() => bump(t, -1)} disabled={value <= 0} aria-label={`Zmniejsz: ${t.title}`}>
                                <Minus size={14} />
                              </button>
                              <input
                                type="number"
                                min="0"
                                step={t.step || 1}
                                value={value}
                                onChange={(e) => setProgressValue(t, e.target.value)}
                                aria-label={`Postęp: ${t.title}`}
                                className="h-8 w-20 rounded-lg border border-stone-200 bg-white px-2 text-center text-sm tabular outline-none focus:border-blue-500 dark:border-white/10 dark:bg-neutral-800"
                              />
                              <button type="button" className={stepBtn} onClick={() => bump(t, 1)} aria-label={`Zwiększ: ${t.title}`}>
                                <Plus size={14} />
                              </button>
                              <span className="ml-1 text-[11px] text-stone-400">krok {fmtNum(Number(t.step) || 1)}</span>
                            </div>
                          </div>
                        )}
                        {editing?.id === t.id && (
                          <div className="mt-2 grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2 pl-9">
                            <label className="text-[11px] text-stone-500 dark:text-stone-400">
                              Cel
                              <input value={editing.target} onChange={(e) => setEditing({ ...editing, target: e.target.value.replace(/[^\d,.]/g, '') })} inputMode="decimal" placeholder="brak" aria-label="Nowy cel" className={`${inputCls} mt-0.5 w-full`} />
                            </label>
                            <label className="text-[11px] text-stone-500 dark:text-stone-400">
                              Jednostka
                              <input value={editing.unit} onChange={(e) => setEditing({ ...editing, unit: e.target.value })} maxLength={20} aria-label="Nowa jednostka" className={`${inputCls} mt-0.5 w-full`} />
                            </label>
                            <label className="text-[11px] text-stone-500 dark:text-stone-400">
                              Krok
                              <input value={editing.step} onChange={(e) => setEditing({ ...editing, step: e.target.value.replace(/[^\d,.]/g, '') })} inputMode="decimal" aria-label="Nowy krok" className={`${inputCls} mt-0.5 w-full`} />
                            </label>
                            <button type="button" onClick={saveTarget} className="h-9 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:text-neutral-950">
                              Zapisz
                            </button>
                          </div>
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
