import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, ChevronDown, Image as ImageIcon, Loader2, Pencil, Plus, Receipt, Split, Trash2, X } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { applyMemory, assignBudgetRows, itemShare, cacheReceipt, cachedReceipt, compressImage, imageHash, learnBudget, learnFromReceipt, readReceipts, receiptParts, receiptRows, receiptTotals, writeReceipts } from '../../lib/receipts.js';
import { requestReceipt } from '../../lib/newsAi.js';
import { formatDate, formatPLN, todayISO } from '../../lib/format.js';
import { BetaBadge } from '../ui.jsx';

const inputCls = 'h-9 min-w-0 rounded-lg border border-stone-200 bg-white px-2 text-sm outline-none focus:border-blue-500 dark:border-white/10 dark:bg-neutral-800';
const named = (rows) => rows.filter((r) => String(r.name || '').trim());
const SOURCE_LABEL = { user: 'poprawione – zapamiętam', memory: 'z pamięci', ai: 'AI', rule: 'dopasowane' };
const toStored = (rows) => (it) => ({ name: it.name, quantity: it.quantity, price: it.price, category: it.category, rowId: it.rowId, rowName: rows.find((r) => r.id === it.rowId)?.name || it.rowName || '', ...(it.half ? { half: true } : {}) });

// Skanowanie paragonu → (weryfikacja) → wydatki w budżecie + historia. rows – kategorie budżetu miesiąca; każda
// pozycja trafia wyłącznie do jednej z nich (bez nowych podgrup). onSave(receipt, parts) – parts: [{ id, amount }].
export function ReceiptScanner({ rows, onSave, month }) {
  const { state, actions } = useApp();
  const review = state.settings.receiptReview !== false;
  const fileRef = useRef(null);
  const [busy, setBusy] = useState('');
  const [draft, setDraft] = useState(null);

  const persist = (receipt, { auto = false } = {}) => {
    learnFromReceipt(receipt);
    learnBudget(receipt, rows);
    const t = receiptTotals(receipt, rows);
    const parts = receiptParts(receipt);
    const res = onSave({ ...receipt, total: t.share, halved: t.halved }, parts);
    const saved = { id: receipt.id || `rc${Date.now().toString(36)}`, shop: receipt.shop, date: receipt.date, time: receipt.time || '', items: receipt.items.map(toStored(rows)), total: t.share, fullTotal: t.sum, ...(t.halved > 0 ? { halved: t.halved } : {}), printedTotal: t.printed, rowId: parts[0]?.id || '', month, savedAt: new Date().toISOString(), auto };
    writeReceipts([saved, ...readReceipts().filter((r) => r.id !== saved.id)]);
    const split = (res?.parts || []).map((p) => `${p.name} ${formatPLN(p.amount)}`).join(', ');
    actions.notify(`Paragon ${receipt.shop || ''} zapisany: ${formatPLN(t.share)}${t.halved > 0 ? ` (Twoja część – podział 50/50, druga osoba ${formatPLN(t.halved)})` : ''}${split ? ` → ${split}` : ''}${auto ? ' (zapis automatyczny)' : ''}`, 'success');
    return saved;
  };

  // Aparat w aplikacji (getUserMedia): przeglądarka nie przechodzi w tło, więc Android nie zamyka jej z braku pamięci
  // („Zbyt mało pamięci, by ukończyć poprzednią operację” przy zewnętrznej aplikacji aparatu). Bez dostępu – wybór pliku.
  const galleryRef = useRef(null);
  const [camera, setCamera] = useState(false);
  const canLiveCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  const startScan = () => (canLiveCamera ? setCamera(true) : fileRef.current?.click());
  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) processImage(file);
  };
  const processImage = async (file) => {
    setBusy('Przygotowanie zdjęcia…');
    try {
      const img = await compressImage(file);
      const hash = await imageHash(img.base64);
      // Krok 1: lokalna pamięć (ten sam paragon – bez kosztu AI)
      let receipt = cachedReceipt(hash);
      if (!receipt) {
        setBusy('AI odczytuje paragon…');
        receipt = (await requestReceipt(img.base64, img.mime, receiptRows(rows).map((r) => r.name.trim()))).receipt;
        if (receipt?.items?.length) cacheReceipt(hash, receipt);
      }
      if (!receipt?.items?.length) throw new Error('Nie rozpoznano pozycji – zrób wyraźniejsze zdjęcie całego paragonu');
      // Krok 2: kategorie budżetu użytkownika – pamięć (poprawki) → AI → reguły; nic spoza jego listy
      const ready = assignBudgetRows({ ...applyMemory(receipt), id: `rc${hash.slice(0, 12)}`, date: receipt.date || todayISO() }, rows);
      if (review) setDraft(ready);
      else persist(ready, { auto: true });
    } catch (err) {
      actions.notify(`Paragon: ${err.message}`, 'warn');
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} aria-label="Zdjęcie paragonu" />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={onFile} aria-label="Zdjęcie paragonu z galerii" />
      <button
        type="button"
        onClick={startScan}
        disabled={!!busy || !receiptRows(rows).length}
        title="Zeskanuj albo wgraj zdjęcie paragonu"
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-60 dark:border-white/10 dark:bg-neutral-800 dark:text-stone-200"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />} {busy || 'Skanuj paragon'}
        {!busy && (
          <span className="hidden sm:inline">
            <BetaBadge />
          </span>
        )}
      </button>
      {camera && (
        <CameraCapture
          onCapture={(blob) => {
            setCamera(false);
            processImage(blob);
          }}
          onGallery={() => {
            setCamera(false);
            galleryRef.current?.click();
          }}
          onSystemCamera={() => {
            setCamera(false);
            fileRef.current?.click();
          }}
          onClose={() => setCamera(false)}
        />
      )}
      {draft && (
        <ReceiptReview
          receipt={draft}
          rows={rows}
          onCancel={() => setDraft(null)}
          onSave={(r) => {
            persist(r);
            setDraft(null);
          }}
        />
      )}
    </>
  );
}

