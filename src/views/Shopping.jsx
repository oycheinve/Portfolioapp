import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Eraser, Pencil, Plus, ShoppingCart, Sparkles, Trash2 } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { MissingTablesError, cloudStore, localStore, makeItem, makeList, sortItems, sortLists } from '../lib/shopping.js';
import { SHOPPING_CATEGORIES, categoryOf, groupByCategory, normProduct, readCats, remember, resolveLocal, suggestProducts, writeCats } from '../lib/shoppingCategories.js';
import { requestShoppingCategories, requestShoppingPrices } from '../lib/newsAi.js';
import { aiOn } from '../lib/aiFeatures.js';
import { AI_PRICES_KEY, PRICES_KEY, buildPriceIndex, estimatePrice, formatZl, knownProducts, needsAiPrice, readAiPrices, readPriceOverrides, writeAiPrices, writePriceOverride } from '../lib/shoppingPrices.js';
import { DEPOSIT, RECEIPTS_KEY, isDepositDrink } from '../lib/receipts.js';
import { PREFS_CHANGED_EVENT } from '../lib/budget.js';

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

// Lista zakupów: jedna stała lista (tworzona automatycznie), pozycje do kupienia i kupione, dodawanie / odhaczanie;
// tryb „Edytuj” – kategorie, usuwanie pozycji, nazwa listy.
// Po zalogowaniu – tabele Supabase (synchronizacja między urządzeniami), w trybie lokalnym – pamięć przeglądarki.
export default function ShoppingView() {
  const { cloud, actions, state } = useApp();
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

  // ── Lista: jedna stała, domyślna – tworzona automatycznie, gdy użytkownik nie ma żadnej ──
  const creating = useRef(false);
  useEffect(() => {
    if (loading || lists.length || creating.current) return;
    creating.current = true;
    const list = makeList('Lista zakupów');
    run((d) => ({ ...d, lists: [...d.lists, list] }), () => store.addList(list)).finally(() => {
      creating.current = false;
    });
  }, [loading, lists.length]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // Dodanie produktu (z pola albo z podpowiedzi): zapis w uczącej się pamięci – użycie i kategoria rozpoznana
  // lokalnie (pamięć / słowo kluczowe / słownik); produkt nowy dostanie kategorię od AI (efekt poniżej)
  const addProduct = (name) => {
    const t = String(name || '').trim();
    if (!current || !t) return;
    const item = makeItem(current.id, t, qty);
    run((d) => ({ ...d, items: [...d.items, item] }), () => store.addItem(item));
    setAiCats((prev) => {
      const r = resolveLocal(t, prev);
      const next = remember(prev, t, { category: r?.category, source: r?.source === 'memory' ? undefined : r?.source, used: true });
      writeCats(next);
      return next;
    });
    setTitle('');
    setQty('');
    titleRef.current?.focus();
  };
  const addItem = (e) => {
    e.preventDefault();
    addProduct(title);
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

  // Kategorie (BETA): AI przypisuje nowe produkty (wszystkie listy, w tle, po krótkiej przerwie w pisaniu);
  // wynik zapamiętany per nazwa produktu i synchronizowany; do odpowiedzi – dopasowanie ze słownika
  const [aiCats, setAiCats] = useState(readCats);
  const [aiStatus, setAiStatus] = useState('idle'); // idle | working | error
  // Grupowanie wg kategorii – jeden globalny przełącznik w Ustawieniach (Zakupy i Zadania), domyślnie włączony
  const grouped = state.settings.groupByCategory !== false;
  const attempted = useRef(new Set());
  const pendingTitles = useMemo(() => {
    const seen = new Set();
    return data.items
      .filter((i) => !i.done)
      .map((i) => i.title)
      .filter((t) => {
        const k = normProduct(t);
        // AI tylko dla produktów nieznanych lokalnie (pamięć, nauczone słowa kluczowe, słownik)
        if (!k || resolveLocal(t, aiCats) || attempted.current.has(k) || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  }, [data.items, aiCats]);
  useEffect(() => {
    if (!grouped || !pendingTitles.length || !aiOn(state.settings, 'shoppingAi')) return undefined; // AI wyłączone – grupowanie z pamięci
    const t = setTimeout(async () => {
      const batch = pendingTitles.slice(0, 80);
      for (const x of batch) attempted.current.add(normProduct(x));
      setAiStatus('working');
      try {
        const res = await requestShoppingCategories(batch);
        setAiCats((prev) => {
          let next = prev;
          for (const [name, cat] of Object.entries(res)) next = remember(next, name, { category: cat, source: 'ai' });
          writeCats(next);
          return next;
        });
        setAiStatus('idle');
      } catch {
        setAiStatus('error'); // grupowanie ze słownika; ponowna próba przy kolejnym otwarciu listy
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [pendingTitles, grouped, state.settings.ai]); // eslint-disable-line react-hooks/exhaustive-deps
  const openItems = items.filter((i) => !i.done);
  const doneItems = items.filter((i) => i.done);
  const groups = useMemo(() => (grouped ? groupByCategory(openItems, aiCats) : []), [grouped, openItems, aiCats]); // eslint-disable-line react-hooks/exhaustive-deps
  // Podpowiedzi od 3 znaków: produkty z pamięci (bez tych, które już czekają na tej liście)
  const suggestions = useMemo(() => suggestProducts(aiCats, title, { exclude: new Set(openItems.map((i) => normProduct(i.title))) }), [aiCats, title, openItems]); // eslint-disable-line react-hooks/exhaustive-deps
  const emojiOf = (c) => SHOPPING_CATEGORIES.find((x) => x.id === c)?.emoji || '🏠';
  const pill = (on) =>
    `inline-flex h-9 max-w-full items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors ${
      on ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500 dark:text-neutral-950' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50 dark:border-white/10 dark:bg-neutral-800 dark:text-stone-300 dark:hover:bg-neutral-700'
    }`;

  // Tryb edycji listy (przycisk „Edytuj” przy nazwie listy): zmiana kategorii produktów (zapamiętywana od razu
  // jako poprawka użytkownika – samouczenie, pierwszeństwo przed AI), usuwanie pozycji, nazwa i usunięcie listy.
  // Poza trybem edycji lista jest czysta: tylko odhaczanie produktów.
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [current?.id]);
  const setCategory = (it, category) =>
    setAiCats((prev) => {
      const next = remember(prev, it.title, { category, source: 'user' });
      writeCats(next);
      return next;
    });

  // ── Szacowane ceny z historii paragonów (pamięć cen) + korekta użytkownika ──
  const [priceVer, setPriceVer] = useState(0);
  useEffect(() => {
    const on = (e) => (!e.detail?.key || e.detail.key === RECEIPTS_KEY || e.detail.key === PRICES_KEY || e.detail.key === AI_PRICES_KEY) && setPriceVer((v) => v + 1);
    window.addEventListener(PREFS_CHANGED_EVENT, on);
    return () => window.removeEventListener(PREFS_CHANGED_EVENT, on);
  }, []);
  const priceIndex = useMemo(() => buildPriceIndex(), [priceVer]); // eslint-disable-line react-hooks/exhaustive-deps
  const overrides = useMemo(() => readPriceOverrides(), [priceVer]); // eslint-disable-line react-hooks/exhaustive-deps
  const pricesAiOn = aiOn(state.settings, 'shoppingPrices');
  // Wyłączone w Ustawieniach → bez szacunków i dopasowań AI (zapamiętane wyniki zostają na później)
  const aiPrices = useMemo(() => (pricesAiOn ? readAiPrices() : {}), [priceVer, pricesAiOn]); // eslint-disable-line react-hooks/exhaustive-deps
  // Kaucja 0,50 zł za napój w butelce / puszce (to samo ustawienie co przy paragonach, domyślnie włączone)
  const depositOn = state.settings.receiptDeposit !== false;
  const estimates = useMemo(
    () => Object.fromEntries(items.map((it) => [it.id, estimatePrice(it.title, it.quantity, priceIndex, overrides, aiPrices, depositOn && isDepositDrink({ name: it.title, category: categoryOf(it.title, aiCats).category }) ? DEPOSIT : 0)])),
    [items, priceIndex, overrides, aiPrices, depositOn, aiCats],
  );
  const priced = openItems.filter((it) => estimates[it.id]);
  const aiPriced = priced.filter((it) => estimates[it.id].source === 'ai').length;
  // AI fallback: produkty bez dopasowania w paragonach – dopasowanie semantyczne do nazw z paragonów albo szacunek
  // ceny rynkowej; w tle, po przerwie w pisaniu, raz na produkt (wynik zapamiętany). Ustawienia → Funkcje AI.
  const priceAsked = useRef(new Set());
  const [priceAi, setPriceAi] = useState('idle'); // idle | working | error
  const pendingPrices = useMemo(
    () => (pricesAiOn ? [...new Set(openItems.map((it) => it.title.trim()))].filter((t) => !priceAsked.current.has(t.toLowerCase()) && needsAiPrice(t, priceIndex, overrides, aiPrices)) : []),
    [pricesAiOn, openItems, priceIndex, overrides, aiPrices], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    if (!pendingPrices.length) return undefined;
    const t = setTimeout(async () => {
      const batch = pendingPrices.slice(0, 40);
      for (const x of batch) priceAsked.current.add(x.toLowerCase());
      setPriceAi('working');
      try {
        const res = await requestShoppingPrices(batch, knownProducts(priceIndex));
        writeAiPrices(batch, res.prices || {});
        setPriceAi('idle');
      } catch {
        setPriceAi('error'); // bez AI – ceny z paragonów i Twoje korekty działają dalej
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [pendingPrices]); // eslint-disable-line react-hooks/exhaustive-deps
  const estTotal = priced.reduce((sum, it) => sum + estimates[it.id].total, 0);
  const [priceFor, setPriceFor] = useState(null); // id pozycji z otwartym podglądem / korektą ceny
  const [priceDraft, setPriceDraft] = useState('');
  const openPrice = (it) => {
    if (priceFor === it.id) return setPriceFor(null);
    const est = estimates[it.id];
    setPriceDraft(est ? String(est.price).replace('.', ',') : '');
    setPriceFor(it.id);
    return undefined;
  };
  const savePrice = (e, it) => {
    e.preventDefault();
    const v = Number(String(priceDraft).replace(/\s/g, '').replace(',', '.'));
    if (!(v > 0)) return;
    writePriceOverride(it.title, v);
    setPriceFor(null);
  };
  const resetPrice = (it) => {
    writePriceOverride(it.title, null);
    setPriceFor(null);
  };
  const priceTag = (it) => {
    const est = estimates[it.id];
    if (!est && !editing) return null;
    return (
      <button
        type="button"
        onClick={() => openPrice(it)}
        aria-expanded={priceFor === it.id}
        aria-label={est ? `Cena ${it.title}: ok. ${formatZl(est.total)} – podgląd i korekta` : `Dodaj cenę ${it.title}`}
        title={!est ? 'Dodaj cenę' : est.source === 'ai' ? 'Szacunek AI (cena rynkowa) – dotknij, aby poprawić' : 'Szacowana cena z historii paragonów – dotknij, aby podejrzeć lub poprawić'}
        className={`inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] tabular hover:bg-stone-100 dark:hover:bg-white/5 ${it.done ? 'text-stone-300 dark:text-stone-600' : est?.source === 'user' ? 'text-blue-600 dark:text-blue-400' : 'text-stone-400 dark:text-stone-500'}`}
      >
        {est?.source === 'ai' && <Sparkles size={10} className="text-violet-400" aria-hidden="true" />}
        {est ? `ok. ${formatZl(est.total)}` : '+ cena'}
      </button>
    );
  };
  const priceEditor = (it) => {
    if (priceFor !== it.id) return null;
    const est = estimates[it.id];
    return (
      <form onSubmit={(e) => savePrice(e, it)} className="mx-2 mb-1.5 rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs dark:border-white/10 dark:bg-white/[0.03]" aria-label={`Cena ${it.title}`}>
        <p className="text-stone-600 dark:text-stone-300">
          {est?.source === 'ai'
            ? `Szacunek AI – cena rynkowa${est.aiUnit ? ` za ${est.aiUnit}` : ''} (tego produktu nie ma jeszcze na Twoich paragonach). Popraw, jeśli płacisz inaczej.`
            : est?.last !== null && est?.last !== undefined
            ? `${est.semantic ? 'AI dopasowało do paragonów. ' : ''}Z paragonów: ostatnio ${formatZl(est.last)}${est.lastDate ? ` (${est.lastDate.split('-').reverse().join('.')})` : ''}${est.count > 1 ? `, średnio ${formatZl(est.avg)} (ostatnie ${Math.min(est.count, 3)} z ${est.count})` : ''}${est.lastName && est.lastName.toLowerCase() !== it.title.toLowerCase() ? ` · „${est.lastName}”` : ''}`
            : 'Brak tego produktu na zeskanowanych paragonach – wpisz cenę, zapamiętam ją.'}
          {est?.deposit > 0 ? ` · w tym kaucja ${formatZl(est.deposit)}` : ''}
          {est?.source === 'user' ? ' · używasz swojej ceny' : ''}
          {est && est.factor > 1 ? ` · × ${est.factor} szt.` : ''}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input autoFocus inputMode="decimal" value={priceDraft} onChange={(e) => setPriceDraft(e.target.value)} placeholder="Cena za szt." aria-label={`Twoja cena ${it.title}`} className={`${inputCls} h-8 w-28`} />
          <span className="text-stone-400">zł / szt.</span>
          <button type="submit" className="inline-flex h-8 items-center gap-1 rounded-lg bg-blue-600 px-2.5 font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:text-neutral-950">
            <Check size={13} /> Zapisz
          </button>
          {est?.source === 'user' && (
            <button type="button" onClick={() => resetPrice(it)} className="h-8 rounded-lg px-2 font-medium text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-white/5">
              {est.count ? 'Wróć do ceny z paragonów' : 'Usuń cenę'}
            </button>
          )}
        </div>
      </form>
    );
  };

  const renderRow = (it) => {
    const qtyBadge = it.quantity && <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular ${it.done ? 'text-stone-400 dark:text-stone-500' : 'bg-stone-100 text-stone-600 dark:bg-white/[0.06] dark:text-stone-300'}`}>{it.quantity}</span>;
    if (editing) {
      const cat = categoryOf(it.title, aiCats).category;
      return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-2 py-1.5">
          <span className={`min-w-0 flex-1 text-sm break-words ${it.done ? 'text-stone-400 line-through dark:text-stone-500' : 'font-medium'}`}>{it.title}</span>
          {qtyBadge}
          {priceTag(it)}
          <select
            className="h-8 max-w-[11.5rem] min-w-0 rounded-lg border border-stone-200 bg-white px-1.5 text-xs text-stone-700 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-neutral-800 dark:text-stone-200"
            value={cat}
            onChange={(e) => setCategory(it, e.target.value)}
            aria-label={`Kategoria ${it.title}`}
          >
            {SHOPPING_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.id}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => removeItem(it)} aria-label={`Usuń ${it.title}`} title="Usuń pozycję" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10">
            <Trash2 size={15} />
          </button>
          {priceFor === it.id && <div className="w-full">{priceEditor(it)}</div>}
        </div>
      );
    }
    return (
      <>
      <div className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-stone-50 dark:hover:bg-white/[0.03]">
        <button type="button" role="checkbox" aria-checked={it.done} onClick={() => toggle(it)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 text-left">
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${it.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-stone-300 dark:border-white/25'}`}>{it.done && <Check size={15} strokeWidth={3} />}</span>
          <span className={`min-w-0 flex-1 text-sm break-words ${it.done ? 'text-stone-400 line-through dark:text-stone-500' : 'font-medium'}`}>{it.title}</span>
          {qtyBadge}
        </button>
        {priceTag(it)}
      </div>
      {priceEditor(it)}
      </>
    );
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {missingTables && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          W bazie Supabase brakuje tabel list zakupów – uruchom raz skrypt <code className="font-mono text-xs">supabase/shopping_lists.sql</code> (SQL Editor → Run). Do tego czasu listy zapisują się tylko w tej przeglądarce.
        </p>
      )}

      {/* Jedna stała lista zakupów (tworzona automatycznie); dodatkowe listy z wcześniejszych wersji – wybór w nagłówku */}
      {(loading || !current) && <div className="h-40 animate-pulse rounded-2xl bg-stone-100 dark:bg-white/[0.04]" />}

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
                {lists.length > 1 ? (
                  // Listy z wcześniejszych wersji – dostęp do nich bez przycisków tworzenia nowych
                  <select value={current.id} onChange={(e) => setSelected(e.target.value)} aria-label="Wybór listy" className="max-w-full truncate bg-transparent text-sm font-semibold outline-none">
                    {lists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                        {counts[l.id]?.open ? ` (${counts[l.id].open})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <h2 className="truncate text-sm font-semibold">{current.name}</h2>
                )}
                <p className="text-xs text-stone-500 tabular dark:text-stone-400">
                  {openCount ? `Do kupienia: ${openCount}` : items.length ? 'Wszystko kupione ✓' : 'Lista jest pusta'}
                  {doneCount ? ` · kupione: ${doneCount}` : ''}
                </p>
              </div>
            )}
            {renaming === null && editing && (
              <>
                <button type="button" onClick={() => setRenaming(current.name)} aria-label="Zmień nazwę listy" title="Zmień nazwę" className={iconBtn}>
                  <Pencil size={15} />
                </button>
                {lists.length > 1 && (
                  <button type="button" onClick={deleteList} aria-label="Usuń listę" title="Usuń listę" className={`${iconBtn} hover:!bg-red-50 hover:!text-red-600 dark:hover:!bg-red-500/10`}>
                    <Trash2 size={15} />
                  </button>
                )}
              </>
            )}
            {renaming === null && (
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                aria-pressed={editing}
                aria-label={editing ? 'Zakończ edycję listy' : 'Edytuj listę'}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors ${editing ? 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:text-neutral-950' : 'border border-stone-200 text-stone-700 hover:bg-stone-50 dark:border-white/10 dark:text-stone-200 dark:hover:bg-white/5'}`}
              >
                {editing ? <Check size={14} /> : <Pencil size={14} />} {editing ? 'Gotowe' : 'Edytuj'}
              </button>
            )}
          </header>

          <form onSubmit={addItem} className="flex gap-2 px-3 pt-3 sm:px-4" aria-label="Nowa pozycja">
            <input ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Dodaj produkt, np. Mleko" aria-label="Nazwa produktu" autoComplete="off" className={`${inputCls} flex-1`} />
            <input value={qty} onChange={(e) => setQty(e.target.value)} maxLength={30} placeholder="Ilość" aria-label="Ilość" className={`${inputCls} w-20 sm:w-28`} />
            <button type="submit" disabled={!title.trim()} aria-label="Dodaj produkt" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto sm:px-3 dark:bg-blue-500 dark:text-neutral-950">
              <Plus size={18} /> <span className="hidden sm:ml-1 sm:inline sm:text-sm sm:font-semibold">Dodaj</span>
            </button>
          </form>

          {suggestions.length > 0 && (
            <ul className="mx-3 mt-1.5 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm sm:mx-4 dark:border-white/10 dark:bg-neutral-800" aria-label="Podpowiedzi produktów">
              {suggestions.map((sg) => (
                <li key={sg.key}>
                  <button type="button" onClick={() => addProduct(sg.name)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50 dark:hover:bg-white/5" aria-label={`Dodaj ${sg.name}`}>
                    <Plus size={14} className="shrink-0 text-blue-600 dark:text-blue-400" />
                    <span className="min-w-0 flex-1 truncate font-medium">{sg.name}</span>
                    {sg.category && (
                      <span className="shrink-0 rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-600 dark:bg-white/[0.06] dark:text-stone-300">
                        {emojiOf(sg.category)} {sg.category}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {items.length > 0 && grouped && (
            <div className="flex flex-wrap items-center justify-end gap-2 px-3 pt-2 sm:px-4">
              {grouped && (
                <span className="inline-flex items-center gap-1 text-[11px] text-stone-400" aria-live="polite">
                  <Sparkles size={12} className={aiStatus === 'working' ? 'animate-pulse text-violet-500' : 'text-violet-400'} />
                  {aiStatus === 'working' ? 'AI rozpoznaje nowe produkty…' : aiStatus === 'error' ? 'AI niedostępne – kategorie z pamięci i słownika' : 'Kategorie: pamięć + AI'}
                </span>
              )}
            </div>
          )}
          {editing && items.length > 0 && <p className="mx-3 mt-2 rounded-lg bg-blue-50 px-3 py-2 text-[11px] text-blue-900 sm:mx-4 dark:bg-blue-500/10 dark:text-blue-200">Tryb edycji: zmień kategorię produktu (zapamiętam ją na przyszłość) albo usuń pozycję. „Gotowe” wraca do listy.</p>}
          <ul className="space-y-0.5 p-2 sm:p-3" aria-label="Pozycje listy">
            {!items.length && <li className="px-2 py-6 text-center text-sm text-stone-500 dark:text-stone-400">Dodaj pierwszy produkt w polu powyżej.</li>}
            {grouped && openItems.length > 0
              ? groups.map((g) => (
                  <li key={g.id} aria-label={`Kategoria ${g.id}`}>
                    <div className="mx-2 mt-2 mb-0.5 flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-stone-500 uppercase dark:text-stone-400">
                      <span aria-hidden="true">{g.emoji}</span> {g.id} <span className="font-semibold text-stone-400 dark:text-stone-500">{g.items.length}</span>
                    </div>
                    <ul className="space-y-0.5">
                      {g.items.map((it) => (
                        <li key={it.id}>{renderRow(it)}</li>
                      ))}
                    </ul>
                  </li>
                ))
              : openItems.map((it) => <li key={it.id}>{renderRow(it)}</li>)}
            {doneItems.length > 0 && (
              <li>
                {openItems.length > 0 && <div className="mx-2 my-2 border-t border-dashed border-stone-200 pt-1 text-[11px] font-semibold tracking-wide text-stone-400 uppercase dark:border-white/10 dark:text-stone-500">Kupione</div>}
                <ul className="space-y-0.5">
                  {doneItems.map((it) => (
                    <li key={it.id}>{renderRow(it)}</li>
                  ))}
                </ul>
              </li>
            )}
          </ul>
          {/* Szacowany koszt pozycji do kupienia – ceny z historii paragonów (i Twoich korekt) */}
          {priced.length > 0 && (
            <div className="flex items-baseline justify-between gap-2 border-t border-stone-100 px-4 py-2.5 dark:border-white/5" aria-live="polite" aria-label="Szacowany koszt zakupów">
              <span className="text-xs text-stone-500 dark:text-stone-400">
                Szacowany koszt zakupów
                {aiPriced > 0 && <span className="text-stone-400 dark:text-stone-500"> · w tym szacunki AI: {aiPriced}</span>}
                {priceAi === 'working' && <span className="text-violet-500"> · AI szacuje ceny…</span>}
                {priced.length < openItems.length && (
                  <span className="text-stone-400 dark:text-stone-500">
                    {' '}
                    · ceny dla {priced.length} z {openItems.length}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-sm font-semibold whitespace-nowrap tabular">ok. {formatZl(estTotal)}</span>
            </div>
          )}
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
