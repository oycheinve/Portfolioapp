import { useMemo } from 'react';
import { CalendarCheck, Flag, Flame, Settings2, SlidersHorizontal, Target } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { SCENARIOS, coastFireNumber, fireProgress, requiredContribution, runScenarios } from '../lib/fire.js';
import { dividendKpis } from '../lib/dividends.js';
import { savingsProjection } from '../lib/savings.js';
import { getCpiTable, valueBond } from '../lib/bonds.js';
import { isoDay, livePriceLookup, otherAssetsValue, valuePortfolio } from '../lib/engine.js';
import { bondBelkaRate } from '../lib/tax.js';
import { seriesColor } from '../lib/colors.js';
import { formatNumber, formatPLN, formatPercent } from '../lib/format.js';
import { Button, Card, Segmented, Slider, Toggle } from '../components/ui.jsx';
import FireProjectionChart from '../components/fire/FireProjectionChart.jsx';
import { PassiveIncomeCard } from '../components/bonds/SavingsSection.jsx';

const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];

function formatWhen(r) {
  return r ? `${MONTHS[r.month]} ${r.year}` : 'po 2100';
}

// Bieżący roczny dochód pasywny netto: dywidendy (forward), obligacje (bieżące oprocentowanie), oszczędności
export function currentPassiveIncome(state) {
  const today = isoDay(new Date());
  const div = dividendKpis(state, today).forwardNet;
  const cpi = getCpiTable(state.settings);
  const accountsById = Object.fromEntries(state.accounts.map((a) => [a.id, a]));
  let bonds = 0;
  for (const b of state.bonds) {
    const belka = bondBelkaRate(b, accountsById[b.accountId]);
    const v = valueBond(b, today, belka, cpi);
    if (!v.matured) bonds += v.nominal * v.currentRate * (1 - belka);
  }
  const savings = state.accounts.filter((a) => a.type === 'SAVINGS').reduce((s, a) => s + savingsProjection(state, a, today).yearlyNet, 0);
  return { total: div + bonds + savings, dividends: div, bonds, savings };
}

