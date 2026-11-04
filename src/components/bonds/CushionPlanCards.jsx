import { useMemo } from 'react';
import { Lock, PieChart, TrendingUp } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { isoDay } from '../../lib/engine.js';
import { cushionBase, cushionProjection, cushionWeights } from '../../lib/cashflow.js';
import { seriesColor } from '../../lib/colors.js';
import { formatPLN } from '../../lib/format.js';
import { BetaBadge, Card, Field, Input, Segmented, Slider } from '../ui.jsx';

const pct1 = (v) => (v === null || !Number.isFinite(v) ? '—' : `${(v * 100).toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
const pp = (v) => `${v > 0 ? '+' : ''}${v.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} pp`;
const beta = (text) => (
  <>
    {text}
    <BetaBadge />
  </>
);
const useGoal = () => {
  const { state, actions } = useApp();
  const goal = state.settings.safeGoal || {};
  return [goal, (patch) => actions.updateSettings({ safeGoal: { ...goal, ...patch } })];
};

// Struktura i wagi poduszki (BETA): docelowy udział obligacji (reszta – konto oszczędnościowe), obecny udział,
// pasek proporcji, odchylenie w pp i w zł (ile brakuje / ile nadwyżki w każdym składniku przy obecnej sumie).
export function CushionWeightsCard() {
  const { state, isDark } = useApp();
  const [goal, set] = useGoal();
  const today = isoDay(new Date());
  const base = useMemo(() => cushionBase(state, today), [state, today]);
  const hasTarget = goal.weightBonds !== undefined && goal.weightBonds !== '' && goal.weightBonds !== null;
  const wTarget = hasTarget ? Number(goal.weightBonds) : 50;
  const w = cushionWeights(base, hasTarget ? wTarget : null);
  const cB = seriesColor(2, isDark);
  const cS = seriesColor(3, isDark);
  const gapText = (gap) => (Math.abs(gap) < 0.5 ? 'w proporcji' : gap > 0 ? `brakuje ${formatPLN(gap)}` : `nadwyżka ${formatPLN(-gap)}`);
  const summary = hasTarget ? `cel ${wTarget}% / ${100 - wTarget}% · teraz ${pct1(w.current)} obligacji${w.deviationPp !== null ? ` (${pp(w.deviationPp)})` : ''}` : `teraz ${pct1(w.current)} obligacji / ${w.current === null ? '—' : pct1(1 - w.current)} KO · bez wag`;

  return (
    <Card collapsible storageKey="fintrack-safe-open-weights" title={beta('Struktura i wagi poduszki')} summary={summary} subtitle="Docelowy podział: obligacje skarbowe vs konto oszczędnościowe (suma 100%)" icon={PieChart}>
      <Slider label="Obligacje skarbowe – udział docelowy" value={wTarget} onChange={(v) => set({ weightBonds: Math.round(v) })} min={0} max={100} step={5} unit="%" hint={`Konto oszczędnościowe: ${100 - wTarget}%`} accent={cB} />
      {!hasTarget && <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">Wagi nie są jeszcze ustawione – przesuń suwak, aby zapisać cel.</p>}
      {hasTarget && (
        <button type="button" onClick={() => set({ weightBonds: '' })} className="mt-1 text-[11px] text-blue-600 hover:underline dark:text-blue-400">
          Usuń wagi docelowe
        </button>
      )}

      <div className="mt-4 space-y-2">
        <div className="flex justify-between text-[11px] text-stone-500 dark:text-stone-400">
          <span>Teraz</span>
          <span className="tabular">{formatPLN(w.total)}</span>
        </div>
        <div className="flex h-3.5 overflow-hidden rounded-full bg-stone-100 dark:bg-white/[0.07]" role="img" aria-label={`Obecna proporcja: obligacje ${pct1(w.current)}`}>
          {w.total > 0 && (
            <>
              <div style={{ width: `${(w.current || 0) * 100}%`, background: cB }} />
              <div style={{ width: `${(1 - (w.current || 0)) * 100}%`, background: cS }} />
            </>
          )}
        </div>
        {hasTarget && (
          <>
            <div className="text-[11px] text-stone-500 dark:text-stone-400">Cel</div>
            <div className="flex h-2 overflow-hidden rounded-full opacity-70" aria-hidden>
              <div style={{ width: `${wTarget}%`, background: cB }} />
              <div style={{ width: `${100 - wTarget}%`, background: cS }} />
            </div>
          </>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {[
          { key: 'bonds', label: 'Obligacje skarbowe', color: cB, value: base.bonds, share: w.current, target: hasTarget ? wTarget / 100 : null, gap: w.bondsGap },
          { key: 'savings', label: 'Konto oszczędnościowe', color: cS, value: base.savings, share: w.current === null ? null : 1 - w.current, target: hasTarget ? 1 - wTarget / 100 : null, gap: w.savingsGap },
        ].map((x) => (
          <div key={x.key} className="min-w-0 rounded-xl bg-stone-50 px-3 py-2.5 dark:bg-white/[0.03]">
            <div className="flex items-center gap-1.5 text-[11px] text-stone-500 dark:text-stone-400">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: x.color }} /> {x.label}
            </div>
            <div className="text-base font-semibold tabular">{formatPLN(x.value)}</div>
            <div className="text-[11px] text-stone-500 tabular dark:text-stone-400">
              udział {pct1(x.share)}
              {x.target !== null && (
                <>
                  {' '}
                  · cel {pct1(x.target)} · <span className={Math.abs(x.gap) < 0.5 ? 'text-emerald-600 dark:text-emerald-400' : x.gap > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}>{gapText(x.gap)}</span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      {hasTarget && w.deviationPp !== null && <p className="mt-2 text-[11px] text-stone-500 dark:text-stone-400">Odchylenie obligacji od celu: {pp(w.deviationPp)}. Dopłaty w prognozie są dzielone według wag docelowych.</p>}
    </Card>
  );
}

// Wzrost poduszki (BETA): dopłata (zł / mies.) albo % rocznie ponad odsetki; wartość rośnie NAJWYŻEJ do celu – po
// osiągnięciu progu kapitał stoi, a odsetki są liczone od kwoty celu (ta sama reguła w Cash Flow Forecast).
export function CushionGrowthCard() {
  const { state } = useApp();
  const [goal, set] = useGoal();
  const today = isoDay(new Date());
  const base = useMemo(() => cushionBase(state, today), [state, today]);
  const growthMode = goal.growthMode === 'pct' ? 'pct' : 'amount';
  const years = [5, 10].includes(Number(goal.projectionYears)) ? Number(goal.projectionYears) : 5;
  const target = Number(goal.target) || 0;
  const proj = cushionProjection({
    ...base,
    target,
    monthlyContribution: growthMode === 'amount' ? Number(goal.monthlyContribution) || 0 : 0,
    growthPct: growthMode === 'pct' ? Number(goal.growthPct) || 0 : 0,
    weightBonds: goal.weightBonds,
    years,
  });
  const start = base.bonds + base.savings;
  const capYear = proj.capReachedMonth === null ? null : proj.capReachedMonth === 0 ? 0 : Math.ceil(proj.capReachedMonth / 12);
  const growthText = growthMode === 'amount' ? `${formatPLN(Number(goal.monthlyContribution) || 0)} / mies.` : `${(Number(goal.growthPct) || 0).toLocaleString('pl-PL')}% rocznie`;
  const summary = `${growthText} · ${target > 0 ? (capYear === 0 ? 'cel osiągnięty – kapitał stoi' : capYear ? `cel w ${capYear}. roku` : `za ${years} lat ${formatPLN(proj.rows.at(-1).value)}`) : 'bez celu (brak limitu)'}`;

  return (
    <Card collapsible storageKey="fintrack-safe-open-growth" title={beta('Wzrost poduszki i limit do celu')} summary={summary} subtitle="Założony roczny wzrost ponad odsetki – wartość rośnie najwyżej do celu" icon={TrendingUp}>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="mb-1 text-[11px] font-medium text-stone-500 dark:text-stone-400">Wzrost ponad odsetki</div>
          <Segmented size="sm" value={growthMode} onChange={(v) => set({ growthMode: v })} ariaLabel="Rodzaj wzrostu poduszki" options={[{ value: 'amount', label: 'Kwota / mies.' }, { value: 'pct', label: '% rocznie' }]} />
        </div>
        {growthMode === 'amount' ? (
          <Field label="Dopłata / mies. (zł)" className="w-36">
            <Input type="number" inputMode="decimal" min="0" step="100" placeholder="0" value={goal.monthlyContribution ?? ''} onChange={(e) => set({ monthlyContribution: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) })} aria-label="Dopłata do poduszki miesięcznie" />
          </Field>
        ) : (
          <Field label="Wzrost (% rocznie)" className="w-36">
            <Input type="number" inputMode="decimal" min="0" max="100" step="0.5" placeholder="np. 5" value={goal.growthPct ?? ''} onChange={(e) => set({ growthPct: e.target.value === '' ? '' : Math.min(100, Math.max(0, Number(e.target.value))) })} aria-label="Roczny wzrost poduszki w procentach" />
          </Field>
        )}
        <div>
          <div className="mb-1 text-[11px] font-medium text-stone-500 dark:text-stone-400">Horyzont</div>
          <Segmented size="sm" value={String(years)} onChange={(v) => set({ projectionYears: Number(v) })} ariaLabel="Horyzont prognozy poduszki" options={[{ value: '5', label: '5 lat' }, { value: '10', label: '10 lat' }]} />
        </div>
      </div>

      <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
        <Lock size={13} className="mt-px shrink-0" />
        {target > 0 ? (
          <span>
            Twardy limit: wartość poduszki rośnie najwyżej do <strong className="tabular">{formatPLN(proj.cap)}</strong>
            {proj.cap > target ? ' (obecna wartość jest już powyżej celu – nie rośnie dalej)' : ' (cel z karty powyżej)'}. Po osiągnięciu progu kapitał stoi, odsetki – także w Cash Flow Forecast – liczone są od kwoty celu, a ich nadwyżka ponad próg trafia do akcji (kolumna „Do akcji”).
          </span>
        ) : (
          <span>Ustaw cel poduszki w karcie „Cel poduszki finansowej”, aby włączyć limit wzrostu.</span>
        )}
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm tabular" aria-label="Prognoza wartości poduszki">
          <thead>
            <tr className="text-left text-[11px] text-stone-500 dark:text-stone-400">
              <th className="py-1.5 font-medium">Rok</th>
              <th className="py-1.5 text-right font-medium">Wartość</th>
              <th className="py-1.5 text-right font-medium">Odsetki netto</th>
              <th className="py-1.5 text-right font-medium">Dopłaty</th>
              {target > 0 && <th className="py-1.5 text-right font-medium">Do akcji</th>}
              {target > 0 && <th className="py-1.5 text-right font-medium">Cel</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-white/5">
            <tr className="text-stone-500 dark:text-stone-400">
              <td className="py-1.5">Teraz</td>
              <td className="py-1.5 text-right">{formatPLN(start)}</td>
              <td className="py-1.5 text-right">{formatPLN(base.bondsIncome + base.savingsIncome)}</td>
              <td className="py-1.5 text-right">—</td>
              {target > 0 && <td className="py-1.5 text-right">—</td>}
              {target > 0 && <td className="py-1.5 text-right">{pct1(start / target)}</td>}
            </tr>
            {proj.rows.map((r) => (
              <tr key={r.year} className={r.capped && target > 0 ? 'text-emerald-700 dark:text-emerald-400' : ''}>
                <td className="py-1.5">{r.year}</td>
                <td className="py-1.5 text-right font-semibold">
                  {formatPLN(r.value)}
                  {r.capped && target > 0 && <Lock size={11} className="ml-1 inline" aria-label="na progu celu" />}
                </td>
                <td className="py-1.5 text-right">{formatPLN(r.income)}</td>
                <td className="py-1.5 text-right">{formatPLN(r.contributed)}</td>
                {target > 0 && <td className="py-1.5 text-right">{r.overflow > 0.005 ? formatPLN(r.overflow) : '—'}</td>}
                {target > 0 && <td className="py-1.5 text-right">{pct1(Math.min(1, r.value / target))}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-stone-500 dark:text-stone-400">
        Odsetki netto wg bieżącego oprocentowania: obligacje {pct1(base.bondsRate)}, KO {pct1(base.savingsRate)} rocznie; zostają w poduszce (do limitu). Dopłaty dzielone wg wag docelowych (bez wag – wg obecnych proporcji).
      </p>
    </Card>
  );
}
