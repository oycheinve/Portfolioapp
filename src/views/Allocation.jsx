import { useMemo } from 'react';
import { AlertTriangle, BellRing, Layers, ListChecks, SlidersHorizontal } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { computeAllocation, unitPricePLN } from '../lib/allocation.js';
import { assetClassColor } from '../lib/colors.js';
import { formatPLN } from '../lib/format.js';
import { Card, Field, Input } from '../components/ui.jsx';
import { AccountFilterSelect } from '../components/dashboard/PortfolioStatsCard.jsx';
import AllocationDonut, { instrumentColorMap } from '../components/allocation/AllocationDonut.jsx';
import DeviationList, { formatDeviation } from '../components/allocation/DeviationList.jsx';
import ContributionCalculator from '../components/allocation/ContributionCalculator.jsx';
import TerAnalysis from '../components/allocation/TerAnalysis.jsx';

// Skaluje wagi do sumy 100% (2 miejsca po przecinku, reszta z zaokrągleń trafia do największej wagi)
function normalizeTo100(targets, decimals = 2) {
  const entries = Object.entries(targets).filter(([, v]) => Number(v) > 0);
  const sum = entries.reduce((s, [, v]) => s + Number(v), 0);
  if (sum <= 0) return targets;
  const f = 10 ** decimals;
  const out = Object.fromEntries(Object.keys(targets).map((k) => [k, 0]));
  for (const [k, v] of entries) out[k] = Math.round((Number(v) / sum) * 100 * f) / f;
  const diff = Math.round((100 - Object.values(out).reduce((s, v) => s + v, 0)) * f) / f;
  if (diff !== 0) {
    const largest = entries.reduce((m, e) => (Number(e[1]) > Number(m[1]) ? e : m))[0];
    out[largest] = Math.round((out[largest] + diff) * f) / f;
  }
  return out;
}

