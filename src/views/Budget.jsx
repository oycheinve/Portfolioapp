import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Eraser, History, Pencil, Plane, Plus, RotateCcw, ShoppingBag, Split, Trash2, X } from 'lucide-react';
import { DAILY_KEY, LOG_LIMIT, budgetTotals, isTransferRow, readBudgetLog, writeBudgetLog, dailyAllowance, defaultFoodRow, demoRows, monthKey, newRowId, readBudget, rowLeft, shiftMonth, writeBudget } from '../lib/budget.js';
import TripsBudget from '../components/budget/TripsBudget.jsx';
import { ReceiptScanner, ReceiptsHistory } from '../components/budget/Receipts.jsx';
import MonthSummary from '../components/budget/MonthSummary.jsx';
import { useApp } from '../state/AppContext.jsx';
import { aiOn } from '../lib/aiFeatures.js';

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
// Pole w trybie edycji: widoczna delikatna ramka, wyraźna przy fokusie
const editInput =
  'h-8 w-full min-w-0 rounded border border-stone-200 bg-white px-1.5 outline-none focus:border-[#1f3864] focus:ring-1 focus:ring-[#1f3864]/30 dark:border-white/10 dark:bg-neutral-800 dark:focus:border-blue-400';
const leftTone = (v) => (v < -0.004 ? 'text-red-600 dark:text-red-400' : '');

// Budżet miesięczny – minimalistyczna tabela wzorowana na arkuszu: Kategoria, Planowany Budżet,
// Kwota Wydana, Pozostało (plan − wydane) i wiersz RAZEM. Podgląd (szybkie zakupy, limit dzienny) i tryb „Edytuj”
// (nazwy, kwoty, dodawanie i usuwanie kategorii).
// Rodzaj budżetu – trwały wybór (domyślnie miesięczny): zapisany per użytkownik na urządzeniu i w chmurze (ui_prefs),
// aktywny do czasu ponownej zmiany. Zgodność: wcześniejszy klucz `fintrack-budget-mode` (tylko urządzenie).
const MODE_KEY = 'wealth-app-budget-mode';
const OLD_MODE_KEY = 'fintrack-budget-mode';
const readMode = () => {
  try {
    return (localStorage.getItem(MODE_KEY) ?? localStorage.getItem(OLD_MODE_KEY)) === 'trips' ? 'trips' : 'monthly';
  } catch {
    return 'monthly';
  }
};

// Budżet: rozwijana lista „Budżet Miesięczny / Budżet Wakacyjny” (BETA – wiele wyjazdów)
export default function BudgetView() {
  const [mode, setModeState] = useState(readMode);
  const setMode = (m) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
      localStorage.removeItem(OLD_MODE_KEY);
      window.dispatchEvent(new CustomEvent('wealth-app-prefs-changed', { detail: { key: MODE_KEY } }));
    } catch {
      // brak localStorage
    }
  };
  const Icon = mode === 'trips' ? Plane : CalendarDays;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label title="Wybór zapamiętany – obowiązuje do ponownej zmiany" className="relative inline-flex h-9 items-center rounded-full border border-blue-600 bg-blue-600 pr-2 pl-3.5 text-white shadow-sm focus-within:ring-2 focus-within:ring-blue-500/40 dark:border-blue-500 dark:bg-blue-500 dark:text-neutral-950">
          <Icon size={16} className="pointer-events-none shrink-0" />
          <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Rodzaj budżetu" className="h-full cursor-pointer appearance-none bg-transparent pr-6 pl-2 text-sm font-semibold outline-none [&>option]:text-neutral-900">
            <option value="monthly">Budżet Miesięczny</option>
            <option value="trips">Budżet Wakacyjny (BETA)</option>
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute right-3 shrink-0" />
        </label>
      </div>
      {mode === 'trips' ? (
        <section className="min-w-0 rounded-xl border border-stone-200 bg-white p-3 shadow-sm sm:p-5 dark:border-white/10 dark:bg-neutral-900">
          <TripsBudget />
        </section>
      ) : (
        <MonthlyBudget />
      )}
    </div>
  );
}

