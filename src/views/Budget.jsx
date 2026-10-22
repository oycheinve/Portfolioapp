import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ClipboardList, Copy, Eraser, Plus, Trash2 } from 'lucide-react';
import { BUDGET_TYPES, budgetTotals, demoRows, monthKey, newRowId, readBudget, rowLeft, shiftMonth, writeBudget } from '../lib/budget.js';
import { formatPLN, formatPercent } from '../lib/format.js';
import { Badge, Button, Card, IconButton } from '../components/ui.jsx';

const MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
const monthName = (key) => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
const cell =
  'h-9 w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2 text-sm outline-none transition-colors hover:border-stone-200 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:hover:border-white/10 dark:focus:bg-neutral-800';
// Pole kwoty w karcie (telefon) – zawsze z ramką
const boxed =
  'h-9 w-full min-w-0 rounded-lg border border-stone-200 bg-white px-2 text-right text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-neutral-800';
const leftTone = (v) => (v < -0.004 ? 'text-red-600 dark:text-red-400' : v > 0.004 ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-500');

// Budżet miesięczny (Demo): kategorie z planem i wydatkami, pozostało = plan − wydane, wiersz RAZEM, zmiana miesiąca
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
  const add = () => setRows([...rows, { id: newRowId(), name: '', planned: '', spent: '', type: 'Inne' }]);
  const copyPrev = () => setRows((data[prevKey] || []).map((r) => ({ ...r, id: newRowId(), spent: '' })));
  const clear = () => setRows([]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Miesiąc i podsumowanie */}
      <section className="min-w-0 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5 dark:border-white/10 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <IconButton icon={ChevronLeft} label="Poprzedni miesiąc" onClick={() => setMonth(shiftMonth(month, -1))} />
            <label className="relative">
              <span className="sr-only">Miesiąc budżetu</span>
              <input
                type="month"
                value={month}
                onChange={(e) => e.target.value && setMonth(e.target.value)}
                className="h-9 rounded-lg border border-stone-200 bg-white px-2 text-sm font-semibold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-neutral-800"
                aria-label="Miesiąc budżetu"
              />
            </label>
            <IconButton icon={ChevronRight} label="Następny miesiąc" onClick={() => setMonth(shiftMonth(month, 1))} />
          </div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold">{monthName(month)}</h2>
            <Badge tone="amber">Demo</Badge>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Planowany budżet" value={formatPLN(totals.planned)} />
          <Tile label="Wydano" value={formatPLN(totals.spent)} />
          <Tile label="Pozostało" value={formatPLN(totals.left)} tone={leftTone(totals.left)} />
          <Tile label="Wykorzystanie" value={formatPercent(totals.used, { digits: 0 })} sub={totals.over ? `${totals.over} ${totals.over === 1 ? 'kategoria' : 'kategorie'} ponad plan` : 'wszystko w planie'} />
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-stone-100 dark:bg-white/[0.06]" role="progressbar" aria-label="Wykorzystanie budżetu" aria-valuenow={Math.round(totals.used * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full rounded-full ${totals.used > 1 ? 'bg-red-500' : 'bg-blue-600 dark:bg-blue-500'}`} style={{ width: `${Math.min(100, totals.used * 100)}%` }} />
        </div>
      </section>

      <Card
        title="Budżet miesięczny"
        subtitle="Kategoria, plan, wydane, pozostało (plan − wydane) i typ – jak w arkuszu"
        icon={ClipboardList}
        actions={
          <div className="flex flex-wrap gap-2">
            {prevKey && (
              <Button size="sm" icon={Copy} onClick={copyPrev} title={`Kategorie i plan z: ${monthName(prevKey)} (wydane wyzerowane)`}>
                Kopiuj plan ({monthName(prevKey)})
              </Button>
            )}
            {!isTemplate && rows.length > 0 && (
              <Button size="sm" variant="ghost" icon={Eraser} onClick={clear}>
                Wyczyść
              </Button>
            )}
            <Button size="sm" variant="primary" icon={Plus} onClick={add}>
              Dodaj kategorię
            </Button>
          </div>
        }
        bodyClassName="p-0 sm:p-0"
      >
        {isTemplate && (
          <p className="border-b border-stone-100 bg-amber-50/60 px-4 py-2.5 text-xs text-amber-900 sm:px-5 dark:border-white/5 dark:bg-amber-500/5 dark:text-amber-300">
            Brak budżetu na {monthName(month).toLowerCase()} – poniżej przykładowe kategorie (demo). Pierwsza zmiana zapisze budżet tego miesiąca.
          </p>
        )}

        {/* Tabela – komputer */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 text-left text-xs text-stone-500 dark:border-white/5 dark:text-stone-400">
                <th className="px-5 py-2 font-medium">Kategoria</th>
                <th className="w-36 px-2 py-2 text-right font-medium">Planowany budżet</th>
                <th className="w-36 px-2 py-2 text-right font-medium">Kwota wydana</th>
                <th className="w-32 px-2 py-2 text-right font-medium">Pozostało</th>
                <th className="w-44 px-2 py-2 font-medium">Typ / Uwagi</th>
                <th className="w-12 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="tabular">
              {rows.map((r) => {
                const left = rowLeft(r);
                return (
                  <tr key={r.id} className="border-b border-stone-100 dark:border-white/5">
                    <td className="py-1 pr-2 pl-3">
                      <input className={cell} value={r.name} placeholder="Nazwa kategorii" onChange={(e) => update(r.id, { name: e.target.value })} aria-label="Kategoria" />
                    </td>
                    <td className="px-2 py-1">
                      <input className={`${cell} text-right`} type="number" step="0.01" inputMode="decimal" value={r.planned} placeholder="0" onChange={(e) => update(r.id, { planned: e.target.value })} aria-label={`Planowany budżet: ${r.name}`} />
                    </td>
                    <td className="px-2 py-1">
                      <input className={`${cell} text-right`} type="number" step="0.01" inputMode="decimal" value={r.spent} placeholder="0" onChange={(e) => update(r.id, { spent: e.target.value })} aria-label={`Kwota wydana: ${r.name}`} />
                    </td>
                    <td className={`px-4 py-1 text-right font-semibold ${leftTone(left)}`}>{formatPLN(left)}</td>
                    <td className="px-2 py-1">
                      <TypeSelect value={r.type} onChange={(v) => update(r.id, { type: v })} />
                    </td>
                    <td className="px-3 py-1 text-right">
                      <IconButton icon={Trash2} label={`Usuń kategorię ${r.name}`} onClick={() => remove(r.id)} className="hover:text-red-600" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="tabular">
              <tr className="bg-stone-50 font-bold dark:bg-white/[0.03]">
                <td className="px-5 py-3">RAZEM</td>
                <td className="px-4 py-3 text-right">{formatPLN(totals.planned)}</td>
                <td className="px-4 py-3 text-right">{formatPLN(totals.spent)}</td>
                <td className={`px-4 py-3 text-right ${leftTone(totals.left)}`}>{formatPLN(totals.left)}</td>
                <td className="px-4 py-3 text-xs font-medium text-stone-500">{rows.length} kategorii</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Karty – telefon */}
        <ul className="divide-y divide-stone-100 md:hidden dark:divide-white/5">
          {rows.map((r) => {
            const left = rowLeft(r);
            return (
              <li key={r.id} className="space-y-2 px-4 py-3">
                <div className="flex items-center gap-2">
                  <input className={`${cell} flex-1 font-medium`} value={r.name} placeholder="Nazwa kategorii" onChange={(e) => update(r.id, { name: e.target.value })} aria-label="Kategoria" />
                  <IconButton icon={Trash2} label={`Usuń kategorię ${r.name}`} onClick={() => remove(r.id)} className="hover:text-red-600" />
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px] text-stone-500 dark:text-stone-400">
                  <label className="space-y-0.5">
                    <span>Plan</span>
                    <input className={boxed} type="number" step="0.01" inputMode="decimal" value={r.planned} placeholder="0" onChange={(e) => update(r.id, { planned: e.target.value })} />
                  </label>
                  <label className="space-y-0.5">
                    <span>Wydane</span>
                    <input className={boxed} type="number" step="0.01" inputMode="decimal" value={r.spent} placeholder="0" onChange={(e) => update(r.id, { spent: e.target.value })} />
                  </label>
                  <div className="space-y-0.5">
                    <span>Pozostało</span>
                    <div className={`flex h-9 items-center justify-end text-sm font-semibold tabular ${leftTone(left)}`}>{formatPLN(left)}</div>
                  </div>
                </div>
                <TypeSelect value={r.type} onChange={(v) => update(r.id, { type: v })} />
              </li>
            );
          })}
          <li className="flex items-center justify-between bg-stone-50 px-4 py-3 text-sm font-bold tabular dark:bg-white/[0.03]">
            <span>RAZEM</span>
            <span className="text-right">
              {formatPLN(totals.spent)} <span className="font-normal text-stone-500">/ {formatPLN(totals.planned)}</span>
              <span className={`block text-xs ${leftTone(totals.left)}`}>pozostało {formatPLN(totals.left)}</span>
            </span>
          </li>
        </ul>

        {rows.length === 0 && <p className="px-5 py-6 text-center text-sm text-stone-500">Brak kategorii – dodaj pierwszą przyciskiem „Dodaj kategorię”.</p>}
      </Card>

      {totals.byType.length > 0 && (
        <Card title="Według typu" subtitle="Plan i wydatki zgrupowane po typie kategorii" bodyClassName="p-4 sm:p-5">
          <ul className="space-y-3">
            {totals.byType.map((t) => {
              const used = t.planned > 0 ? t.spent / t.planned : t.spent > 0 ? 1.01 : 0;
              return (
                <li key={t.type}>
                  <div className="mb-1 flex flex-wrap justify-between gap-2 text-sm">
                    <span className="font-medium">{t.type}</span>
                    <span className="tabular text-stone-500">
                      {formatPLN(t.spent)} / {formatPLN(t.planned)} · <span className={leftTone(t.planned - t.spent)}>{formatPLN(t.planned - t.spent)}</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-white/[0.06]">
                    <div className={`h-full rounded-full ${used > 1 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, used * 100)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-[11px] text-stone-500 dark:text-stone-400">
            Moduł demonstracyjny: budżet zapisuje się w tej przeglądarce i w kopii zapasowej JSON (oraz z ustawieniami przy synchronizacji z chmurą). Nie wpływa na portfel, wpłaty ani statystyki.
          </p>
        </Card>
      )}
    </div>
  );
}

function TypeSelect({ value, onChange }) {
  return (
    <select
      value={value || 'Inne'}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Typ kategorii"
      className="h-9 w-full rounded-lg border border-stone-200 bg-white px-2 text-sm outline-none focus:border-blue-500 dark:border-white/10 dark:bg-neutral-800"
    >
      {BUDGET_TYPES.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

function Tile({ label, value, sub, tone = '' }) {
  return (
    <div className="min-w-0 rounded-xl bg-stone-50 px-3 py-2.5 dark:bg-white/[0.03]">
      <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">{label}</div>
      <div className={`truncate text-lg font-semibold tabular ${tone}`}>{value}</div>
      {sub && <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">{sub}</div>}
    </div>
  );
}