export default function AllocationView() {
  const { state, actions, isDark } = useApp();
  const alloc = state.settings.allocation;
  const analysis = useMemo(() => computeAllocation(state), [state]);
  const setAlloc = (patch) => actions.updateSettings({ allocation: { ...alloc, ...patch } });

  // Wszystkie instrumenty – także nieposiadane, aby móc nadać im wagę docelową
  const instrumentRows = useMemo(() => {
    const byKey = Object.fromEntries(analysis.instruments.map((r) => [r.key, r]));
    const rows = state.instruments.map(
      (inst) =>
        byKey[inst.id] || {
          key: inst.id,
          label: inst.ticker,
          value: 0,
          weight: 0,
          target: (Number(alloc.instrumentTargets?.[inst.id]) || 0) / 100,
          devPP: -(Number(alloc.instrumentTargets?.[inst.id]) || 0),
          devPLN: -((Number(alloc.instrumentTargets?.[inst.id]) || 0) / 100) * analysis.sleeveValue,
          instrument: inst,
          price: unitPricePLN(state, inst),
        },
    );
    return rows.map((r) => ({ ...r, sub: `${r.instrument.kind === 'ETF' ? 'ETF' : 'Akcja'} · ${r.instrument.name}` })).sort((a, b) => b.value - a.value || b.target - a.target);
  }, [analysis, state, alloc.instrumentTargets]);

  const instrumentColors = useMemo(() => instrumentColorMap(state, isDark), [state, isDark]);

  const classTargets = alloc.classTargets || {};
  const instrumentTargets = alloc.instrumentTargets || {};

  const currentAsTargets = (rows) => normalizeTo100(Object.fromEntries(rows.map((r) => [r.key, Math.round(r.weight * 1000) / 10])), 1);

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card title="Zakres i próg alertu" subtitle="Wagi liczone dla wybranych kont · nieruchomości nie są uwzględniane" icon={SlidersHorizontal}>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Zakres kont">
            <AccountFilterSelect value={alloc.scope || 'ALL'} onChange={(scope) => setAlloc({ scope })} />
          </Field>
          <Field label="Próg alertu odchylenia (pp)">
            <Input
              type="number"
              min="0.5"
              step="0.5"
              value={alloc.driftThreshold}
              onChange={(e) => setAlloc({ driftThreshold: Math.max(0, Number(e.target.value) || 0) })}
              className="w-28"
            />
          </Field>
          <div className="ml-auto grid grid-cols-2 gap-6 text-sm">
            <div>
              <div className="text-xs text-stone-500 dark:text-stone-400">Wartość portfela</div>
              <div className="font-semibold tabular">{formatPLN(analysis.total)}</div>
            </div>
            <div>
              <div className="text-xs text-stone-500 dark:text-stone-400">Część akcje + ETF</div>
              <div className="font-semibold tabular">{formatPLN(analysis.sleeveValue)}</div>
            </div>
          </div>
        </div>
      </Card>

      <AlertsBanner analysis={analysis} />

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-2">
        <AllocationDonut analysis={analysis} />
        <DeviationList
          title="Klasy aktywów – wagi docelowe"
          subtitle="Udział w całym portfelu (suma 100%)"
          icon={Layers}
          rows={analysis.classes}
          colorFor={(r) => assetClassColor(r.key, isDark)}
          targets={classTargets}
          threshold={analysis.threshold}
          onTargetChange={(key, v) => setAlloc({ classTargets: { ...classTargets, [key]: v } })}
          onNormalize={() => setAlloc({ classTargets: normalizeTo100(classTargets) })}
          onSetCurrent={() => setAlloc({ classTargets: currentAsTargets(analysis.classes) })}
          onClear={() => setAlloc({ classTargets: Object.fromEntries(Object.keys(classTargets).map((k) => [k, 0])) })}
          emptyText="Brak danych."
        />
      </div>

      <DeviationList
        title="Akcje i ETF – wagi docelowe"
        subtitle="Udział instrumentu w części akcje + ETF (suma 100%) · podstawa kalkulatora dopłat"
        icon={ListChecks}
        rows={instrumentRows}
        colorFor={(r) => instrumentColors[r.key]}
        targets={instrumentTargets}
        threshold={analysis.threshold}
        onTargetChange={(key, v) => setAlloc({ instrumentTargets: { ...instrumentTargets, [key]: v } })}
        onNormalize={() => setAlloc({ instrumentTargets: normalizeTo100(instrumentTargets) })}
        onSetCurrent={() => setAlloc({ instrumentTargets: currentAsTargets(instrumentRows.filter((r) => r.value > 0)) })}
        onClear={() => setAlloc({ instrumentTargets: {} })}
        emptyText="Brak instrumentów – dodaj transakcje lub instrumenty."
      />

      <ContributionCalculator analysis={analysis} />
      <TerAnalysis analysis={analysis} />
    </div>
  );
}

function AlertsBanner({ analysis }) {
  if (!analysis.classTargetsSet && !analysis.instrumentTargetsSet) return null;
  if (analysis.alerts.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
        <BellRing size={16} /> Wszystkie pozycje mieszczą się w progu ±{analysis.threshold} pp od celu.
      </div>
    );
  }
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle size={16} /> {analysis.alerts.length} {analysis.alerts.length === 1 ? 'pozycja przekracza' : 'pozycje przekraczają'} próg odchylenia {analysis.threshold} pp
      </div>
      <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
        {analysis.alerts.map((a) => {
          const { pp, pln } = formatDeviation(a.devPP, a.devPLN);
          return (
            <li key={`${a.level}-${a.key}`} className="tabular">
              <span className="font-medium">{a.label}</span> <span className="opacity-70">({a.level === 'class' ? 'klasa' : 'instrument'})</span>: {a.devPP < 0 ? 'niedowaga' : 'nadwaga'} {pp} [{pln}]
            </li>
          );
        })}
      </ul>
    </div>
  );
}
