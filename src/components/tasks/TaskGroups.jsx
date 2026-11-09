import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Sparkles } from 'lucide-react';
import { TASK_CATEGORIES, TASK_GROUP_KEY, groupTasks, normTask, readTaskCats, rememberTask, resolveTaskLocal, taskCategoryOf, writeTaskCats } from '../../lib/taskCategories.js';
import { requestTaskCategories } from '../../lib/newsAi.js';
import { BetaBadge } from '../ui.jsx';

const readGrouped = () => {
  try {
    return localStorage.getItem(TASK_GROUP_KEY) !== '0'; // domyślnie włączone
  } catch {
    return true;
  }
};

// Stan kategorii zadań dla panelu: pamięć, włączenie grupowania (preferencja per użytkownik), tryb zmiany kategorii
// i AI w tle dla zadań nieznanych lokalnie (po krótkiej przerwie, paczką; nieudana próba – ponownie przy kolejnym otwarciu)
export function useTaskCategories(titles) {
  const [mem, setMem] = useState(readTaskCats);
  const [grouped, setGroupedState] = useState(readGrouped);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | working | error
  const attempted = useRef(new Set());
  const setGrouped = (v) => {
    setGroupedState(v);
    if (!v) setEditing(false);
    try {
      localStorage.setItem(TASK_GROUP_KEY, v ? '1' : '0');
      window.dispatchEvent(new CustomEvent('wealth-app-prefs-changed', { detail: { key: TASK_GROUP_KEY } }));
    } catch {
      // brak localStorage
    }
  };
  const key = titles.join('\n');
  const pending = useMemo(() => {
    const seen = new Set();
    return titles.filter((t) => {
      const k = normTask(t);
      if (!k || resolveTaskLocal(t, mem) || attempted.current.has(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [key, mem]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!grouped || !pending.length) return undefined;
    const t = setTimeout(async () => {
      const batch = pending.slice(0, 80);
      for (const x of batch) attempted.current.add(normTask(x));
      setStatus('working');
      try {
        const res = await requestTaskCategories(batch);
        setMem((prev) => {
          let next = prev;
          for (const [name, cat] of Object.entries(res)) next = rememberTask(next, name, cat, 'ai');
          writeTaskCats(next);
          return next;
        });
        setStatus('idle');
      } catch {
        setStatus('error'); // grupowanie ze słownika („Sprawy codzienne” dla reszty)
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [pending, grouped]);
  const setCategory = (title, category) =>
    setMem((prev) => {
      const next = rememberTask(prev, title, category, 'user');
      writeTaskCats(next);
      return next;
    });
  return { mem, grouped, setGrouped, editing, setEditing, status, setCategory };
}

// Pasek nad listami: grupowanie wg kategorii (domyślnie włączone) i tryb zmiany kategorii
export function TaskGroupBar({ cats }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1">
      <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-stone-600 dark:text-stone-300">
        <input type="checkbox" checked={cats.grouped} onChange={(e) => cats.setGrouped(e.target.checked)} className="h-4 w-4 accent-blue-600" aria-label="Grupuj zadania według kategorii" />
        Grupuj wg kategorii
        <BetaBadge />
      </label>
      {cats.grouped && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] text-stone-400" aria-live="polite">
            <Sparkles size={12} className={cats.status === 'working' ? 'animate-pulse text-violet-500' : 'text-violet-400'} />
            {cats.status === 'working' ? 'AI porządkuje nowe zadania…' : cats.status === 'error' ? 'AI niedostępne – kategorie ze słownika' : 'pamięć + AI'}
          </span>
          <button
            type="button"
            onClick={() => cats.setEditing(!cats.editing)}
            aria-pressed={cats.editing}
            className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold transition-colors ${cats.editing ? 'bg-blue-600 text-white dark:bg-blue-500 dark:text-neutral-950' : 'border border-stone-200 text-stone-600 hover:bg-stone-50 dark:border-white/10 dark:text-stone-300 dark:hover:bg-white/5'}`}
          >
            <Pencil size={12} /> {cats.editing ? 'Gotowe' : 'Zmień kategorie'}
          </button>
        </div>
      )}
    </div>
  );
}

// Lista zadań podzielona na sekcje kategorii (przy ≥ 2 zadaniach); renderItem(t) zwraca <li key=…>
export function GroupedTaskList({ items, cats, renderItem, titleOf = (t) => t.title }) {
  const select = (t) => {
    const title = titleOf(t);
    return (
      <li key={`cat-${t.id}`} className="-mt-1 pb-1 pl-11">
        <select className="h-8 max-w-full rounded-lg border border-stone-200 bg-white px-1.5 text-xs text-stone-700 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-neutral-800 dark:text-stone-200" value={taskCategoryOf(title, cats.mem)} onChange={(e) => cats.setCategory(title, e.target.value)} aria-label={`Kategoria zadania ${title}`}>
          {TASK_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.id}
            </option>
          ))}
        </select>
      </li>
    );
  };
  const rows = (list) =>
    list.map((t) => (
      <Fragment key={t.id}>
        {renderItem(t)}
        {cats.grouped && cats.editing && select(t)}
      </Fragment>
    ));
  if (!cats.grouped || items.length < 2) return <ul className="space-y-1">{rows(items)}</ul>;
  return (
    <div className="space-y-2">
      {groupTasks(items, cats.mem, titleOf).map((g) => (
        <section key={g.id} aria-label={`Kategoria zadań ${g.id}`}>
          <div className="mx-2 mt-1 mb-0.5 flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-stone-500 uppercase dark:text-stone-400">
            <span aria-hidden="true">{g.emoji}</span> {g.id} <span className="font-semibold text-stone-400 dark:text-stone-500">{g.items.length}</span>
          </div>
          <ul className="space-y-1">{rows(g.items)}</ul>
        </section>
      ))}
    </div>
  );
}