// Aparat w aplikacji: podgląd tylnej kamery na żywo i zdjęcie klatki (≤ 1920 px, JPEG) – bez uruchamiania osobnej
// aplikacji aparatu. Strumień zatrzymywany przy zamknięciu. Brak uprawnień / kamery → komunikat i wybór: aparat
// systemowy albo galeria (kliknięcie użytkownika – przeglądarki blokują otwieranie wyboru pliku bez gestu).
function CameraCapture({ onCapture, onGallery, onSystemCamera, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [shooting, setShooting] = useState(false);
  const [error, setError] = useState('');
  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => {
    let alive = true;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false })
      .then((stream) => {
        if (!alive) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          v.play().catch(() => {});
        }
      })
      .catch((err) => alive && setError(err?.name === 'NotAllowedError' ? 'Brak zgody na użycie aparatu w aplikacji (możesz ją włączyć w ustawieniach strony w przeglądarce).' : 'Nie udało się uruchomić aparatu w aplikacji.'));
    return () => {
      alive = false;
      stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const shoot = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    setShooting(true);
    const scale = Math.min(1, 1920 / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        canvas.width = 0;
        canvas.height = 0;
        stop();
        if (blob) onCapture(blob);
        else {
          setShooting(false);
          setError('Nie udało się zapisać zdjęcia.');
        }
      },
      'image/jpeg',
      0.9,
    );
  };
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Aparat – zdjęcie paragonu">
      <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 text-white">
        <span className="text-sm font-semibold">Zrób zdjęcie całego paragonu</span>
        <button
          type="button"
          onClick={() => {
            stop();
            onClose();
          }}
          aria-label="Zamknij aparat"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10"
        >
          <X size={18} />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <video ref={videoRef} playsInline muted autoPlay onLoadedData={() => setReady(true)} className="h-full w-full object-contain" aria-label="Podgląd aparatu" />
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-sm text-white/90">
            <p>{error}</p>
            <button type="button" onClick={onSystemCamera} className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 font-semibold text-neutral-900">
              <Camera size={16} /> Aparat telefonu
            </button>
            <p className="text-[11px] text-white/60">albo wybierz zdjęcie przyciskiem „Z galerii” poniżej</p>
          </div>
        )}
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
            <Loader2 size={20} className="mr-2 animate-spin" /> Uruchamianie aparatu…
          </div>
        )}
      </div>
      <div className="flex items-center justify-around px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => {
            stop();
            onGallery();
          }}
          className="inline-flex flex-col items-center gap-1 text-xs text-white/90"
        >
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
            <ImageIcon size={20} />
          </span>
          Z galerii
        </button>
        <button type="button" onClick={shoot} disabled={!ready || shooting} aria-label="Zrób zdjęcie" className="h-16 w-16 rounded-full border-4 border-white bg-white/90 disabled:opacity-50" />
        <span className="w-11" aria-hidden="true" />
      </div>
    </div>
  );
}

