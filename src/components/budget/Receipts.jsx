import { useMemo, useRef, useState } from 'react';
import { Camera, Check, ChevronDown, Loader2, Plus, Receipt, Trash2, X } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { SHOPPING_CATEGORIES } from '../../lib/shoppingCategories.js';
import { applyMemory, cacheReceipt, cachedReceipt, compressImage, imageHash, learnFromReceipt, readReceipts, receiptTotals, writeReceipts } from '../../lib/receipts.js';
import { requestReceipt } from '../../lib/newsAi.js';
import { formatDate, formatPLN, todayISO } from '../../lib/format.js';
import { BetaBadge } from '../ui.jsx';

const inputCls = 'h-9 min-w-0 rounded-lg border border-stone-200 bg-white px-2 text-sm outline-none focus:border-blue-500 dark:border-white/10 dark:bg-neutral-800';
const emoji = (c) => SHOPPING_CATEGORIES.find((x) => x.id === c)?.emoji || '🏠';

// Skanowanie paragonu → (weryfikacja) → wydatek w budżecie + historia. rows – kategorie budżetu miesiąca,
// defaultRowId – domyślna kategoria budżetu (np. jedzenie), onSave(receipt, rowId) – zapis wydatku, zwraca opis.
export function ReceiptScanner({ rows, defaultRowId, onSave, month }) {
  const { state, actions } = useApp();
  const review = state.settings.receiptReview !== false;
  const fileRef = useRef(null);
  const [busy, setBusy] = useState('');
  const [draft, setDraft] = useState(null);

  const persist = (receipt, rowId, { auto = false } = {}) => {
    learnFromReceipt(receipt);
    const t = receiptTotals(receipt);
    const res = onSave({ ...receipt, total: t.sum }, rowId);
    const saved = { id: receipt.id || `rc${Date.now().toString(36)}`, shop: receipt.shop, date: receipt.date, time: receipt.time || '', items: receipt.items.map(({ name, quantity, price, category }) => ({ name, quantity, price, category })), total: t.sum, printedTotal: t.printed, rowId, month, savedAt: new Date().toISOString(), auto };
    writeReceipts([saved, ...readReceipts().filter((r) => r.id !== saved.id)]);
    actions.notify(`Paragon ${receipt.shop || ''} zapisany: ${formatPLN(t.sum)}${res?.name ? ` → ${res.name}` : ''}${auto ? ' (zapis automatyczny)' : ''}`, 'success');
    return saved;
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('Przygotowanie zdjęcia…');
    try {
      const img = await compressImage(file);
      const hash = await imageHash(img.base64);
      // Krok 1: lokalna pamięć (ten sam paragon – bez kosztu AI)
      let receipt = cachedReceipt(hash);
      if (!receipt) {
        setBusy('AI odczytuje paragon…');
        receipt = (await requestReceipt(img.base64, img.mime)).receipt;
        if (receipt?.items?.length) cacheReceipt(hash, receipt);
      }
      if (!receipt?.items?.length) throw new Error('Nie rozpoznano pozycji – zrób wyraźniejsze zdjęcie całego paragonu');
      // Krok 2: kategorie z uczącej się pamięci produktów, potem z AI
      const ready = { ...applyMemory(receipt), id: `rc${hash.slice(0, 12)}`, date: receipt.date || todayISO() };
      if (review) setDraft(ready);
      else persist(ready, defaultRowId, { auto: true });
    } catch (err) {
      actions.notify(`Paragon: ${err.message}`, 'warn');
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} aria-label="Zdjęcie paragonu" />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={!!busy || !rows.length}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-60 dark:border-white/10 dark:bg-neutral-800 dark:text-stone-200"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />} {busy || 'Skanuj paragon'}
        {!busy && <BetaBadge />}
      </button>
      {draft && (
        <ReceiptReview
          receipt={draft}
          rows={rows}
          defaultRowId={defaultRowId}
          onCancel={() => setDraft(null)}
          onSave={(r, rowId) => {
            persist(r, rowId);
            setDraft(null);
          }}
        />
      )}
    </>
  );
}

