import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Copy, Eraser, Plus, ShoppingBag, X } from 'lucide-react';
import { DAILY_KEY, budgetTotals, dailyAllowance, defaultFoodRow, demoRows, monthKey, newRowId, readBudget, rowLeft, shiftMonth, writeBudget } from '../lib/budget.js';

const MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
const monthName = (key) => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
// Format jak w arkuszu: zawsze dwa miejsca po przecinku i spacja tysięcy („2 300,00 zł”)
const NF = (() => {
  try {
    return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
  } catch {
    return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
})();
const zl = (v) => `${NF.format(Number(v) || 0).replace(/\u00a0|\u202f/g, ' ')} zł`;
// Komórka do edycji w stylu arkusza: bez ramki, ramka dopiero przy edycji
const cellInput =
  'h-8 w-full min-w-0 rounded border border-transparent bg-transparent px-1.5 outline-none focus:border-[#1f3864] focus:bg-white focus:ring-1 focus:ring-[#1f3864]/30 dark:focus:border-blue-400 dark:focus:bg-neutral-800';
const leftTone = (v) => (v < -0.004 ? 'text-red-600 dark:text-red-400' : '');

// Budżet miesięczny (Demo) – minimalistyczna tabela wzorowana na arkuszu: Kategoria, Planowany Budżet,
// Kwota Wydana, Pozostało (plan − wydane) i wiersz RAZEM. Zmiana miesiąca, dodawanie i usuwanie kategorii.
export default function BudgetView() {
  const [data, setData] = useState(readBudget);
  const [month, setMonth] = useState(() => monthKey());
  const saved = data[month];
  // Miesiąc bez zapisanego budżetu: przykładowe kategorie (zapisywane przy pierwszej edycji)
  const template = useMemo(() => demoRows(), [month]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = saved || template;
  const isTemplate = !saved;
  const prevKey = useMemo(() => {
    const keys = Object.keys(data).filter((k) => k < month && data[k]?.length).sort();
    return keys.at(-1) || null;
  }, [data, month]);
  const totals = useMemo(() => budgetTotals(rows), [rows]);

  useEffect(() => {
    writeBudget(data);
  }, [data]);

  const setRows = (next) => setData((d) => ({ ...d, [month]: next }));
  const update = (id, patch) => setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id) => setRows(rows.filter((r) => r.id !== id));
  const [fresh, setFresh] = useState(null); // nowy wiersz – od razu edycja nazwy
  const add = () => {
    const id = newRowId();
    setFresh(id);
    setRows([...rows, { id, name: '', planned: '', spent: '', type: 'Inne' }]);
  };
  const copyPrev = () => setRows((data[prevKey] || []).map((r) => ({ ...r, id: newRowId(), spent: '' })));
  const clear = () => setRows([]);
  // Szybki zakup: kwota dopisywana do „Kwoty Wydanej” wybranej kategorii
  const addPurchase = (id, amount) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return null;
    const spent = Math.round((toNum(row.spent) + amount) * 100) / 100;
    setRows(rows.map((r) => (r.id === id ? { ...r, spent } : r)));
    return { name: row.name, left: toNum(row.planned) - spent };
  };

  const navBtn = 'inline-flex h-8 w-8 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-white/5';
  const linkBtn = 'inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-white/5';

  return (
    <section className="min-w-0 rounded-xl border border-stone-200 bg-white p-3 shadow-sm sm:p-5 dark:border-white/10 dark:bg-neutral-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-[#1f3864] sm:text-xl dark:text-blue-300">
          Budżet na: {monthName(month)} <span className="ml-1 align-middle text-[10px] font-semibold tracking-wide text-amber-600 uppercase dark:text-amber-400">demo</span>
        </h2>
        <div className="flex items-center gap-1">
          <button type="button" className={navBtn} onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Poprzedni miesiąc" title="Poprzedni miesiąc">
            <ChevronLeft size={18} />
          </button>
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            aria-label="Miesiąc budżetu"
            className="h-8 rounded-md border border-stone-200 bg-white px-2 text-xs outline-none focus:border-[#1f3864] dark:border-white/10 dark:bg-neutral-800"
          />
          <button type="button" className={navBtn} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Następny miesiąc" title="Następny miesiąc">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-xs sm:text-sm">
          <colgroup>
            <col />
            <col className="w-[23%] sm:w-[19%]" />
            <col className="w-[21%] sm:w-[17%]" />
            <col className="w-[23%] sm:w-[17%]" />
            <col className="w-5 sm:w-8" />
          </colgroup>
          <thead>
            <tr className="bg-[#1f3864] text-white dark:bg-[#22355e]">
              <th className="px-2 py-1.5 text-center font-semibold">Kategoria</th>
              <th className="px-2 py-1.5 text-center font-semibold">Planowany Budżet</th>
              <th className="px-2 py-1.5 text-center font-semibold">Kwota Wydana</th>
              <th className="px-2 py-1.5 text-center font-semibold">Pozostało</th>
              <th aria-label="Usuń" />
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.map((r, i) => {
              const left = rowLeft(r);
              return (
                <tr key={r.id} className={`group border-b border-stone-200 dark:border-white/10 ${i % 2 ? 'bg-stone-50 dark:bg-white/[0.03]' : ''}`}>
                  <td className="px-0.5 py-0.5">
                    <EditableCell startEditing={r.id === fresh} value={r.name} display={r.name} placeholder="Nazwa kategorii" onChange={(v) => update(r.id, { name: v })} label={`Kategoria: ${r.name || 'nowa'}`} />
                  </td>
                  <td className="border-l border-stone-200 px-0.5 py-0.5 dark:border-white/10">
                    <EditableCell numeric value={r.planned} display={zl(toNum(r.planned))} onChange={(v) => update(r.id, { planned: v })} label={`Planowany budżet: ${r.name}`} />
                  </td>
                  <td className="border-l border-stone-200 px-0.5 py-0.5 dark:border-white/10">
                    <EditableCell numeric value={r.spent} display={zl(toNum(r.spent))} onChange={(v) => update(r.id, { spent: v })} label={`Kwota wydana: ${r.name}`} />
                  </td>
                  <td className={`border-l border-stone-200 px-2 py-0.5 text-right whitespace-nowrap dark:border-white/10 ${leftTone(left)}`}>{zl(left)}</td>
                  <td className="py-0.5 text-center">
                    <button
                      type="button"
                      onClick={() => remove(r.id)}
                      aria-label={`Usuń kategorię ${r.name}`}
                      title="Usuń"
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-stone-300 hover:bg-red-50 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100 dark:text-stone-600 dark:hover:bg-red-500/10"
                    >
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-4 text-center text-stone-500">
                  Brak kategorii.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="tabular">
            <tr className="border-t-2 border-[#1f3864] bg-[#dce6f2] font-bold text-[#1f3864] dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-200">
              <td className="px-2 py-1.5">RAZEM</td>
              <td className="px-2 py-1.5 text-right whitespace-nowrap">{zl(totals.planned)}</td>
              <td className="px-2 py-1.5 text-right whitespace-nowrap">{zl(totals.spent)}</td>
              <td className={`px-2 py-1.5 text-right whitespace-nowrap ${totals.left < -0.004 ? 'text-red-600 dark:text-red-400' : ''}`}>{zl(totals.left)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <PurchasePanel rows={rows} onAdd={addPurchase} />
      <DailyTile rows={rows} month={month} />

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <button type="button" className={linkBtn} onClick={add}>
          <Plus size={14} /> Dodaj kategorię
        </button>
        {prevKey && (
          <button type="button" className={linkBtn} onClick={copyPrev} title="Kategorie i plan z poprzedniego miesiąca (wydane wyzerowane)">
            <Copy size={14} /> Kopiuj plan ({monthName(prevKey)})
          </button>
        )}
        {!isTemplate && rows.length > 0 && (
          <button type="button" className={linkBtn} onClick={clear}>
            <Eraser size={14} /> Wyczyść
          </button>
        )}
        <span className="ml-auto text-[11px] text-stone-400">
          {isTemplate ? 'Przykładowe kategorie – pierwsza zmiana zapisze ten miesiąc' : 'Moduł demo · zapis w tej przeglądarce i kopii zapasowej'}
        </span>
      </div>
    </section>
  );
}

const toNum = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

// Komórka jak w arkuszu: sformatowany tekst (kwota „55,00 zł”, nazwa zawijana), po kliknięciu pole edycji;
// Enter / Esc / kliknięcie obok kończy edycję
function EditableCell({ value, display, onChange, label, numeric = false, placeholder = '', startEditing = false }) {
  const [editing, setEditing] = useState(startEditing);
  if (editing) {
    return (
      <input
        autoFocus
        className={`${cellInput} ${numeric ? 'text-right' : ''}`}
        value={numeric ? String(value ?? '').replace('.', ',') : value}
        inputMode={numeric ? 'decimal' : undefined}
        placeholder={numeric ? '0,00' : placeholder}
        onChange={(e) => onChange(numeric ? e.target.value.replace(/[^\d,.\-]/g, '') : e.target.value)}
        onFocus={(e) => numeric && e.target.select()}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && e.currentTarget.blur()}
        aria-label={label}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={`${label} – edytuj`}
      className={`block min-h-8 w-full rounded px-1.5 py-1 leading-snug break-words [hyphens:auto] hover:bg-[#1f3864]/5 dark:hover:bg-white/5 ${numeric ? 'text-right whitespace-nowrap' : 'text-left'}`}
    >
      {display || <span className="text-stone-400">{placeholder}</span>}
    </button>
  );
}

// Panel „Dodaj zakup” pod tabelą: kategoria z tabeli + kwota → dopisanie do Kwoty Wydanej (Pozostało i RAZEM liczą się same)
function PurchasePanel({ rows, onAdd }) {
  const options = rows.filter((r) => String(r.name || '').trim());
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [msg, setMsg] = useState(null);
  const selected = options.some((r) => r.id === categoryId) ? categoryId : options[0]?.id || '';
  const value = toNum(amount);
  const valid = !!selected && value > 0;

  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);

  const submit = (e) => {
    e.preventDefault();
    if (!valid) {
      setMsg({ error: true, text: !selected ? 'Najpierw dodaj kategorię w tabeli.' : 'Wpisz kwotę zakupu większą od zera.' });
      return;
    }
    const res = onAdd(selected, value);
    if (!res) return;
    setAmount('');
    setMsg({ error: false, text: `Dodano ${zl(value)} do „${res.name}” · pozostało ${zl(res.left)}` });
  };

  return (
    <form onSubmit={submit} className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-white/10 dark:bg-white/[0.03]" aria-label="Dodaj zakup">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[#1f3864] uppercase dark:text-blue-300">
        <ShoppingBag size={14} /> Dodaj zakup
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
        <select
          value={selected}
          onChange={(e) => setCategoryId(e.target.value)}
          disabled={options.length === 0}
          aria-label="Kategoria zakupu"
          className="h-10 min-w-0 rounded-md border border-stone-200 bg-white px-2 text-sm outline-none focus:border-[#1f3864] focus:ring-1 focus:ring-[#1f3864]/30 disabled:opacity-60 dark:border-white/10 dark:bg-neutral-800"
        >
          {options.length === 0 && <option value="">Brak kategorii</option>}
          {options.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <label className="flex h-10 items-center rounded-md border border-stone-200 bg-white pr-2 focus-within:border-[#1f3864] focus-within:ring-1 focus-within:ring-[#1f3864]/30 dark:border-white/10 dark:bg-neutral-800">
          <span className="sr-only">Kwota zakupu</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d,.]/g, ''))}
            inputMode="decimal"
            placeholder="0,00"
            aria-label="Kwota zakupu"
            className="h-full min-w-0 flex-1 bg-transparent px-2 text-right text-sm tabular outline-none"
          />
          <span className="text-sm text-stone-500">zł</span>
        </label>
        <button
          type="submit"
          disabled={options.length === 0}
          className="col-span-2 inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-[#1f3864] px-4 text-sm font-semibold text-white hover:bg-[#2a4a80] disabled:opacity-50 sm:col-span-1 dark:bg-blue-500 dark:text-neutral-950 dark:hover:bg-blue-400"
        >
          <Plus size={16} /> Dodaj do wydanych
        </button>
      </div>
      {msg && (
        <p role="status" className={`mt-2 flex items-center gap-1.5 text-xs ${msg.error ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
          {!msg.error && <Check size={14} />} {msg.text}
        </p>
      )}
    </form>
  );
}

const plDays = (n) => (n === 1 ? 'dzień' : 'dni');

// Kafelek dzienny: ile dni zostało do końca miesiąca i ile średnio można wydawać dziennie na jedzenie
function DailyTile({ rows, month }) {
  const named = rows.filter((r) => String(r.name || '').trim());
  const [pick, setPickState] = useState(() => {
    try {
      return localStorage.getItem(DAILY_KEY) || '';
    } catch {
      return '';
    }
  });
  const setPick = (name) => {
    setPickState(name);
    try {
      localStorage.setItem(DAILY_KEY, name);
    } catch {
      // brak localStorage – wybór nie zostanie zapamiętany
    }
  };
  const row = named.find((r) => r.name === pick) || defaultFoodRow(rows);
  if (!row) return null;
  const d = dailyAllowance(row, month);
  const over = d.left < -0.004;
  return (
    <div className="mt-3 rounded-lg border border-stone-200 p-3 dark:border-white/10" role="region" aria-label="Statystyka dzienna">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[#1f3864] uppercase dark:text-blue-300">
          <CalendarDays size={14} /> Na co dzień
        </span>
        <select
          value={row.name}
          onChange={(e) => setPick(e.target.value)}
          aria-label="Kategoria do statystyki dziennej"
          className="h-8 max-w-[60%] rounded-md border border-stone-200 bg-white px-2 text-xs outline-none focus:border-[#1f3864] dark:border-white/10 dark:bg-neutral-800"
        >
          {named.map((r) => (
            <option key={r.id} value={r.name}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      {d.past ? (
        <p className="text-sm">
          Miesiąc zakończony – w kategorii <strong>{row.name}</strong> {over ? 'przekroczono plan o ' : 'zostało '}
          <strong className={over ? 'text-red-600 dark:text-red-400' : ''}>{zl(Math.abs(d.left))}</strong>.
        </p>
      ) : over ? (
        <p className="text-sm">
          Do końca miesiąca {d.daysLeft === 1 ? 'pozostał' : 'pozostało'} <strong>{d.daysLeft} {plDays(d.daysLeft)}</strong>. Budżet na „{row.name}” jest już przekroczony o{' '}
          <strong className="text-red-600 dark:text-red-400">{zl(-d.left)}</strong>.
        </p>
      ) : (
        <p className="text-sm leading-relaxed">
          Do końca miesiąca {d.daysLeft === 1 ? 'pozostał' : 'pozostało'} <strong>{d.daysLeft} {plDays(d.daysLeft)}</strong>. Na „{row.name}” możesz wydawać średnio{' '}
          <strong className="text-lg text-[#1f3864] tabular dark:text-blue-300">{zl(d.perDay)}</strong> dziennie.
        </p>
      )}
      <p className="mt-1 text-[11px] text-stone-500 tabular dark:text-stone-400">
        Pozostało {zl(d.left)} z {zl(d.planned)} · plan na cały miesiąc to średnio {zl(d.planPerDay)} dziennie ({d.daysInMonth} dni)
      </p>
    </div>
  );
}