function MonthlyBudget() {
  const { state: app, actions: appActions } = useApp(); // Ustawienia → Funkcje AI; konta oszczędnościowe (transfery)
  const savingsAccounts = useMemo(() => app.accounts.filter((a) => a.type === 'SAVINGS'), [app.accounts]);
  const accountName = (id) => app.accounts.find((a) => a.id === id)?.name || 'konto oszczędnościowe';
  const [data, setData] = useState(readBudget);
  const [month, setMonth] = useState(() => monthKey());
  const saved = data[month];
  // Miesiąc bez zapisanego budżetu: przykładowe kategorie (zapisywane przy pierwszej zmianie)
  const template = useMemo(() => demoRows(), [month]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = saved || template;
  const isTemplate = !saved;
  const prevKey = useMemo(() => {
    const keys = Object.keys(data).filter((k) => k < month && data[k]?.length).sort();
    return keys.at(-1) || null;
  }, [data, month]);
  // Tryb edycji: zmiany na kopii wierszy (draft) – „Zapisz” zapisuje miesiąc, „Anuluj” je odrzuca
  const [draft, setDraft] = useState(null);
  const editing = draft !== null;
  const shown = editing ? draft : rows;
  const totals = useMemo(() => budgetTotals(shown), [shown]);

  useEffect(() => {
    writeBudget(data);
  }, [data]);

  // Dziennik zakupów miesiąca (najnowsze na początku)
  const [log, setLog] = useState(readBudgetLog);
  const entries = log[month] || [];
  useEffect(() => {
    writeBudgetLog(log);
  }, [log]);
  const setEntries = (fn) => setLog((l) => ({ ...l, [month]: fn(l[month] || []) }));
  // Skopiowany plan / wyzerowane wydane – po zapisie dziennik miesiąca nie odpowiada już tabeli
  const [resetLog, setResetLog] = useState(false);

  const setRows = (next) => setData((d) => ({ ...d, [month]: next }));
  const update = (id, patch) => setDraft((d) => d.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id) => setDraft((d) => d.filter((r) => r.id !== id));
  const [fresh, setFresh] = useState(null); // nowy wiersz – kursor od razu w nazwie
  const add = () => {
    const id = newRowId();
    setFresh(id);
    setDraft((d) => [...d, { id, name: '', planned: '', spent: '', type: 'Inne' }]);
  };
  // Plan z poprzedniego miesiąca: kategorie i kwoty planowane, wydane = 0
  const prevPlan = () => (data[prevKey] || []).map((r) => ({ ...r, id: newRowId(), spent: 0 }));
  const copyPrev = () => {
    setDraft(prevPlan());
    setResetLog(true);
  };
  const zeroSpent = () => {
    setDraft((d) => d.map((r) => ({ ...r, spent: 0 })));
    setResetLog(true);
  };
  // Nowy (pusty) miesiąc – skopiowanie planu bez wchodzenia w edycję
  const applyPrevPlan = () => {
    setRows(prevPlan());
    setEntries(() => []);
  };
  const clear = () => setDraft([]);
  const startEdit = () => {
    setFresh(null);
    setResetLog(false);
    setDraft(rows.map((r) => ({ ...r })));
  };
  const cancelEdit = () => {
    setResetLog(false);
    setDraft(null);
  };
  // Zapis: puste wiersze (bez nazwy i kwot) pomijane; szablon zapisywany tylko przy faktycznej zmianie
  const save = () => {
    const next = draft.filter((r) => String(r.name || '').trim() || toNum(r.planned) || toNum(r.spent));
    if (!isTemplate || JSON.stringify(next) !== JSON.stringify(rows)) setRows(next);
    if (resetLog) setEntries(() => []);
    setResetLog(false);
    setDraft(null);
  };
  // Szybki zakup: kwota dopisywana do „Kwoty Wydanej” wybranej kategorii
  // parts: [{ id, amount }] – jeden zakup lub paragon podzielony na kilka kategorii; każda część osobnym wpisem
  // w dzienniku (osobno do cofnięcia). Zgodność: addPurchase(id, kwota, notatka).
  const addPurchase = (idOrParts, amountArg, note = '') => {
    const parts = (Array.isArray(idOrParts) ? idOrParts : [{ id: idOrParts, amount: amountArg }])
      .map((p) => ({ ...p, amount: Math.round(Number(p.amount) * 100) / 100 }))
      .filter((p) => p.amount > 0 && rows.some((r) => r.id === p.id));
    if (!parts.length) return null;
    const add = {};
    for (const p of parts) add[p.id] = (add[p.id] || 0) + p.amount;
    const next = rows.map((r) => (add[r.id] ? { ...r, spent: Math.round((toNum(r.spent) + add[r.id]) * 100) / 100 } : r));
    setRows(next);
    const at = new Date().toISOString();
    const text = String(note || '').trim().slice(0, 80);
    // Kategoria powiązana z kontem oszczędnościowym: wypłata (domyślnie) albo wpłata na tym koncie – data w obrębie
    // miesiąca budżetu (nie w przyszłości); id przepływu w dzienniku – cofnięcie wpisu usuwa też operację na koncie
    const today = new Date().toISOString().slice(0, 10);
    const [yy, mm] = month.split('-').map(Number);
    const monthEnd = `${month}-${String(new Date(yy, mm, 0).getDate()).padStart(2, '0')}`;
    const flowDate = today.slice(0, 7) === month ? today : today < `${month}-01` ? today : monthEnd;
    const cashflowFor = (p) => {
      const row = rows.find((r) => r.id === p.id);
      if (!isTransferRow(row) || !app.accounts.some((a) => a.id === row.savings.accountId)) return null;
      const flow = appActions.upsert('cashflows', { date: flowDate, accountId: row.savings.accountId, type: row.savings.dir === 'in' ? 'DEPOSIT' : 'WITHDRAWAL', amount: p.amount, note: `Budżet: ${row.name}${text ? ` – ${text}` : ''}`.slice(0, 120), source: 'budget' });
      return flow.id;
    };
    const fresh = parts.map((p) => {
      const cashflowId = cashflowFor(p);
      return { id: newRowId(), rowId: p.id, name: rows.find((r) => r.id === p.id).name, amount: p.amount, note: text, at, ...(cashflowId ? { cashflowId } : {}) };
    });
    setEntries((list) => [...fresh.reverse(), ...list].slice(0, LOG_LIMIT));
    const main = next.find((r) => r.id === parts[0].id);
    const moved = fresh.filter((e) => e.cashflowId).length;
    return { name: main.name, left: toNum(main.planned) - toNum(main.spent), ...(moved ? { transfer: true } : {}), parts: parts.map((p) => ({ name: next.find((r) => r.id === p.id).name, amount: p.amount })) };
  };
  // Korekta kwoty wydanej kategorii (edycja zapisanego paragonu z tego miesiąca)
  const [receiptsVer, setReceiptsVer] = useState(0);
  const adjustSpent = (rowId, delta) => setData((d) => ({ ...d, [month]: (d[month] || []).map((r) => (r.id === rowId ? { ...r, spent: Math.max(0, Math.round((toNum(r.spent) + delta) * 100) / 100) } : r)) }));
  // Cofnięcie wpisu: kwota odjęta z „Kwoty Wydanej” kategorii (nie poniżej zera), wpis usunięty z dziennika
  const undoPurchase = (entryId) => {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    if (rows.some((r) => r.id === entry.rowId)) {
      setRows(rows.map((r) => (r.id === entry.rowId ? { ...r, spent: Math.max(0, Math.round((toNum(r.spent) - entry.amount) * 100) / 100) } : r)));
    }
    if (entry.cashflowId) appActions.remove('cashflows', entry.cashflowId); // operacja na koncie oszczędnościowym
    setEntries((list) => list.filter((e) => e.id !== entryId));
  };

  const navBtn = 'inline-flex h-8 w-8 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 disabled:opacity-40 disabled:hover:bg-transparent dark:text-stone-400 dark:hover:bg-white/5';
  const linkBtn = 'inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-white/5';

  return (
    <section className="min-w-0 rounded-xl border border-stone-200 bg-white p-3 shadow-sm sm:p-5 dark:border-white/10 dark:bg-neutral-900">
      {/* Nagłówek: miesiąc ze strzałkami w jednym wierszu (pole miesiąca pod nazwą – dotknięcie otwiera wybór) */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">Budżet na:{editing && <span className="ml-1.5 text-amber-700 normal-case dark:text-amber-400">tryb edycji</span>}</div>
          <div className="-ml-1.5 flex items-center">
            <button type="button" className={navBtn} disabled={editing} onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Poprzedni miesiąc" title="Poprzedni miesiąc">
              <ChevronLeft size={18} />
            </button>
            <label className="relative min-w-0 cursor-pointer">
              <h2 className="text-base font-bold whitespace-nowrap text-[#1f3864] sm:text-xl dark:text-blue-300">{monthName(month)}</h2>
              <input
                type="month"
                value={month}
                disabled={editing}
                onChange={(e) => e.target.value && setMonth(e.target.value)}
                aria-label="Miesiąc budżetu"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
              />
            </label>
            <button type="button" className={navBtn} disabled={editing} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Następny miesiąc" title="Następny miesiąc">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-center gap-1.5">
            {editing && (
              <button type="button" onClick={cancelEdit} className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-white/5">
                <X size={14} /> Anuluj
              </button>
            )}
            <button
              type="button"
              onClick={editing ? save : startEdit}
              aria-pressed={editing}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold shadow-sm transition-colors ${
                editing ? 'bg-[#1f3864] text-white hover:bg-[#2a4a80] dark:bg-blue-500 dark:hover:bg-blue-400' : 'border border-stone-200 bg-white text-[#1f3864] hover:bg-stone-50 dark:border-white/10 dark:bg-neutral-800 dark:text-blue-200 dark:hover:bg-neutral-700'
              }`}
            >
              {editing ? <Check size={14} /> : <Pencil size={14} />} {editing ? 'Zapisz' : 'Edytuj'}
            </button>
          </div>
          {/* Paragony (BETA): skan / wgranie zdjęcia → weryfikacja albo zapis automatyczny → wydatki rozdzielone
              wyłącznie na kategorie tego budżetu (podział na kilka kategorii = osobne wpisy do cofnięcia) */}
          {!editing && rows.length > 0 && aiOn(app.settings, 'receipts') && (
            <ReceiptScanner
              rows={rows}
              month={month}
              onSave={(receipt, parts) => {
                const res = addPurchase(parts, null, `Paragon${receipt.shop ? `: ${receipt.shop}` : ''}${receipt.halved > 0 ? ' (½ – podział 50/50)' : ''}`);
                setReceiptsVer((v) => v + 1);
                return res;
              }}
            />
          )}
        </div>
      </div>
      {/* Miniony miesiąc: podsumowanie od AI (archiwum; generowane automatycznie w nowym miesiącu) */}
      {month < monthKey() && !editing && saved?.length > 0 && aiOn(app.settings, 'budgetSummary') && (
        <div className="mb-3">
          <MonthSummary key={month} month={month} label={monthName(month)} />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-xs sm:text-sm">
          <colgroup>
            <col />
            <col className="w-[23%] sm:w-[19%]" />
            <col className="w-[21%] sm:w-[17%]" />
            <col className="w-[23%] sm:w-[17%]" />
            {editing && <col className="w-7 sm:w-9" />}
          </colgroup>
          <thead>
            <tr className="bg-[#1f3864] text-white dark:bg-[#22355e]">
              <th className="px-2 py-1.5 text-center font-semibold">Kategoria</th>
              <th className="px-2 py-1.5 text-center font-semibold">Plan</th>
              <th className="px-2 py-1.5 text-center font-semibold">Wydano</th>
              <th className="px-2 py-1.5 text-center font-semibold">Zostało</th>
              {editing && <th aria-label="Usuń" />}
            </tr>
          </thead>
          <tbody className="tabular">
            {shown.map((r, i) => {
              const left = rowLeft(r);
              return (
                <tr key={r.id} className={`border-b border-stone-200 dark:border-white/10 ${i % 2 ? 'bg-stone-50 dark:bg-white/[0.03]' : ''}`}>
                  {editing ? (
                    <>
                      <td className="px-0.5 py-0.5">
                        <input autoFocus={r.id === fresh} className={editInput} value={r.name} placeholder="Nazwa kategorii" onChange={(e) => update(r.id, { name: e.target.value })} aria-label={`Kategoria: ${r.name || 'nowa'}`} />
                        {(savingsAccounts.length > 0 || isTransferRow(r)) && (
                          <select
                            value={isTransferRow(r) ? `${r.savings.dir === 'in' ? 'in' : 'out'}|${r.savings.accountId}` : ''}
                            onChange={(e) => {
                              const [dir, accountId] = e.target.value.split('|');
                              update(r.id, { savings: accountId ? { accountId, dir } : undefined });
                            }}
                            aria-label={`Powiązanie z kontem oszczędnościowym: ${r.name || 'nowa'}`}
                            title="Kategoria powiązana z kontem oszczędnościowym – wpisy zmieniają stan konta i nie liczą się do wydatków"
                            className="mt-0.5 h-6 w-full min-w-0 rounded border border-stone-200 bg-white px-1 text-[10px] text-stone-600 dark:border-white/10 dark:bg-neutral-800 dark:text-stone-300"
                          >
                            <option value="">Wydatek (bez konta)</option>
                            {savingsAccounts.map((a) => (
                              <option key={`out${a.id}`} value={`out|${a.id}`}>
                                🏦 − z konta: {a.name}
                              </option>
                            ))}
                            {savingsAccounts.map((a) => (
                              <option key={`in${a.id}`} value={`in|${a.id}`}>
                                🏦 + na konto: {a.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="border-l border-stone-200 px-0.5 py-0.5 dark:border-white/10">
                        <AmountInput value={r.planned} onChange={(v) => update(r.id, { planned: v })} label={`Planowany budżet: ${r.name}`} />
                      </td>
                      <td className="border-l border-stone-200 px-0.5 py-0.5 dark:border-white/10">
                        <AmountInput value={r.spent} onChange={(v) => update(r.id, { spent: v })} label={`Kwota wydana: ${r.name}`} />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-2 py-1 leading-snug break-words [hyphens:auto] sm:py-1.5">
                        {r.name || <span className="text-stone-400">bez nazwy</span>}
                        {isTransferRow(r) && (
                          <span className="block text-[10px] leading-tight text-emerald-700 dark:text-emerald-400" title="Transfer – poza sumą wydatków budżetu">
                            🏦 {r.savings.dir === 'in' ? '+ na' : '− z'} {accountName(r.savings.accountId)} · poza wydatkami
                          </span>
                        )}
                      </td>
                      <td className="border-l border-stone-200 px-2 py-1 text-right whitespace-nowrap sm:py-1.5 dark:border-white/10">{zl(toNum(r.planned))}</td>
                      <td className="border-l border-stone-200 px-2 py-1 text-right whitespace-nowrap sm:py-1.5 dark:border-white/10">{zl(toNum(r.spent))}</td>
                    </>
                  )}
                  <td className={`border-l border-stone-200 px-2 py-0.5 text-right whitespace-nowrap dark:border-white/10 ${leftTone(left)}`}>{zl(left)}</td>
                  {editing && (
                    <td className="py-0.5 text-center">
                      <button
                        type="button"
                        onClick={() => remove(r.id)}
                        aria-label={`Usuń kategorię ${r.name}`}
                        title="Usuń"
                        className="inline-flex h-7 w-7 items-center justify-center rounded text-stone-400 hover:bg-red-50 hover:text-red-600 dark:text-stone-500 dark:hover:bg-red-500/10"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={editing ? 5 : 4} className="px-2 py-4 text-center text-stone-500">
                  {editing ? 'Brak kategorii – dodaj pierwszą poniżej.' : 'Brak kategorii – kliknij „Edytuj”, aby je dodać.'}
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
              {editing && <td />}
            </tr>
            {totals.transfer.count > 0 && (
              <tr className="text-[11px] text-emerald-800 sm:text-xs dark:text-emerald-300" aria-label="Transfery z kontem oszczędnościowym">
                <td className="px-2 py-1">🏦 Oszczędności (poza RAZEM)</td>
                <td className="px-2 py-1 text-right whitespace-nowrap">{zl(totals.transfer.planned)}</td>
                <td className="px-2 py-1 text-right whitespace-nowrap">{zl(totals.transfer.spent)}</td>
                <td className="px-2 py-1 text-right whitespace-nowrap">{zl(totals.transfer.planned - totals.transfer.spent)}</td>
                {editing && <td />}
              </tr>
            )}
          </tfoot>
        </table>
      </div>

      {editing ? (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <button type="button" className={linkBtn} onClick={add}>
            <Plus size={14} /> Dodaj kategorię
          </button>
          {prevKey && (
            <button type="button" className={linkBtn} onClick={copyPrev} title={`Kategorie i kwoty planowane z: ${monthName(prevKey)} (wydane = 0,00 zł)`}>
              <Copy size={14} /> Kopiuj plan z poprzedniego miesiąca
            </button>
          )}
          {draft.some((r) => toNum(r.spent) !== 0) && (
            <button type="button" className={linkBtn} onClick={zeroSpent} title="Kwota wydana = 0,00 zł we wszystkich kategoriach">
              <RotateCcw size={14} /> Wyzeruj wydane
            </button>
          )}
          {draft.length > 0 && (
            <button type="button" className={linkBtn} onClick={clear}>
              <Eraser size={14} /> Wyczyść
            </button>
          )}
          <span className="ml-auto text-[11px] text-stone-400">„Zapisz” w prawym górnym rogu zapisuje zmiany</span>
        </div>
      ) : (
        <>
          {isTemplate && prevKey && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 text-xs text-[#1f3864] dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
              <span className="min-w-0 flex-1">Nowy miesiąc bez planu – przenieść kategorie i kwoty planowane z: {monthName(prevKey)}?</span>
              <button type="button" onClick={applyPrevPlan} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#1f3864] px-3 font-semibold text-white hover:bg-[#2a4a80] dark:bg-blue-500 dark:text-neutral-950 dark:hover:bg-blue-400">
                <Copy size={14} /> Kopiuj plan z poprzedniego miesiąca
              </button>
            </div>
          )}
          <PurchasePanel rows={rows} onAdd={addPurchase} />
          {/* Paragony (BETA): skan → weryfikacja / zapis automatyczny → wydatek; historia z edycją (samouczenie kategorii) */}
          <div className="mt-3">
            <ReceiptsHistory key={receiptsVer} rows={rows} month={month} onAdjust={adjustSpent} />
          </div>
          <RecentEntries entries={entries} rows={rows} onUndo={undoPurchase} />
          <DailyTile rows={rows} month={month} />
          <p className="mt-2 text-right text-[11px] text-stone-400">
            {isTemplate ? 'Przykładowe kategorie – zmień je w trybie „Edytuj”' : 'Zapis w tej przeglądarce i kopii zapasowej'}
          </p>
        </>
      )}
    </section>
  );
}

const toNum = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

// Pole kwoty w trybie edycji (przecinek dziesiętny, zaznaczenie całości po wejściu)
function AmountInput({ value, onChange, label }) {
  return (
    <input
      className={`${editInput} text-right`}
      value={String(value ?? '').replace('.', ',')}
      inputMode="decimal"
      placeholder="0,00"
      onChange={(e) => onChange(e.target.value.replace(/[^\d,.\-]/g, ''))}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      aria-label={label}
    />
  );
}

const FOOD_DEFAULT = /jedzeni/i;
const fieldCls = 'h-10 min-w-0 rounded-md border border-stone-200 bg-white px-2 text-sm outline-none focus:border-[#1f3864] focus:ring-1 focus:ring-[#1f3864]/30 disabled:opacity-60 dark:border-white/10 dark:bg-neutral-800';
const cleanAmount = (v) => v.replace(/[^\d,.]/g, '');

function AmountField({ value, onChange, label, className = '' }) {
  return (
    <label className={`flex h-10 items-center rounded-md border border-stone-200 bg-white pr-2 focus-within:border-[#1f3864] focus-within:ring-1 focus-within:ring-[#1f3864]/30 dark:border-white/10 dark:bg-neutral-800 ${className}`}>
      <span className="sr-only">{label}</span>
      <input value={value} onChange={(e) => onChange(cleanAmount(e.target.value))} inputMode="decimal" placeholder="0,00" aria-label={label} className="h-full min-w-0 flex-1 bg-transparent px-2 text-right text-sm tabular outline-none" />
      <span className="text-sm text-stone-500">zł</span>
    </label>
  );
}

// Szybki zakup: kategoria (domyślnie „Jedzenie…”), kwota paragonu, notatka; „Podziel zakup” – części paragonu do innych
// kategorii, odejmowane od kwoty głównej (podsumowanie na żywo, suma części ≤ kwota paragonu)
function PurchasePanel({ rows, onAdd }) {
  const options = rows.filter((r) => String(r.name || '').trim());
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState(null);
  const [split, setSplit] = useState(null); // null – bez podziału; [{ key, id, amount }]
  const fallback = (options.find((r) => FOOD_DEFAULT.test(r.name)) || options[0])?.id || '';
  const selected = options.some((r) => r.id === categoryId) ? categoryId : fallback;
  const mainName = options.find((r) => r.id === selected)?.name || '';
  const total = toNum(amount);
  const extra = (split || []).filter((p) => toNum(p.amount) > 0 && options.some((r) => r.id === p.id));
  const extraSum = Math.round(extra.reduce((s, p) => s + toNum(p.amount), 0) * 100) / 100;
  const remainder = Math.round((total - extraSum) * 100) / 100;
  const over = extraSum > total + 0.004;

  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(() => setMsg(null), 4500);
    return () => clearTimeout(t);
  }, [msg]);

  const otherId = (taken) => (options.find((r) => r.id !== selected && !taken.includes(r.id)) || options.find((r) => r.id !== selected) || options[0])?.id || '';
  const addSplitRow = () => setSplit((list) => [...(list || []), { key: newRowId(), id: otherId((list || []).map((p) => p.id)), amount: '' }]);
  const toggleSplit = () => (split ? setSplit(null) : setSplit([{ key: newRowId(), id: otherId([]), amount: '' }]));
  const updateSplit = (key, patch) => setSplit((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const removeSplit = (key) => setSplit((list) => {
    const next = list.filter((p) => p.key !== key);
    return next.length ? next : null;
  });

  const submit = (e) => {
    e.preventDefault();
    if (!selected) return setMsg({ error: true, text: 'Najpierw dodaj kategorię w tabeli.' });
    if (!(total > 0)) return setMsg({ error: true, text: 'Wpisz kwotę zakupu większą od zera.' });
    if (over) return setMsg({ error: true, text: `Suma podziału (${zl(extraSum)}) przekracza kwotę paragonu (${zl(total)}).` });
    const parts = [{ id: selected, amount: remainder }, ...extra.map((p) => ({ id: p.id, amount: toNum(p.amount) }))];
    const res = onAdd(parts, null, note);
    if (!res) return undefined;
    setAmount('');
    setNote('');
    setSplit(null);
    setMsg({
      error: false,
      text: `${res.parts.length > 1 ? `Dodano ${zl(total)}: ${res.parts.map((p) => `${p.name} ${zl(p.amount)}`).join(' · ')}` : `Dodano ${zl(total)} do „${res.name}” · pozostało ${zl(res.left)}`}${res.transfer ? ' · zaksięgowano na koncie oszczędnościowym (poza wydatkami)' : ''}`,
    });
    return undefined;
  };

  return (
    <form onSubmit={submit} className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-white/10 dark:bg-white/[0.03]" aria-label="Dodaj zakup">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[#1f3864] uppercase dark:text-blue-300">
        <ShoppingBag size={14} /> Dodaj zakup
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
        <select value={selected} onChange={(e) => setCategoryId(e.target.value)} disabled={options.length === 0} aria-label="Kategoria zakupu" className={fieldCls}>
          {options.length === 0 && <option value="">Brak kategorii</option>}
          {options.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <AmountField value={amount} onChange={setAmount} label="Kwota zakupu" />
        <button
          type="submit"
          disabled={options.length === 0}
          className="order-2 col-span-2 inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-[#1f3864] px-4 text-sm font-semibold text-white hover:bg-[#2a4a80] disabled:opacity-50 sm:order-1 sm:col-span-1 dark:bg-blue-500 dark:text-neutral-950 dark:hover:bg-blue-400"
        >
          <Plus size={16} /> Dodaj do wydanych
        </button>
        <div className="order-1 col-span-2 space-y-2 sm:order-2 sm:col-span-3">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={80}
            placeholder="Notatka (opcjonalnie), np. Biedronka"
            aria-label="Notatka do zakupu"
            className="h-9 w-full min-w-0 rounded-md border border-stone-200 bg-white px-2 text-sm outline-none focus:border-[#1f3864] focus:ring-1 focus:ring-[#1f3864]/30 dark:border-white/10 dark:bg-neutral-800"
          />
          <button
            type="button"
            onClick={toggleSplit}
            disabled={options.length < 2}
            aria-expanded={!!split}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-stone-300 px-3 text-xs font-semibold text-[#1f3864] hover:bg-white disabled:opacity-50 dark:border-white/20 dark:text-blue-300 dark:hover:bg-white/5"
          >
            <Split size={14} /> {split ? 'Anuluj podział' : 'Podziel zakup'}
          </button>
          {split && (
            <div className="space-y-2 rounded-md border border-stone-200 bg-white p-2 dark:border-white/10 dark:bg-neutral-900" aria-label="Podział zakupu">
              {split.map((p, i) => (
                <div key={p.key} className="grid grid-cols-[minmax(0,1fr)_6.5rem_auto] gap-2">
                  <select value={p.id} onChange={(e) => updateSplit(p.key, { id: e.target.value })} aria-label={`Kategoria części ${i + 1}`} className={fieldCls}>
                    {options.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <AmountField value={p.amount} onChange={(v) => updateSplit(p.key, { amount: v })} label={`Kwota części ${i + 1}`} />
                  <button type="button" onClick={() => removeSplit(p.key)} aria-label={`Usuń część ${i + 1}`} className="inline-flex h-10 w-8 items-center justify-center rounded-md text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10">
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={addSplitRow} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-white/5">
                <Plus size={14} /> Dodaj kolejną kategorię
              </button>
              <p role="status" className={`text-xs tabular ${over ? 'font-semibold text-red-600 dark:text-red-400' : 'text-stone-600 dark:text-stone-300'}`}>
                {over
                  ? `Suma części ${zl(extraSum)} przekracza kwotę paragonu ${zl(total)} o ${zl(extraSum - total)}.`
                  : `W kategorii głównej (${mainName}) zostanie: ${zl(remainder)} (${zl(total)} − ${zl(extraSum)})`}
              </p>
            </div>
          )}
        </div>
      </div>
      {msg && (
        <p role="status" className={`mt-2 flex items-center gap-1.5 text-xs ${msg.error ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
          {!msg.error && <Check size={14} />} {msg.text}
        </p>
      )}
    </form>
  );
}

const RECENT_KEY = 'wealth-app-budget-recent-open';
const atLabel = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// Ostatnie wpisy z „Dodaj zakup” (10 najnowszych w miesiącu), domyślnie zwinięte; × cofa wpis
function RecentEntries({ entries, rows, onUndo }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(RECENT_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(RECENT_KEY, o ? '0' : '1');
      } catch {
        // brak localStorage
      }
      return !o;
    });
  };
  const names = Object.fromEntries(rows.map((r) => [r.id, r.name]));
  const shown = entries.slice(0, 10);
  return (
    <div className="mt-2 rounded-lg border border-stone-200 dark:border-white/10">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-semibold tracking-wide text-[#1f3864] uppercase dark:text-blue-300">
        <History size={14} /> Ostatnie wpisy
        <span className="font-normal normal-case text-stone-500 dark:text-stone-400">({entries.length})</span>
        <ChevronDown size={16} className={`ml-auto text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="border-t border-stone-200 dark:border-white/10">
          {shown.length === 0 && <li className="px-3 py-2 text-xs text-stone-500">Brak wpisów w tym miesiącu – dodane zakupy pojawią się tutaj.</li>}
          {shown.map((e) => (
            <li key={e.id} className="flex items-center gap-2 border-b border-stone-100 px-3 py-1.5 text-xs last:border-0 dark:border-white/5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-stone-700 dark:text-stone-200">
                  {names[e.rowId] || e.name}
                  {e.note && <span className="font-normal text-stone-500 dark:text-stone-400"> · {e.note}</span>}
                </span>
                <span className="block text-[11px] text-stone-400">{atLabel(e.at)}</span>
              </span>
              <span className="shrink-0 font-semibold tabular">{zl(e.amount)}</span>
              <button
                type="button"
                onClick={() => onUndo(e.id)}
                aria-label={`Cofnij wpis ${zl(e.amount)} – ${names[e.rowId] || e.name}`}
                title="Cofnij wpis (odejmij od wydanych)"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
              >
                <X size={14} />
              </button>
            </li>
          ))}
          {entries.length > shown.length && <li className="px-3 py-1.5 text-[11px] text-stone-400">+ {entries.length - shown.length} starszych wpisów</li>}
        </ul>
      )}
    </div>
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