// Ekran weryfikacji (pełny ekran): sklep, data, pozycje z edycją nazwy / ceny / kategorii, sumy częściowe i suma całkowita
export function ReceiptReview({ receipt, rows, defaultRowId, onCancel, onSave, title = 'Weryfikacja paragonu', saveLabel = 'Zapisz w budżecie' }) {
  const [r, setR] = useState(receipt);
  const [rowId, setRowId] = useState(receipt.rowId || defaultRowId || rows[0]?.id || '');
  const t = useMemo(() => receiptTotals(r), [r]);
  const setItem = (id, patch) => setR((x) => ({ ...x, items: x.items.map((it) => (it.id === id ? { ...it, ...patch, edited: it.edited || 'category' in patch } : it)) }));
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-stone-50 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] dark:bg-neutral-950" role="dialog" aria-modal="true" aria-label={title}>
      <header className="flex items-center gap-2 border-b border-stone-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-neutral-900">
        <Receipt size={18} className="text-blue-600 dark:text-blue-400" />
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">
          {title}
          <BetaBadge />
        </h2>
        <button type="button" onClick={onCancel} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-white/5" aria-label="Zamknij bez zapisu">
          <X size={18} />
        </button>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-stone-500 dark:text-stone-400">
            Sklep
            <input className={`${inputCls} mt-0.5 w-full`} value={r.shop} onChange={(e) => setR({ ...r, shop: e.target.value })} aria-label="Nazwa sklepu" />
          </label>
          <label className="text-[11px] text-stone-500 dark:text-stone-400">
            Data{r.time ? ` (${r.time})` : ''}
            <input className={`${inputCls} mt-0.5 w-full`} type="date" value={r.date} onChange={(e) => setR({ ...r, date: e.target.value })} aria-label="Data paragonu" />
          </label>
        </div>
        <ul className="space-y-2" aria-label="Pozycje paragonu">
          {r.items.map((it) => (
            <li key={it.id} className="rounded-xl border border-stone-200 bg-white p-2 dark:border-white/10 dark:bg-neutral-900">
              <div className="flex items-center gap-2">
                <input className={`${inputCls} flex-1`} value={it.name} onChange={(e) => setItem(it.id, { name: e.target.value })} aria-label={`Nazwa pozycji ${it.name}`} />
                <input className={`${inputCls} w-24 text-right tabular`} type="number" inputMode="decimal" step="0.01" value={it.price} onChange={(e) => setItem(it.id, { price: e.target.value === '' ? '' : Number(e.target.value) })} aria-label={`Cena ${it.name}`} />
                <button type="button" onClick={() => setR({ ...r, items: r.items.filter((x) => x.id !== it.id) })} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stone-400 hover:text-red-600" aria-label={`Usuń pozycję ${it.name}`}>
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <select className={`${inputCls} h-8 flex-1 text-xs`} value={it.category} onChange={(e) => setItem(it.id, { category: e.target.value })} aria-label={`Kategoria ${it.name}`}>
                  {SHOPPING_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.emoji} {c.id}
                    </option>
                  ))}
                </select>
                <span className="shrink-0 text-[10px] text-stone-400">{it.edited ? 'poprawione – zapamiętam' : it.source === 'ai' ? 'AI' : 'z pamięci'}</span>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setR({ ...r, items: [...r.items, { id: `ri${Date.now().toString(36)}`, name: '', price: 0, quantity: 1, category: 'Dom i inne', source: 'user', edited: true }] })} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/10">
          <Plus size={15} /> Dodaj pozycję
        </button>
        <div className="rounded-xl border border-stone-200 bg-white p-3 dark:border-white/10 dark:bg-neutral-900" aria-label="Sumy częściowe">
          <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">Sumy częściowe</div>
          <ul className="space-y-1 text-sm tabular">
            {Object.entries(t.byCategory)
              .sort((a, b) => b[1] - a[1])
              .map(([c, v]) => (
                <li key={c} className="flex justify-between gap-2">
                  <span>
                    {emoji(c)} {c}
                  </span>
                  <span className="font-medium">{formatPLN(v)}</span>
                </li>
              ))}
          </ul>
        </div>
        <label className="block text-[11px] text-stone-500 dark:text-stone-400">
          Kategoria budżetu, do której trafi wydatek
          <select className={`${inputCls} mt-0.5 w-full`} value={rowId} onChange={(e) => setRowId(e.target.value)} aria-label="Kategoria budżetu">
            {rows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name || '(bez nazwy)'}
              </option>
            ))}
          </select>
        </label>
      </div>
      <footer className="border-t border-stone-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-neutral-900">
        <div className="mb-2 flex items-end justify-between gap-2">
          <span className="text-sm text-stone-500 dark:text-stone-400">Suma ({r.items.length} poz.)</span>
          <span className="text-2xl font-bold tabular" aria-label="Suma całkowita">
            {formatPLN(t.sum)}
          </span>
        </div>
        {t.printed > 0 && Math.abs(t.diff) >= 0.01 && <p className="mb-2 text-[11px] text-amber-700 dark:text-amber-400">Na paragonie: {formatPLN(t.printed)} (różnica {formatPLN(t.diff)}) – sprawdź pozycje i ceny.</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-stone-200 text-sm font-semibold text-stone-600 dark:border-white/10 dark:text-stone-300">
            Anuluj
          </button>
          <button type="button" disabled={!r.items.length || !rowId} onClick={() => onSave({ ...r, items: r.items.filter((it) => String(it.name).trim()) }, rowId)} className="inline-flex h-11 flex-[2] items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-sm font-semibold text-white disabled:opacity-50 dark:bg-blue-500 dark:text-neutral-950">
            <Check size={16} /> {saveLabel}
          </button>
        </div>
      </footer>
    </div>
  );
}

