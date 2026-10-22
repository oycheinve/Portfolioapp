import { useMemo } from 'react';
import { ArrowRight, Flame } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { dividendKpis } from '../../lib/dividends.js';
import { incomeEventsWithTax, isoDay } from '../../lib/engine.js';
import { goalProgress } from '../../lib/goals.js';
import { formatNumber, formatPercent } from '../../lib/format.js';

const pln = (v, d = 2) => `${formatNumber(v, d)} PLN`;

// Pasywny dochód (Pulpit): prognoza netto z posiadanych jednostek (dywidendy forward), postęp celów
// (dywidendy / dochód pasywny w Celach rocznych, cel FIRE) i małe podsumowania: ostatnie 12 mies. / w drodze
export default function PassiveIncomeTile({ onNavigate }) {
  const { state } = useApp();
  const today = isoDay(new Date());
  const year = Number(today.slice(0, 4));
  const fire = state.settings.fire;

  const data = useMemo(() => {
    const k = dividendKpis(state, today);
    const received = incomeEventsWithTax(state)
      .filter((i) => i.type === 'DIVIDEND' && i.date <= today)
      .reduce((s, i) => s + (Number.isFinite(i.net) ? i.net : 0), 0);
    const goals = state.goals
      .filter((g) => Number(g.year) === year && g.status !== 'ARCHIVED' && (g.source === 'DIVIDENDS' || g.source === 'PASSIVE'))
      .map((g) => ({ goal: g, ...goalProgress(state, g) }));
    return { k, monthly: k.forwardNet / 12, received, goals };
  }, [state, today, year]);

  const target = Number(fire.targetMonthlyIncome) || 0;
  const bars = [
    ...data.goals.map((g, i) => ({
      key: g.goal.id,
      label: `${g.goal.name || 'Cel dywidend'} · ${pln(g.target, 0)}`,
      pct: g.pct,
      color: i % 2 ? 'bg-sky-500' : 'bg-emerald-500',
    })),
    ...(target > 0 ? [{ key: 'fire', label: `Cel FIRE ${fire.targetYear} · ${pln(target, 0)} / mc`, pct: data.monthly / target, color: 'bg-orange-500' }] : []),
  ];

  return (
    <section className="min-w-0 rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm sm:p-6 dark:border-white/10 dark:bg-neutral-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Flame size={20} className="text-orange-500" /> Pasywny dochód
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400">Prognoza netto na podstawie posiadanych jednostek</p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate?.('simulations/fire')}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-stone-200 bg-white px-4 text-sm font-semibold hover:bg-stone-50 dark:border-white/10 dark:bg-neutral-800 dark:hover:bg-neutral-700"
        >
          Projekcja <ArrowRight size={16} />
        </button>
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-4xl font-extrabold tracking-tight tabular sm:text-5xl">{pln(data.monthly)}</span>
        <span className="text-lg font-medium text-stone-500 dark:text-stone-400">/ mc</span>
      </div>
      <p className="mt-1 text-sm text-stone-500 tabular dark:text-stone-400">
        {pln(data.k.forwardNet, 0)} rocznie · otrzymane łącznie {pln(data.received)}
      </p>

      {bars.length > 0 && (
        <div className="mt-5 space-y-4">
          {bars.map((b) => (
            <div key={b.key}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-sm font-medium">
                <span className="min-w-0 truncate">{b.label}</span>
                <span className="tabular">{formatPercent(b.pct, { digits: 1 })}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-stone-100 dark:bg-white/[0.06]" role="progressbar" aria-label={b.label} aria-valuenow={Math.round(b.pct * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className={`h-full rounded-full ${b.color}`} style={{ width: `${Math.max(2.5, Math.min(100, b.pct * 100))}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-stone-100/80 px-4 py-3 dark:bg-white/[0.06]">
          <div className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase dark:text-stone-400">Ostatnie 12 mies.</div>
          <div className="mt-1 text-lg font-bold tabular">{pln(data.k.last12Net)}</div>
        </div>
        <div className="rounded-2xl bg-stone-100/80 px-4 py-3 dark:bg-white/[0.06]">
          <div className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase dark:text-stone-400">W drodze</div>
          <div className={`mt-1 text-lg font-bold tabular ${data.k.pendingNet > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>{pln(data.k.pendingNet)}</div>
        </div>
      </div>
    </section>
  );
}
