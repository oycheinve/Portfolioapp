import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Eraser, ListPlus, Pencil, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { MissingTablesError, cloudStore, localStore, makeItem, makeList, sortItems, sortLists } from '../lib/shopping.js';
import { EmptyState } from '../components/ui.jsx';

const SELECTED_KEY = 'fintrack-shopping-selected';
const readSelected = () => {
  try {
    return localStorage.getItem(SELECTED_KEY) || '';
  } catch {
    return '';
  }
};
const saveSelected = (id) => {
  try {
    localStorage.setItem(SELECTED_KEY, id);
  } catch {
    // brak localStorage
  }
};

const card = 'min-w-0 rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-white/10 dark:bg-neutral-900';
const inputCls = 'h-10 min-w-0 rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 dark:border-white/10 dark:bg-neutral-800';
const iconBtn = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:text-stone-500 dark:hover:bg-white/5 dark:hover:text-stone-200';

// Listy zakupów: wybór listy (pigułki), pozycje do kupienia i kupione, dodawanie / odhaczanie / usuwanie.
// Po zalogowaniu – tabele Supabase (synchronizacja między urządzeniami), w trybie lokalnym – pamięć przeglądarki.
export default function ShoppingView() {
  const { cloud, actions } = useApp();
  const userId = cloud?.enabled ? cloud.user?.id : null;
  const [missingTables, setMissingTables] = useState(false);
  const store = useMemo(() => (userId && !missingTables ? cloudStore(userId) : localStore), [userId, missingTables]);
  const [data, setData] = useState({ lists: [], items: [] });
  const [loading, setLoading] = useState(true);
  const [selected, setSelectedState] = useState(readSelected);
  const setSelected = (id) => {
    setSelectedState(id);
    saveSelected(id);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await store.load());
    } catch (e) {
      if (e instanceof MissingTablesError) setMissingTables(true);
      else actions.notify(`Zakupy: ${e.message}`, 'error');
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
      else actions.notify(`Nie udało się zapisać: ${e.message}`, 'error');
      load();
    }
  };

  const lists = useMemo(() => sortLists(data.lists), [data.lists]);
  const current = lists.find((l) => l.id === selected) || lists[0] || null;
  const items = useMemo(() => (current ? sortItems(data.items.filter((i) => i.listId === current.id)) : []), [data.items, current]);
  const counts = useMemo(() => {
    const out = {};
    for (const i of data.items) {
      out[i.listId] ||= { open: 0, done: 0 };
      out[i.listId][i.done ? 'done' : 'open'] += 1;
    }
    return out;
  }, [data.items]);

  // ── Listy ──
  const [newList, setNewList] = useState(null); // null – ukryte pole, '' – wpisywanie
  const addList = (e) => {
    e.preventDefault();
    const name = (newList || '').trim();
    if (!name) return;
    const list = makeList(name);
    run((d) => ({ ...d, lists: [...d.lists, list] }), () => store.addList(list));
    setSelected(list.id);
    setNewList(null);
  };
  const [renaming, setRenaming] = useState(null);
  const saveRename = (e) => {
    e.preventDefault();
    const name = (renaming || '').trim().slice(0, 60);
    if (!current || !name || name === current.name) return setRenaming(null);
    const id = current.id;
    run((d) => ({ ...d, lists: d.lists.map((l) => (l.id === id ? { ...l, name } : l)) }), () => store.renameList(id, name));
    setRenaming(null);
    return undefined;
  };
  const deleteList = () => {
    if (!current) return;
    const n = counts[current.id] ? counts[current.id].open + counts[current.id].done : 0;
    if (!window.confirm(`Usunąć listę „${current.name}”${n ? ` razem z ${n} pozycjami` : ''}?`)) return;
    const id = current.id;
    run((d) => ({ lists: d.lists.filter((l) => l.id !== id), items: d.items.filter((i) => i.listId !== id) }), () => store.deleteList(id));
  };

  // ── Pozycje ──
  const [title, setTitle] = useState('');
  const [qty, setQty] = useState('');
  const titleRef = useRef(null);
  const addItem = (e) => {
    e.preventDefault();
    if (!current || !title.trim()) return;
    const item = makeItem(current.id, title, qty);
    run((d) => ({ ...d, items: [...d.items, item] }), () => store.addItem(item));
    setTitle('');
    setQty('');
    titleRef.current?.focus();
  };
  const toggle = (item) => {
    const done = !item.done;
    const doneAt = done ? new Date().toISOString() : null;
    run((d) => ({ ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, done, doneAt } : i)) }), () => store.setDone(item.id, done, doneAt));
  };
  const removeItem = (item) => run((d) => ({ ...d, items: d.items.filter((i) => i.id !== item.id) }), () => store.deleteItem(item.id));
  const clearDone = () => {
    if (!current) return;
    const id = current.id;
    run((d) => ({ ...d, items: d.items.filter((i) => !(i.listId === id && i.done)) }), () => store.deleteDone(id));
  };

  const openCount = items.filter((i) => !i.done).length;
  const doneCount = items.length - openCount;
  const pill = (on) =>
    `inline-flex h-9 max-w-full items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors ${
      on ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500 dark:text-neutral-950' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50 dark:border-white/10 dark:bg-neutral-800 dark:text-stone-300 dark:hover:bg-neutral-700'
    }`;

  return (
    <div className="space-y-3 sm:space-y-4">
      {missingTables && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          W bazie Supabase brakuje tabel list zakupów – uruchom raz skrypt <code className="font-mono text-xs">supabase/shopping_lists.sql</code> (SQL Editor → Run). Do tego czasu listy zapisują się tylko w tej przeglądarce.
        </p>
      )}

      {/* Wybór listy */}
      <section className={`${card} p-3 sm:p-4`} aria-label="Listy zakupów">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Wybór listy">
          {lists.map((l) => {
            const c = counts[l.id] || { open: 0, done: 0 };
            const on = current?.id === l.id;
            return (
              <button key={l.id} type="button" onClick={() => setSelected(l.id)} aria-pressed={on} className={pill(on)}>
                <span className="truncate">{l.name}</span>
                {c.open > 0 && <span className={`rounded-full px-1.5 text-[11px] leading-5 tabular ${on ? 'bg-white/25' : 'bg-stone-100 dark:bg-white/10'}`}>{c.open}</span>}
              </button>
            );
          })}
          {newList === null ? (
            <button type="button" onClick={() => setNewList('')} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-dashed border-stone-300 px-3 text-sm font-semibold text-stone-600 hover:bg-stone-50 dark:border-white/20 dark:text-stone-300 dark:hover:bg-white/5">
              <ListPlus size={16} /> Nowa lista
            </button>
          ) : (
            <form onSubmit={addList} className="flex w-full gap-2 sm:w-auto">
              <input autoFocus value={newList} onChange={(e) => setNewList(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setNewList(null)} maxLength={60} placeholder="np. Spożywcze, Market budowlany" aria-label="Nazwa nowej listy" className={`${inputCls} flex-1 sm:w-64`} />
              <button type="submit" disabled={!newList.trim()} className="inline-flex h-10 shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:text-neutral-950">
                <Plus size={16} /> Utwórz
              </button>
              <button type="button" onClick={() => setNewList(null)} aria-label="Anuluj" className={iconBtn}>
                <X size={16} />
              </button>
            </form>
          )}
        </div>
      </section>

      {loading && !lists.length && <div className="h-40 animate-pulse rounded-2xl bg-stone-100 dark:bg-white/[0.04]" />}

      {!loading && !lists.length && (
        <section className={card}>
          <EmptyState icon={ShoppingCart} title="Brak list zakupów" description="Utwórz pierwszą listę przyciskiem „Nowa lista” – np. „Spożywcze” albo „Market budowlany”." />
        </section>
      )}

      {current && (
        <section className={card} aria-label={`Lista ${current.name}`}>
          <header className="flex items-center gap-2 border-b border-stone-100 px-4 py-3 dark:border-white/5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600 dark:bg-white/5 dark:text-stone-300">
              <ShoppingCart size={16} />
            </span>
            {renaming !== null ? (
              <form onSubmit={saveRename} className="flex min-w-0 flex-1 gap-2">
                <input autoFocus value={renaming} onChange={(e) => setRenaming(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)} maxLength={60} aria-label="Nazwa listy" className={`${inputCls} h-9 flex-1`} />
                <button type="submit" aria-label="Zapisz nazwę" className={iconBtn}>
                  <Check size={16} />
                </button>
              </form>
            ) : (
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold">{current.name}</h2>
                <p className="text-xs text-stone-500 tabular dark:text-stone-400">
                  {openCount ? `Do kupienia: ${openCount}` : items.length ? 'Wszystko kupione ✓' : 'Lista jest pusta'}
                  {doneCount ? ` · kupione: ${doneCount}` : ''}
                </p>
              </div>
            )}
            {renaming === null && (
              <>
                <button type="button" onClick={() => setRenaming(current.name)} aria-label="Zmień nazwę listy" title="Zmień nazwę" className={iconBtn}>
                  <Pencil size={15} />
                </button>
                <button type="button" onClick={deleteList} aria-label="Usuń listę" title="Usuń listę" className={`${iconBtn} hover:!bg-red-50 hover:!text-red-600 dark:hover:!bg-red-500/10`}>
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </header>

          <form onSubmit={addItem} className="flex gap-2 px-3 pt-3 sm:px-4" aria-label="Nowa pozycja">
            <input ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Dodaj produkt, np. Mleko" aria-label="Nazwa produktu" className={`${inputCls} flex-1`} />
            <input value={qty} onChange={(e) => setQty(e.target.value)} maxLength={30} placeholder="Ilość" aria-label="Ilość" className={`${inputCls} w-20 sm:w-28`} />
            <button type="submit" disabled={!title.trim()} aria-label="Dodaj produkt" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto sm:px-3 dark:bg-blue-500 dark:text-neutral-950">
              <Plus size={18} /> <span className="hidden sm:ml-1 sm:inline sm:text-sm sm:font-semibold">Dodaj</span>
            </button>
          </form>

          <ul className="space-y-0.5 p-2 sm:p-3" aria-label="Pozycje listy">
            {!items.length && <li className="px-2 py-6 text-center text-sm text-stone-500 dark:text-stone-400">Dodaj pierwszy produkt w polu powyżej.</li>}
            {items.map((it, idx) => (
              <li key={it.id}>
                {it.done && idx > 0 && !items[idx - 1].done && <div className="mx-2 my-2 border-t border-dashed border-stone-200 pt-1 text-[11px] font-semibold tracking-wide text-stone-400 uppercase dark:border-white/10 dark:text-stone-500">Kupione</div>}
                <div className="group flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-stone-50 dark:hover:bg-white/[0.03]">
                  <button type="button" role="checkbox" aria-checked={it.done} onClick={() => toggle(it)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 text-left">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${it.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-stone-300 dark:border-white/25'}`}>{it.done && <Check size={15} strokeWidth={3} />}</span>
                    <span className={`min-w-0 flex-1 text-sm break-words ${it.done ? 'text-stone-400 line-through dark:text-stone-500' : 'font-medium'}`}>{it.title}</span>
                    {it.quantity && <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular ${it.done ? 'text-stone-400 dark:text-stone-500' : 'bg-stone-100 text-stone-600 dark:bg-white/[0.06] dark:text-stone-300'}`}>{it.quantity}</span>}
                  </button>
                  <button type="button" onClick={() => removeItem(it)} aria-label={`Usuń ${it.title}`} title="Usuń pozycję" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-stone-300 hover:bg-red-50 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100 dark:text-stone-600 dark:hover:bg-red-500/10">
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {doneCount > 0 && (
            <div className="flex justify-end border-t border-stone-100 px-3 py-2 dark:border-white/5">
              <button type="button" onClick={clearDone} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-white/5">
                <Eraser size={14} /> Usuń kupione ({doneCount})
              </button>
            </div>
          )}
        </section>
      )}
      <p className="text-center text-[11px] text-stone-400">{store.kind === 'cloud' ? 'Listy synchronizują się z Twoim kontem w chmurze.' : 'Listy zapisują się w tej przeglądarce – zaloguj się do chmury, aby mieć je na wszystkich urządzeniach.'}</p>
    </div>
  );
}
