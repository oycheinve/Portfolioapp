import { useMemo } from 'react';
import { ArrowRight, CalendarCheck, Flame, HandCoins, Landmark, Settings2, TrendingUp } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { SCENARIOS, fireProgress, runScenarios } from '../lib/fire.js';
import { isoDay, livePriceLookup, otherAssetsValue, valuePortfolio } from '../lib/engine.js';
import { formatPLN, formatPercent } from '../lib/format.js';
import { Card } from '../components/ui.jsx';
import { currentPassiveIncome } from './Fire.jsx';

const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const CRITERION = { BOTH: 'oba cele: majątek i dochód pasywny', INCOME: 'cel dochodu pasywnego', NETWORTH: 'cel majątku' };

// FIRE {rok}: ile brakuje do celu (wg kryterium z ustawień), postęp majątku i dochodu pasywnego, szacowany termin
export default function FireGoalView({ onNavigate }) {
  const { state } = useApp();
  const fire = state.settings.fire;

  const data = useMemo(() => {
    const v = valuePortfolio(state, { asOf: isoDay(new Date()), accountIds: null, priceLookup: livePriceLookup(state) });
    const other = fire.includeOtherAssets ? otherAssetsValue(state).totalValue : 0;
    const value = v.totals.total + other;
    const income = currentPassiveIncome(state);
    const monthlyIncome = income.total / 12;
    const progress = fireProgress({ value, monthlyIncome }, fire);
    const base = {
      startValue: value,
      startAnnualIncome: income.total,
      monthlyContribution: Number(fire.monthlyContribution) || 0,
      contributionIndexed: !!fire.contributionIndexed,
      dividendYield: (Number(fire.dividendYield) || 0) / 100,
      dgr: (Number(fire.dgr) || 0) / 100,
      inflation: (Number(fire.inflation) || 0) / 100,
    };
    const scenario = runScenarios(base, fire)[fire.scenario] || null;
    return { value, monthlyIncome, income, progress, reached: scenario?.reached || null };
  }, [state, fire]);

  const p = data.progress;
  const done = Math.min(1, Math.max(0, p.main));
  const missing = Math.max(0, 1 - p.main);
  const yearsLeft = Math.max(0, fire.targetYear - new Date().getFullYear());
  const onTrack = data.reached && data.reached.year <= fire.targetYear;
  const ring = 2 * Math.PI * 52;

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="min-w-0 rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm sm:p-6 dark:border-white/10 dark:bg-neutral-900">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <div className="relative h-40 w-40 shrink-0">
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
              <circle cx="60" cy="60" r="52" fill="none" strokeWidth="12" className="stroke-stone-100 dark:stroke-white/[0.07]" />
              <circle cx="60" cy="60" r="52" fill="none" strokeWidth="12" strokeLinecap="round" className="stroke-orange-500" strokeDasharray={`${ring * done} ${ring}`} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-3xl font-extrabold tabular">{formatPercent(done, { digits: 1 })}</span>
              <span className="text-[11px] text-stone-500 dark:text-stone-400">osiągnięte</span>
            </div>
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h2 className="flex items-center justify-center gap-2 text-lg font-bold sm:justify-start">
              <Flame size={20} className="text-orange-500" /> FIRE {fire.targetYear}
            </h2>
            <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">Do celu FIRE brakuje</p>
            <p className="text-4xl font-extrabold tracking-tight tabular sm:text-5xl" aria-label={`Do celu FIRE brakuje ${formatPercent(missing, { digits: 1 })}`}>
              {missing > 0 ? formatPercent(missing, { digits: 1 }) : 'Cel osiągnięty 🎉'}
            </p>
            <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
              Kryterium: {CRITERION[fire.criterion] || CRITERION.BOTH} · {yearsLeft} {yearsLeft === 1 ? 'rok' : yearsLeft >= 2 && yearsLeft <= 4 ? 'lata' : 'lat'} do {fire.targetYear}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  onTrack ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300'
                }`}
              >
                <CalendarCheck size={14} />
                {data.reached ? `Szacowane osiągnięcie: ${MONTHS[data.reached.month]} ${data.reached.year}` : 'Szacowane osiągnięcie: po 2100'}
                {` · scenariusz ${SCENARIOS[fire.scenario]?.label.toLowerCase() || ''}`}
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <GoalCard
          icon={Landmark}
          title="Majątek"
          current={data.value}
          target={fire.targetNetWorth}
          pct={p.worth}
          color="bg-blue-600 dark:bg-blue-500"
          note={fire.includeOtherAssets ? 'Portfel, poduszka i nieruchomości / inne aktywa' : 'Portfel inwestycyjny i poduszka finansowa'}
        />
        <GoalCard
          icon={HandCoins}
          title="Dochód pasywny (miesięcznie)"
          current={data.monthlyIncome}
          target={fire.targetMonthlyIncome}
          pct={p.income}
          color="bg-orange-500"
          note={`Dywidendy ${formatPLN(data.income.dividends / 12)} · obligacje ${formatPLN(data.income.bonds / 12)} · oszczędności ${formatPLN(data.income.savings / 12)} / mies.`}
        />
      </div>

      <Card title="Dalej" icon={TrendingUp} bodyClassName="p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onNavigate('simulations/fire')}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-stone-200 bg-white px-4 text-sm font-semibold hover:bg-stone-50 dark:border-white/10 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          >
            Symulacja i projekcja FIRE <ArrowRight size={16} />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('settings/fire')}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-stone-200 bg-white px-4 text-sm font-semibold hover:bg-stone-50 dark:border-white/10 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          >
            <Settings2 size={16} /> Zmień cele FIRE
          </button>
        </div>
        <p className="mt-3 text-[11px] text-stone-500 dark:text-stone-400">
          Cele w dzisiejszej sile nabywczej. Dochód pasywny = prognoza dywidend netto z posiadanych akcji, bieżące oprocentowanie obligacji i odsetki z kont oszczędnościowych. Szacowany termin – z symulacji FIRE (wpłaty, stopa zwrotu i inflacja z ustawień symulacji).
        </p>
      </Card>
    </div>
  );
}

function GoalCard({ icon: Icon, title, current, target, pct, color, note }) {
  const left = Math.max(0, (Number(target) || 0) - current);
  return (
    <section className="min-w-0 rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <div className="flex items-center gap-2 text-sm font-semibold text-stone-600 dark:text-stone-300">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 dark:bg-white/[0.06]">
          <Icon size={18} />
        </span>
        {title}
      </div>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-2xl font-bold tabular">{formatPLN(current)}</span>
        <span className="text-sm text-stone-500 tabular dark:text-stone-400">z {formatPLN(target)}</span>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-stone-100 dark:bg-white/[0.06]" role="progressbar" aria-label={title} aria-valuenow={Math.round(Math.min(1, pct) * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(2, Math.min(100, pct * 100))}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
        <span className="font-semibold tabular">{formatPercent(pct, { digits: 1 })}</span>
        <span className="text-stone-500 tabular dark:text-stone-400">{left > 0 ? `brakuje ${formatPLN(left)} (${formatPercent(Math.max(0, 1 - pct), { digits: 1 })})` : 'cel osiągnięty'}</span>
      </div>
      <p className="mt-2 text-[11px] text-stone-500 dark:text-stone-400">{note}</p>
    </section>
  );
}