// Ekran weryfikacji (pełny ekran) stylizowany na wydruk termiczny paragonu fiskalnego: wyśrodkowany sklep, data,
// „PARAGON FISKALNY”, linie przerywane między sekcjami, pozycje z cenami, przy każdej kategoria budżetu (szybka
// poprawka z listy – wyłącznie kategorie użytkownika), podział na kategorie, SUMA PLN, data i godzina na dole.
// „Edytuj” przełącza paragon w tryb edycji (sklep, data, nazwy, ceny, dodawanie i usuwanie pozycji).
const PAPER = 'font-mono text-[13px] leading-snug text-neutral-900';
const paperInput = 'h-8 min-w-0 rounded border border-dashed border-neutral-400 bg-white/70 px-1.5 font-mono text-[13px] text-neutral-900 outline-none focus:border-neutral-800';
const Dashes = () => <div className="my-2 border-t-2 border-dashed border-neutral-400" aria-hidden="true" />;
const money = (v) => (Math.round((Number(v) || 0) * 100) / 100).toFixed(2).replace('.', ',');
// Ząbkowana krawędź oderwanego paragonu (półkoliste wycięcia papieru)
const tear = (pos) => ({
  [pos]: -7,
  height: 8,
  backgroundImage: `radial-gradient(circle at 5px ${pos === 'top' ? '0' : '8px'}, transparent 4.5px, #fbfaf6 5px)`,
  backgroundSize: '10px 8px',
  backgroundRepeat: 'repeat-x',
});

