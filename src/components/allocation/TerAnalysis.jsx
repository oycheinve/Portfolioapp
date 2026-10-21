import { Percent } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { seriesColor } from '../../lib/colors.js';
import { formatPLN, formatPercent } from '../../lib/format.js';
import { Card, EmptyState } from '../ui.jsx';

const HORIZON_YEARS = 10;

export default function TerAnalysis({ analysis }) {
  const { state, actions, isDark } = useApp();
  const etfs = analysis.instruments.filter((r) => r.instrument.kind === 'ETF' && r.value > 0);
  const etfValue = etfs.reduce((s, r) => s + r.value, 0);
  const rows = etfs
    .map((r) => {
      const ter = (Number(r.instrument.ter) || 0) / 100;
      return {
        ...r,
        ter,
        annualCost: r.value * ter,
        horizonCost: r.value * (1 - Math.pow(1 - ter, HORIZON_YEARS)),
        shareOfEtf: etfValue > 0 ? r.value / etfValue : 0,
      };
    })
    .sort((a, b) => b.annualCost - a.annualCost);

  const annualCost = rows.reduce((s, r) => s + r.annualCost, 0);
  const horizonCost = rows.reduce((s, r) => s + r.horizonCost, 0);
  const terEtf = etfValue > 0 ? annualCost / etfValue : 0;
  const terSleeve = analysis.sleeveValue > 0 ? annualCost / analysis.sleeveValue : 0;
  const terPortfolio = analysis.total > 0 ? annualCost / analysis.total : 0;
  const maxCost = Math.max(1, ...rows.map((r) => r.annualCost));

  // TER po osiągnięciu wag docelowych (akcje = 0%)
  const targetTer = analysis.instrumentTargetsSet
    ? analysis.instruments.reduce((s, r) => s + r.target * ((Number(r.instrument.ter) || 0) / 100) * (r.instrument.kind === 'ETF' ? 1 : 0), 0)
    : null;

  const updateTer = (inst, value) => actions.upsert('instruments', { ...inst, ter: Math.max(0, Number(value) || 0) });
  const barColor = seriesColor(1, isDark);

  return (
    <Card title="Analiza kosztów TER" subtitle="Roczny koszt utrzymania ETF przy obecnej wycenie" icon={Percent} bodyClassName="p-0 sm:p-0">
      {rows.length === 0 ? (
        <EmptyState icon={Percent} title="Brak ETF w wybranym zakresie kont" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 border-b border-stone-100 px-4 py-4 sm:grid-cols-4 sm:px-5 dark:border-white/5">
            <Kpi label="Ważony TER (ETF)" value={formatPercent(terEtf, { digits: 3 })} />
            <Kpi label="Ważony TER (akcje + ETF)" value={formatPercent(terSleeve, { digits: 3 })} sub={`cały portfel: ${formatPercent(terPortfolio, { digits: 3 })}`} />
            <Kpi label="Roczny koszt" value={formatPLN(annualCost)} sub={`${formatPLN(annualCost / 12)} / mies.`} />
            <Kpi
              label={`Koszt w ${HORIZON_YEARS} lat`}
              value={formatPLN(horizonCost)}
              sub={targetTer !== null ? `TER przy wagach docelowych: ${formatPercent(targetTer, { digits: 3 })}` : 'bez wzrostu wartości'}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-left text-xs text-stone-500 dark:border-white/5 dark:text-stone-400">
                  <th className="px-4 py-2 font-medium sm:px-5">ETF</th>
                  <th className="px-3 py-2 text-right font-medium">Wartość</th>
                  <th className="px-3 py-2 text-right font-medium">Udział w ETF</th>
                  <th className="px-3 py-2 text-right font-medium">TER (%)</th>
                  <th className="px-3 py-2 font-medium">Roczny koszt</th>
                  <th className="px-4 py-2 text-right font-medium sm:px-5">{HORIZON_YEARS} lat</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-stone-100 last:border-0 dark:border-white/5">
                    <td className="px-4 py-2 sm:px-5">
                      <div className="font-medium">{r.instrument.ticker}</div>
                      <div className="max-w-[16rem] truncate text-xs text-stone-500 dark:text-stone-400">{r.instrument.name}</div>
                    </td>
                    <td className="px-3 py-2 text-right">{formatPLN(r.value)}</td>
                    <td className="px-3 py-2 text-right text-stone-500 dark:text-stone-400">{formatPercent(r.shareOfEtf, { digits: 1 })}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        aria-label={`TER ${r.instrument.ticker}`}
                        value={r.instrument.ter ?? 0}
                        onChange={(e) => updateTer(r.instrument, e.target.value)}
                        className="h-8 w-20 rounded-md border border-stone-200 bg-white px-2 text-right text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-neutral-800"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 rounded-full bg-stone-100 dark:bg-white/5">
                          <div className="h-full rounded-full" style={{ width: `${(r.annualCost / maxCost) * 100}%`, background: barColor }} />
                        </div>
                        <span className="font-medium">{formatPLN(r.annualCost)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right text-stone-500 sm:px-5 dark:text-stone-400">{formatPLN(r.horizonCost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-stone-200 font-semibold dark:border-white/10">
                  <td className="px-4 py-2.5 sm:px-5">Razem / średnia ważona</td>
                  <td className="px-3 py-2.5 text-right tabular">{formatPLN(etfValue)}</td>
                  <td className="px-3 py-2.5 text-right tabular">100%</td>
                  <td className="px-3 py-2.5 text-right tabular">{formatPercent(terEtf, { digits: 3 })}</td>
                  <td className="px-3 py-2.5 tabular">{formatPLN(annualCost)}</td>
                  <td className="px-4 py-2.5 text-right tabular sm:px-5">{formatPLN(horizonCost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="px-4 py-2.5 text-[11px] text-stone-500 sm:px-5 dark:text-stone-500">
            TER jest pobierany przez fundusz z wartości jednostki – nie zobaczysz go jako osobnej opłaty. Koszt {HORIZON_YEARS}-letni liczony przy stałej wartości pozycji. Wartości TER można edytować w tabeli.
          </p>
        </>
      )}
    </Card>
  );
}

function Kpi({ label, value, sub }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">{label}</div>
      <div className="truncate text-lg font-semibold tabular">{value}</div>
      {sub && <div className="truncate text-[11px] text-stone-500 dark:text-stone-500">{sub}</div>}
    </div>
  );
}