// Historia paragonów (zwijana): podgląd i edycja – poprawki kategorii uczą pamięć produktów
export function ReceiptsHistory({ rows, onAdjust, month }) {
  const [list, setList] = useState(readReceipts);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  if (!list.length) return null;
  return (
    <div className="rounded-xl border border-stone-200 dark:border-white/10">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold">
        <Receipt size={15} className="text-stone-400" /> Paragony ({list.length})
        <ChevronDown size={16} className={`ml-auto text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="divide-y divide-stone-100 border-t border-stone-100 dark:divide-white/5 dark:border-white/5" aria-label="Historia paragonów">
          {list.map((rc) => (
            <li key={rc.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEdit({ ...rc, items: rc.items.map((it, i) => ({ ...it, id: `h${i}`, source: 'memory' })) })} aria-label={`Otwórz paragon ${rc.shop} ${rc.date}`}>
                <span className="block truncate font-medium">{rc.shop || 'Paragon'}</span>
                <span className="block text-[11px] text-stone-500 dark:text-stone-400">
                  {formatDate(rc.date)} · {rc.items.length} poz.{rc.auto ? ' · zapis automatyczny' : ''}
                </span>
              </button>
              <span className="shrink-0 font-semibold tabular">{formatPLN(rc.total)}</span>
              <button
                type="button"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-stone-400 hover:text-red-600"
                onClick={() => {
                  if (!window.confirm('Usunąć paragon z historii? (wydatek w budżecie zostaje – cofniesz go w „Ostatnich wpisach”)')) return;
                  const next = list.filter((x) => x.id !== rc.id);
                  writeReceipts(next);
                  setList(next);
                }}
                aria-label={`Usuń paragon ${rc.shop} ${rc.date}`}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {edit && (
        <ReceiptReview
          receipt={edit}
          rows={rows}
          title="Edycja paragonu"
          saveLabel="Zapisz zmiany"
          onCancel={() => setEdit(null)}
          onSave={(r, rowId) => {
            learnFromReceipt(r);
            const t = receiptTotals(r);
            const old = list.find((x) => x.id === edit.id);
            const delta = Math.round((t.sum - (old?.total || 0)) * 100) / 100;
            if (delta && old?.month === month && old.rowId === rowId) onAdjust?.(rowId, delta);
            const next = list.map((x) => (x.id === edit.id ? { ...x, shop: r.shop, date: r.date, items: r.items.map(({ name, quantity, price, category }) => ({ name, quantity, price, category })), total: t.sum, rowId } : x));
            writeReceipts(next);
            setList(next);
            setEdit(null);
          }}
        />
      )}
    </div>
  );
}