export default function FireView({ onNavigate }) {
  const { state, actions, isDark } = useApp();
  const fire = state.settings.fire;
  const setFire = (patch) => actions.updateSettings({ fire: { ...fire, ...patch } });

  const current = useMemo(() => {
    const v = valuePortfolio(state, { asOf: isoDay(new Date()), accountIds: null, priceLookup: livePriceLookup(state) });
    const other = fire.includeOtherAssets ? otherAssetsValue(state).totalValue : 0;
    const income = currentPassiveIncome(state);
    return { value: v.totals.total + other, portfolio: v.totals.total, other, income };
  }, [state, fire.includeOtherAssets]);

  const base = useMemo(
    () => ({
      startValue: current.value,
      startAnnualIncome: current.income.total,
      monthlyContribution: Number(fire.monthlyContribution) || 0,
      contributionIndexed: !!fire.contributionIndexed,
      dividendYield: (Number(fire.dividendYield) || 0) / 100,
      dgr: (Number(fire.dgr) || 0) / 100,
      inflation: (Number(fire.inflation) || 0) / 100,
    }),
    [current, fire],
  );

  const scenarios = useMemo(() => runScenarios(base, fire), [base, fire]);
  const required = useMemo(() => requiredContribution(base, fire), [base, fire]);
  const coast = coastFireNumber(fire);
  const progress = fireProgress({ value: current.value, monthlyIncome: current.income.total / 12 }, fire);
  const sel = scenarios[fire.scenario];
  const onTrack = sel.reached && sel.reached.year <= fire.targetYear;
  const real = fire.realValues !== false;

  const valueColor = seriesColor(0, isDark);
  const incomeColor = seriesColor(4, isDark);
  const bandColor = isDark ? '#5f5e5a' : '#a3a29b';
  const atTarget = sel.atTarget;
  const mainPct = Math.min(1, progress.main);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 1. Dane wejściowe */}
      <Card
        title="Parametry symulacji FIRE"
        subtitle={`Cel: ${formatPLN(fire.targetMonthlyIncome)} / mies. i ${formatPLN(fire.targetNetWorth, { compact: true })} majątku do ${fire.targetYear} (w dzisiejszych zł)`}
        icon={SlidersHorizontal}
        actions={
          onNavigate && (
            <Button size="sm" icon={Settings2} onClick={() => onNavigate('settings')} title="Cele FIRE ustawisz w zakładce Ustawienia">
              Cele w ustawieniach
            </Button>
          )
        }
      >
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
              <Slider
                label="Miesięczna wpłata własna"
                value={fire.monthlyContribution}
                onChange={(v) => setFire({ monthlyContribution: v })}
                min={0}
                max={20000}
                step={100}
                format={(v) => formatPLN(v)}
                accent={valueColor}
              />
              <Toggle checked={!!fire.contributionIndexed} onChange={(v) => setFire({ contributionIndexed: v })} label="Wpłata rośnie co roku o inflację" />
              <div className="space-y-2">
                <div className="text-xs font-medium text-stone-600 dark:text-stone-400">Scenariusz</div>
                <Segmented
                  size="sm"
                  value={fire.scenario}
                  onChange={(v) => setFire({ scenario: v })}
                  ariaLabel="Scenariusz"
                  options={Object.values(SCENARIOS).map((s) => ({ value: s.id, label: s.label }))}
                />
              </div>
              {Object.values(SCENARIOS).map((s) => (
                <Slider
                  key={s.id}
                  label={`Roczna stopa zwrotu – ${s.label.toLowerCase()}`}
                  value={fire.returns[s.id]}
                  onChange={(v) => setFire({ returns: { ...fire.returns, [s.id]: v } })}
                  min={0}
                  max={15}
                  step={0.5}
                  format={(v) => `${formatNumber(v, 1)}%`}
                  accent={s.id === fire.scenario ? valueColor : bandColor}
                />
              ))}
              <Slider
                label="Stopa dywidendy (netto)"
                value={fire.dividendYield}
                onChange={(v) => setFire({ dividendYield: v })}
                min={0}
                max={10}
                step={0.1}
                format={(v) => `${formatNumber(v, 1)}%`}
                hint="Dochód z nowych wpłat i reinwestowanych dywidend"
                accent={incomeColor}
              />
              <Slider label="Wzrost dywidendy (DGR)" value={fire.dgr} onChange={(v) => setFire({ dgr: v })} min={0} max={15} step={0.5} format={(v) => `${formatNumber(v, 1)}%`} accent={incomeColor} />
              <Slider
                label="Inflacja (przeliczenie na kwoty realne)"
                value={fire.inflation}
                onChange={(v) => setFire({ inflation: v })}
                min={0}
                max={10}
                step={0.1}
                format={(v) => `${formatNumber(v, 1)}%`}
                accent={seriesColor(7, isDark)}
              />
            </div>
      </Card>

      {/* 2. Wykres wynikowy – do momentu osiągnięcia celu FIRE */}
      <FireProjectionChart scenarios={scenarios} />

      {/* 3. Wyniki liczbowe */}
      {/* Wskaźnik bliskości FIRE */}
      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6 dark:border-white/10 dark:bg-neutral-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
              <Flame size={16} className="text-orange-500" /> Niezależność finansowa · cel {fire.targetYear}
            </div>
            <div className="mt-1 text-4xl font-semibold tracking-tight tabular sm:text-5xl">{formatPercent(progress.main, { digits: 1 })}</div>
            <div className="text-sm text-stone-500 dark:text-stone-400">
              {fire.criterion === 'INCOME' ? 'celu dochodu pasywnego' : fire.criterion === 'NETWORTH' ? 'celu majątkowego' : 'drogi do FIRE (słabszy z dwóch celów)'}
            </div>
          </div>
          <div className={`rounded-xl px-4 py-3 text-right ${onTrack ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200' : 'bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200'}`}>
            <div className="flex items-center justify-end gap-1.5 text-xs">
              <CalendarCheck size={14} /> Prognozowana data FIRE ({SCENARIOS[fire.scenario].label.toLowerCase()})
            </div>
            <div className="text-2xl font-semibold tabular">{formatWhen(sel.reached)}</div>
            <div className="text-xs">
              {sel.reached ? (onTrack ? `${fire.targetYear - sel.reached.year} lat przed celem` : `${sel.reached.year - fire.targetYear} lat po celu`) : 'cel poza horyzontem symulacji'}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="relative h-5 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-white/5" role="progressbar" aria-valuenow={Math.round(mainPct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Postęp do FIRE">
            <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-emerald-500 transition-all" style={{ width: `${mainPct * 100}%` }} />
            {[0.25, 0.5, 0.75].map((m) => (
              <span key={m} className="absolute top-0 h-full w-px bg-white/70 dark:bg-neutral-900/70" style={{ left: `${m * 100}%` }} />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-stone-500 tabular">
            <span>0%</span>
            <span>25%</span>
            <span>50%</span>
            <span>75%</span>
            <span>FIRE</span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <SubProgress
            icon={Target}
            label="Dochód pasywny / mies."
            current={formatPLN(current.income.total / 12)}
            target={formatPLN(fire.targetMonthlyIncome)}
            value={progress.income}
            color={incomeColor}
            hint={`dywidendy ${formatPLN(current.income.dividends / 12)} · obligacje ${formatPLN(current.income.bonds / 12)} · oszczędności ${formatPLN(current.income.savings / 12)}`}
          />
          <SubProgress
            icon={Flag}
            label="Majątek"
            current={formatPLN(current.value)}
            target={formatPLN(fire.targetNetWorth)}
            value={progress.worth}
            color={valueColor}
            hint={fire.includeOtherAssets ? `w tym nieruchomości/inne ${formatPLN(current.other)}` : 'inwestycje i gotówka (bez nieruchomości)'}
          />
        </div>
      </section>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label={`Majątek w ${fire.targetYear}`} value={formatPLN(real ? atTarget?.valueReal : atTarget?.value, { compact: true })} sub={real ? 'w dzisiejszych zł' : 'nominalnie'} />
            <Tile label={`Dochód pasywny ${fire.targetYear}`} value={formatPLN(real ? atTarget?.monthlyIncomeReal : atTarget?.monthlyIncome)} sub={real ? 'miesięcznie, w dzisiejszych zł' : 'miesięcznie, nominalnie'} />
            <Tile label={`Wpłata na cel ${fire.targetYear}`} value={required === null ? 'nieosiągalne' : formatPLN(required)} sub={required !== null && required <= fire.monthlyContribution ? 'miesięcznie – obecna wpłata wystarcza' : 'miesięcznie, wybrany scenariusz'} tone={required !== null && required <= fire.monthlyContribution ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'} />
            <Tile label="Coast FIRE" value={formatPLN(coast, { compact: true })} sub={current.value >= coast ? 'osiągnięte – cel majątku bez dalszych wpłat' : `brakuje ${formatPLN(coast - current.value, { compact: true })}`} />
          </div>

          <Card title="Porównanie scenariuszy" icon={CalendarCheck} bodyClassName="p-0 sm:p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-stone-100 text-left text-xs text-stone-500 dark:border-white/5 dark:text-stone-400">
                    <th className="px-4 py-2 font-medium sm:px-5">Scenariusz</th>
                    <th className="px-3 py-2 text-right font-medium">Stopa</th>
                    <th className="px-3 py-2 text-right font-medium">FIRE</th>
                    <th className="px-3 py-2 text-right font-medium">Majątek {fire.targetYear} (realnie)</th>
                    <th className="px-4 py-2 text-right font-medium sm:px-5">Dochód / mies. (realnie)</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {Object.values(SCENARIOS).map((s) => {
                    const r = scenarios[s.id];
                    const ok = r.reached && r.reached.year <= fire.targetYear;
                    return (
                      <tr key={s.id} className={`border-b border-stone-100 last:border-0 dark:border-white/5 ${s.id === fire.scenario ? 'bg-blue-50/60 dark:bg-blue-500/5' : ''}`}>
                        <td className="px-4 py-2 font-medium sm:px-5">{s.label}</td>
                        <td className="px-3 py-2 text-right">{formatNumber(fire.returns[s.id], 1)}%</td>
                        <td className={`px-3 py-2 text-right font-semibold ${ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>{formatWhen(r.reached)}</td>
                        <td className="px-3 py-2 text-right">{formatPLN(r.atTarget?.valueReal, { compact: true })}</td>
                        <td className="px-4 py-2 text-right sm:px-5">{formatPLN(r.atTarget?.monthlyIncomeReal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-2.5 text-[11px] text-stone-500 sm:px-5 dark:text-stone-500">
              Model: majątek rośnie o stopę zwrotu + wpłaty; dochód pasywny = obecny dochód rosnący o DGR + stopa dywidendy od nowych wpłat i reinwestowanych dywidend. Kwoty realne dyskontowane inflacją. To uproszczona symulacja, nie prognoza.
            </p>
          </Card>

      {/* Dochód pasywny – bieżąca baza dla celu FIRE */}
      <PassiveIncomeCard />
    </div>
  );
}

function SubProgress({ icon: Icon, label, current, target, value, color, hint }) {
  return (
    <div className="min-w-0 rounded-xl border border-stone-100 bg-stone-50 p-3 dark:border-white/5 dark:bg-white/[0.03]">
      <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
        <Icon size={13} /> {label}
        <span className="ml-auto font-semibold text-stone-800 tabular dark:text-stone-200">{formatPercent(value, { digits: 1 })}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, value * 100)}%`, background: color }} />
      </div>
      <div className="mt-1.5 flex justify-between text-xs tabular">
        <span className="font-medium">{current}</span>
        <span className="text-stone-500">cel {target}</span>
      </div>
      {hint && <div className="mt-0.5 truncate text-[11px] text-stone-500">{hint}</div>}
    </div>
  );
}

function Tile({ label, value, sub, tone = '' }) {
  return (
    <div className="min-w-0 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm sm:p-4 dark:border-white/10 dark:bg-neutral-900">
      <div className="truncate text-[11px] text-stone-500 sm:text-xs dark:text-stone-400">{label}</div>
      <div className={`mt-1 truncate text-base font-semibold tabular sm:text-lg ${tone}`}>{value}</div>
      {sub && <div className="truncate text-[11px] text-stone-500">{sub}</div>}
    </div>
  );
}