export function ReceiptReview({ receipt, rows, onCancel, onSave, title = 'Weryfikacja paragonu', saveLabel = 'Zatwierdź i zapisz' }) {
  const { state } = useApp();
  const [r, setR] = useState(() => assignBudgetRows(receipt, rows));
  // Podział 50/50 (Ustawienia, domyślnie wyłączony); przy edycji paragonu już podzielonego – zawsze widoczny
  const canSplit = state.settings.receiptSplit === true || receipt.items.some((it) => it.half);
  // Opcje podziału ukryte za małym przyciskiem „½” w nagłówku (widok minimalistyczny); otwarte, gdy paragon już ma podział
  const [splitMode, setSplitMode] = useState(() => receipt.items.some((it) => it.half));
  const allHalf = r.items.length > 0 && r.items.every((it) => it.half);
  const setAllHalf = (half) => setR((x) => ({ ...x, items: x.items.map((it) => ({ ...it, half })) }));
  const [editing, setEditing] = useState(false);
  const t = useMemo(() => receiptTotals(r, rows), [r, rows]);
  const options = receiptRows(rows);
  const extra = named(rows).filter((row) => !options.includes(row));
  const setItem = (id, patch) => setR((x) => ({ ...x, items: x.items.map((it) => (it.id === id ? { ...it, ...patch, ...('rowId' in patch ? { budgetEdited: true, budgetSource: 'user' } : {}) } : it)) }));
  const missing = r.items.some((it) => !rows.some((row) => row.id === it.rowId));
  const save = () => onSave({ ...r, items: r.items.filter((it) => String(it.name).trim()) });
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-stone-200 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] dark:bg-neutral-950" role="dialog" aria-modal="true" aria-label={title}>
      <header className="flex items-center gap-2 border-b border-stone-300 bg-white px-4 py-3 dark:border-white/10 dark:bg-neutral-900">
        <Receipt size={18} className="text-blue-600 dark:text-blue-400" />
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">
          {title}
          <BetaBadge />
        </h2>
        {canSplit && (
          <button
            type="button"
            onClick={() => setSplitMode((v) => !v)}
            aria-pressed={splitMode}
            aria-label="Podział 50/50"
            title="Podziel pozycje na pół (np. ze współlokatorem / partnerem)"
            className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition-colors ${splitMode ? 'border-violet-500 bg-violet-100 text-violet-900 dark:border-violet-400 dark:bg-violet-500/20 dark:text-violet-200' : 'border-stone-200 text-stone-600 hover:bg-stone-50 dark:border-white/10 dark:text-stone-300 dark:hover:bg-white/5'}`}
          >
            <Split size={13} /> 50/50
          </button>
        )}
        <button type="button" onClick={onCancel} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-white/5" aria-label="Zamknij bez zapisu">
          <X size={18} />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <article className={`relative mx-auto w-full max-w-sm bg-[#fbfaf6] px-4 py-5 shadow-[0_6px_24px_rgba(0,0,0,0.18)] ${PAPER}`} aria-label="Wirtualny paragon">
          <div className="absolute inset-x-0" style={tear('top')} aria-hidden="true" />
          <div className="absolute inset-x-0" style={tear('bottom')} aria-hidden="true" />
          {/* Nagłówek: sklep wyśrodkowany */}
          <div className="text-center">
            {editing ? (
              <input className={`${paperInput} w-full text-center text-base font-bold uppercase`} value={r.shop} onChange={(e) => setR({ ...r, shop: e.target.value })} aria-label="Nazwa sklepu" placeholder="SKLEP" />
            ) : (
              <div className="text-lg font-bold tracking-wider uppercase">{r.shop || 'Sklep'}</div>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            {editing ? <input className={`${paperInput} w-40`} type="date" value={r.date} onChange={(e) => setR({ ...r, date: e.target.value })} aria-label="Data paragonu" /> : <span>{r.date || '—'}</span>}
            <span>{r.time || ''}</span>
          </div>
          <div className="mt-2 text-center text-[15px] font-bold tracking-[0.2em]">PARAGON FISKALNY</div>
          <Dashes />
          {/* Pozycje: nazwa i cena, pod spodem kategoria budżetu (poprawka w locie) */}
          <ul className="space-y-2.5" aria-label="Pozycje paragonu">
            {r.items.map((it) => (
              <li key={it.id}>
                {editing ? (
                  <div className="flex items-center gap-1.5">
                    <input className={`${paperInput} flex-1 uppercase`} value={it.name} onChange={(e) => setItem(it.id, { name: e.target.value })} aria-label={`Nazwa pozycji ${it.name}`} />
                    <input className={`${paperInput} w-20 text-right`} type="number" inputMode="decimal" step="0.01" value={it.price} onChange={(e) => setItem(it.id, { price: e.target.value === '' ? '' : Number(e.target.value) })} aria-label={`Cena ${it.name}`} />
                    <button type="button" onClick={() => setR({ ...r, items: r.items.filter((x) => x.id !== it.id) })} className="inline-flex h-8 w-7 shrink-0 items-center justify-center text-neutral-500 hover:text-red-600" aria-label={`Usuń pozycję ${it.name}`}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 break-words uppercase">
                      {it.name}
                      {Number(it.quantity) > 0 && Number(it.quantity) !== 1 && <span className="text-neutral-500"> {String(it.quantity).replace('.', ',')}×</span>}
                    </span>
                    {it.half ? (
                      <span className="shrink-0 text-right tabular">
                        <span className="text-neutral-400 line-through">{money(it.price)}</span> <span className="font-bold">{money(itemShare(it))}</span>
                      </span>
                    ) : (
                      <span className="shrink-0 tabular">{money(it.price)}</span>
                    )}
                  </div>
                )}
                <div className="mt-1 flex items-center gap-1.5">
                  <span aria-hidden="true" className="text-neutral-400">↳</span>
                  <select className={`h-7 min-w-0 flex-1 rounded border px-1 font-sans text-[11px] outline-none ${it.budgetEdited ? 'border-blue-400 bg-blue-50 text-blue-900' : 'border-neutral-300 bg-white/80 text-neutral-700'}`} value={it.rowId || ''} onChange={(e) => setItem(it.id, { rowId: e.target.value })} aria-label={`Kategoria ${it.name}`}>
                    {!it.rowId && <option value="">– wybierz kategorię budżetu –</option>}
                    {options.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                    {extra.length > 0 && (
                      <optgroup label="Pozostałe kategorie">
                        {extra.map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <span className="shrink-0 font-sans text-[10px] text-neutral-500">{SOURCE_LABEL[it.budgetSource] || 'z pamięci'}</span>
                </div>
                {canSplit && splitMode && (
                  <button
                    type="button"
                    onClick={() => setItem(it.id, { half: !it.half })}
                    aria-pressed={!!it.half}
                    aria-label={`Podziel na pół ${it.name}`}
                    className={`mt-1 ml-4 inline-flex h-7 items-center gap-1 rounded-full border px-2.5 font-sans text-[11px] font-semibold ${it.half ? 'border-violet-500 bg-violet-100 text-violet-900' : 'border-neutral-300 bg-white/80 text-neutral-600 hover:bg-white'}`}
                  >
                    <Split size={12} /> {it.half ? `Podzielone 50/50 – Twoja część ${money(itemShare(it))}` : 'Podziel na pół (50/50)'}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {editing && (
            <button type="button" onClick={() => setR({ ...r, items: [...r.items, { id: `ri${Date.now().toString(36)}`, name: '', price: 0, quantity: 1, category: 'Dom i inne', source: 'user', rowId: r.items[r.items.length - 1]?.rowId || options[0]?.id || '', budgetSource: 'user', budgetEdited: true }] })} className="mt-2 inline-flex h-8 items-center gap-1 font-sans text-xs font-semibold text-blue-700 hover:underline">
              <Plus size={14} /> Dodaj pozycję
            </button>
          )}
          {canSplit && splitMode && r.items.length > 1 && (
            <button type="button" onClick={() => setAllHalf(!allHalf)} aria-pressed={allHalf} className={`mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed font-sans text-xs font-semibold ${allHalf ? 'border-violet-500 bg-violet-100 text-violet-900' : 'border-neutral-400 text-neutral-700 hover:bg-white'}`}>
              <Split size={14} /> {allHalf ? 'Cofnij podział całego paragonu' : 'Podziel cały paragon na pół (50/50)'}
            </button>
          )}
          <Dashes />
          {/* Podział na kategorie budżetu (jak „sprzedaż opodatkowana” na paragonie) */}
          <div aria-label="Sumy częściowe">
            <div className="text-[11px] tracking-wider text-neutral-500 uppercase">Podział na kategorie budżetu{t.halved > 0 ? ' (Twoja część)' : ''}</div>
            <ul className="mt-1 space-y-0.5">
              {Object.entries(t.byCategory)
                .sort((a, b) => b[1] - a[1])
                .map(([c, v]) => (
                  <li key={c} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate uppercase">{c}</span>
                    <span className="shrink-0 tabular">{money(v)}</span>
                  </li>
                ))}
            </ul>
          </div>
          <div className="mt-2 flex items-end justify-between gap-2 text-xl font-bold">
            <span>SUMA PLN</span>
            <span className="tabular" aria-label="Suma całkowita">
              {money(t.sum)}
            </span>
          </div>
          {t.halved > 0 && (
            <div className="mt-1 rounded border border-dashed border-violet-400 bg-violet-50 px-2 py-1.5" aria-label="Podział 50/50">
              <div className="flex justify-between gap-2 font-bold">
                <span>TWOJA CZĘŚĆ</span>
                <span className="tabular" aria-label="Twoja część">
                  {money(t.share)}
                </span>
              </div>
              <div className="flex justify-between gap-2 text-[12px] text-neutral-600">
                <span>Druga osoba (50/50)</span>
                <span className="tabular">{money(t.halved)}</span>
              </div>
              <div className="mt-0.5 font-sans text-[10px] text-neutral-500">Do budżetu i statystyk trafia Twoja część.</div>
            </div>
          )}
          {t.printed > 0 && Math.abs(t.diff) >= 0.01 && <p className="mt-1 font-sans text-[11px] text-amber-700">Na paragonie: {formatPLN(t.printed)} (różnica {formatPLN(t.diff)}) – sprawdź pozycje i ceny.</p>}
          <div className="my-2 flex gap-1" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} className="h-0.5 flex-1 bg-neutral-500" />
            ))}
          </div>
          <div className="flex justify-between gap-2 text-[12px]">
            <span>{r.date ? formatDate(r.date) : '—'}</span>
            <span>{r.time || ''}</span>
          </div>
          <div className="mt-1 text-[12px]">{r.items.length} poz.</div>
          <div className="mt-3 text-center text-[12px] tracking-wide">DZIĘKUJEMY – ZAPRASZAMY PONOWNIE</div>
        </article>
        <p className="mx-auto mt-5 max-w-sm text-center text-[11px] text-stone-600 dark:text-stone-400">Pozycje trafiają wyłącznie do Twoich kategorii z Budżetu. Zmiana kategorii przy pozycji jest zapamiętywana i użyta przy kolejnych paragonach.</p>
      </div>
      <footer className="border-t border-stone-300 bg-white px-4 py-3 dark:border-white/10 dark:bg-neutral-900">
        <div className="mx-auto flex max-w-sm gap-2">
          <button type="button" onClick={() => setEditing((e) => !e)} aria-pressed={editing} className={`inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold ${editing ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-300' : 'border-stone-200 text-stone-700 dark:border-white/10 dark:text-stone-200'}`}>
            {editing ? <Check size={16} /> : <Pencil size={16} />} {editing ? 'Gotowe' : 'Edytuj'}
          </button>
          <button type="button" disabled={!r.items.length || missing} onClick={save} className="inline-flex h-11 flex-[2] items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-sm font-semibold text-white disabled:opacity-50 dark:bg-blue-500 dark:text-neutral-950">
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
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEdit({ ...rc, items: rc.items.map((it, i) => ({ ...it, id: `h${i}`, source: 'memory', rowId: it.rowId || rc.rowId || '', budgetSource: 'memory' })) })} aria-label={`Otwórz paragon ${rc.shop} ${rc.date}`}>
                <span className="block truncate font-medium">{rc.shop || 'Paragon'}</span>
                <span className="block text-[11px] text-stone-500 dark:text-stone-400">
                  {formatDate(rc.date)} · {rc.items.length} poz.{rc.halved > 0 ? ` · podział 50/50 (paragon ${formatPLN(rc.fullTotal)})` : ''}{rc.auto ? ' · zapis automatyczny' : ''}
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
          onSave={(r) => {
            learnFromReceipt(r);
            learnBudget(r, rows);
            const t = receiptTotals(r, rows);
            const old = list.find((x) => x.id === edit.id);
            // Korekta kwot wydanych w kategoriach tego miesiąca: różnica podziału przed i po edycji
            if (old?.month === month) {
              const before = Object.fromEntries(receiptParts({ items: old.items.map((it) => ({ ...it, rowId: it.rowId || old.rowId })) }).map((p) => [p.id, p.amount]));
              const after = Object.fromEntries(receiptParts(r).map((p) => [p.id, p.amount]));
              for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
                const delta = Math.round(((after[id] || 0) - (before[id] || 0)) * 100) / 100;
                if (delta && rows.some((row) => row.id === id)) onAdjust?.(id, delta);
              }
            }
            const next = list.map((x) => (x.id === edit.id ? { ...x, shop: r.shop, date: r.date, items: r.items.map(toStored(rows)), total: t.share, fullTotal: t.sum, halved: t.halved, rowId: receiptParts(r)[0]?.id || x.rowId } : x));
            writeReceipts(next);
            setList(next);
            setEdit(null);
          }}
        />
      )}
    </div>
  );
}
