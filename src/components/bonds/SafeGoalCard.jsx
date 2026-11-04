import { useMemo } from 'react';
import { CheckCircle2, Clock, Flag, Hourglass, Target } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { budgetTotals, monthKey, readBudget } from '../../lib/budget.js';
import { safeGoalStats } from '../../lib/cashflow.js';
import { formatPLN } from '../../lib/format.js';
import { BetaBadge, Card, Field, Input } from '../ui.jsx';

const pct = (v) => `${(v * 100).toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const months = (m) => `${m.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mies.`;
const duration = (m) => {
  if (m === 0) return 'teraz';
  const y = Math.floor(m / 12);
  const r = m % 12;
  return [y ? `${y} ${y === 1 ? 'rok' : y < 5 ? 'lata' : 'lat'}` : '', r ? `${r} mies.` : ''].filter(Boolean).join(' ');
};

// Planowany budżet miesięczny (moduł Budżet): bieżący miesiąc, a gdy pusty – ostatni zapisany
export function plannedBudget() {
  const data = readBudget();
  const key = data[monthKey()]?.length ? monthKey() : Object.keys(data).filter((k) => data[k]?.length).sort().at(-1);
  if (!key) return null;
  const t = budgetTotals(data[key]);
  return { month: key, total: t.planned, fixed: t.byType.find((b) => b.type === 'Stałe koszty')?.planned || 0 };
}

// Cel poduszki finansowej (BETA): docelowa kwota, postęp, brakująca kwota, pokrycie kosztów życia, czas dojścia.
// Wartość = obligacje skarbowe + saldo kont oszczędnościowych (wyłącznie zaksięgowane odsetki) – jak w karcie powyżej.
export default function SafeGoalCard({ value, yearlyIncomeNet }) {
  const { state, actions } = useApp();
  const goal = state.settings.safeGoal || {};
  const set = (patch) => actions.updateSettings({ safeGoal: { ...goal, ...patch } });
  const num = (v) => (v === '' || v === null || v === undefined ? '' : Number(v));
  const target = Number(goal.target) || 0;
  const budget = useMemo(() => plannedBudget(), [state.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const costs = Number(goal.monthlyCosts) > 0 ? Number(goal.monthlyCosts) : budget?.total || 0;
  const contribution = Number(goal.monthlyContribution) || 0;
  const s = safeGoalStats({ value, target, monthlyCosts: costs, yearlyIncomeNet, monthlyContribution: contribution });
  const bar = Math.min(1, s.progress || 0);
  const tile = 'min-w-0 rounded-xl bg-stone-50 px-3 py-2.5 dark:bg-white/[0.03]';

  return (
    <Card
      title={
        <>
          Cel poduszki finansowej
          <BetaBadge />
        </>
      }
      subtitle="Docelowa kwota obligacji i oszczędności – zapis w ustawieniach (urządzenie i chmura)"
      icon={Target}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Cel (zł)">
          <Input type="number" inputMode="decimal" min="0" step="500" placeholder="np. 15000" value={num(goal.target)} onChange={(e) => set({ target: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) })} aria-label="Cel poduszki finansowej" />
        </Field>
        <Field label="Koszty życia / mies. (zł)" hint={budget ? `puste = budżet ${formatPLN(budget.total)}` : 'puste = brak budżetu'}>
          <Input type="number" inputMode="decimal" min="0" step="100" placeholder={budget ? String(Math.round(budget.total)) : 'np. 3500'} value={num(goal.monthlyCosts)} onChange={(e) => set({ monthlyCosts: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) })} aria-label="Miesięczne koszty życia" />
        </Field>
        <Field label="Dopłata / mies. (zł)">
          <Input type="number" inputMode="decimal" min="0" step="100" placeholder="0" value={num(goal.monthlyContribution)} onChange={(e) => set({ monthlyContribution: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) })} aria-label="Miesięczna dopłata do poduszki" />
        </Field>
      </div>

      {target > 0 ? (
        <>
          <div className="mt-4">
            <div className="flex items-end justify-between gap-2">
              <span className={`text-3xl font-bold tracking-tight tabular ${s.reached ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{pct(s.progress)}</span>
              <span className="text-right text-sm text-stone-500 tabular dark:text-stone-400">
                {formatPLN(value)} z {formatPLN(target)}
              </span>
            </div>
            <div className="mt-2 h-3.5 overflow-hidden rounded-full bg-stone-100 dark:bg-white/[0.07]" role="progressbar" aria-label="Postęp celu poduszki" aria-valuenow={Math.round((s.progress || 0) * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full rounded-full transition-all duration-500 ${s.reached ? 'bg-emerald-500' : 'bg-gradient-to-r from-blue-600 to-sky-400'}`} style={{ width: `${bar * 100}%` }} />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div className={tile}>
              <div className="flex items-center gap-1.5 text-[11px] text-stone-500 dark:text-stone-400">{s.reached ? <CheckCircle2 size={13} className="text-emerald-500" /> : <Flag size={13} />} Do celu</div>
              {s.reached ? (
                <>
                  <div className="text-base font-semibold text-emerald-600 dark:text-emerald-400">Cel osiągnięty</div>
                  <div className="text-[11px] text-stone-500 tabular dark:text-stone-400">nadwyżka {formatPLN(s.surplus)}</div>
                </>
              ) : (
                <div className="text-base font-semibold tabular">Pozostało: {formatPLN(s.missing)}</div>
              )}
            </div>
            <div className={tile}>
              <div className="flex items-center gap-1.5 text-[11px] text-stone-500 dark:text-stone-400">
                <Hourglass size={13} /> Pokrycie kosztów życia
              </div>
              <div className="text-base font-semibold tabular">{s.runway !== null ? `${months(s.runway)} kosztów życia` : '—'}</div>
              <div className="text-[11px] text-stone-500 tabular dark:text-stone-400">{costs > 0 ? `przy ${formatPLN(costs)} / mies.${Number(goal.monthlyCosts) > 0 ? '' : ' (budżet)'}` : 'uzupełnij budżet albo koszty życia'}</div>
            </div>
            <div className={tile}>
              <div className="flex items-center gap-1.5 text-[11px] text-stone-500 dark:text-stone-400">
                <Clock size={13} /> Szacowany czas do celu
              </div>
              <div className="text-base font-semibold tabular">{s.monthsToGoal === null ? 'brak wzrostu' : duration(s.monthsToGoal)}</div>
              <div className="text-[11px] text-stone-500 tabular dark:text-stone-400">
                odsetki netto {formatPLN(yearlyIncomeNet / 12)} / mies.{contribution ? ` + dopłata ${formatPLN(contribution)}` : ''}
              </div>
            </div>
          </div>
        </>
      ) : (
        <p className="mt-3 rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-500 dark:bg-white/[0.03] dark:text-stone-400">Wpisz docelową kwotę poduszki (np. 15 000 zł), aby zobaczyć postęp, pokrycie kosztów życia i czas dojścia do celu.</p>
      )}
    </Card>
  );
}
