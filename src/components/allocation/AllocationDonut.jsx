import { useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CircleDot } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { assetClassColor, seriesColor } from '../../lib/colors.js';
import { formatPLN, formatPercent } from '../../lib/format.js';
import { Card, Segmented } from '../ui.jsx';

const MAX_SLICES = 7; // 7 kolorów kategorycznych + „Pozostałe”

function OtherColor(isDark) {
  return isDark ? '#5f5e5a' : '#a3a29b';
}

// Kolor przypisany do instrumentu wg jego pozycji na liście instrumentów (stały, niezależny od rankingu)
export function instrumentColorMap(state, isDark) {
  const map = {};
  state.instruments.forEach((inst, idx) => {
    map[inst.id] = idx < MAX_SLICES ? seriesColor(idx, isDark) : OtherColor(isDark);
  });
  return map;
}

function DonutTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-white/10 dark:bg-neutral-900">
      <div className="mb-1 flex items-center gap-2 font-semibold">
        <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
        {d.label}
      </div>
      <div className="grid grid-cols-2 gap-x-4 tabular">
        <span className="text-stone-500">Obecnie</span>
        <span className="text-right font-medium">{formatPercent(d.weight, { digits: 1 })}</span>
        <span className="text-stone-500">Cel</span>
        <span className="text-right font-medium">{formatPercent(d.target, { digits: 1 })}</span>
        <span className="text-stone-500">Wartość</span>
        <span className="text-right">{formatPLN(d.value)}</span>
      </div>
    </div>
  );
}

export default function AllocationDonut({ analysis }) {
  const { state, isDark } = useApp();
  const [mode, setMode] = useState('CLASSES');

  const data = useMemo(() => {
    if (mode === 'CLASSES') {
      return analysis.classes.map((c) => ({ ...c, color: assetClassColor(c.key, isDark) }));
    }
    const colors = instrumentColorMap(state, isDark);
    const order = Object.fromEntries(state.instruments.map((i, idx) => [i.id, idx]));
    const rows = [...analysis.instruments].sort((a, b) => order[a.key] - order[b.key]);
    const main = rows.filter((r) => order[r.key] < MAX_SLICES);
    const rest = rows.filter((r) => order[r.key] >= MAX_SLICES);
    const out = main.map((r) => ({ ...r, color: colors[r.key] }));
    if (rest.length) {
      out.push({
        key: 'OTHER',
        label: `Pozostałe (${rest.map((r) => r.label).join(', ')})`,
        value: rest.reduce((s, r) => s + r.value, 0),
        weight: rest.reduce((s, r) => s + r.weight, 0),
        target: rest.reduce((s, r) => s + r.target, 0),
        color: OtherColor(isDark),
      });
    }
    return out;
  }, [mode, analysis, state, isDark]);

  const targetsSet = mode === 'CLASSES' ? analysis.classTargetsSet : analysis.instrumentTargetsSet;
  const outer = data.filter((d) => d.weight > 0);
  const inner = data.filter((d) => d.target > 0);
  const base = mode === 'CLASSES' ? analysis.total : analysis.sleeveValue;

  return (
    <Card
      title="Struktura: obecna vs docelowa"
      subtitle="Pierścień zewnętrzny = obecny stan · wewnętrzny = cel"
      icon={CircleDot}
      actions={
        <Segmented
          size="sm"
          value={mode}
          onChange={setMode}
          ariaLabel="Zakres wykresu"
          options={[
            { value: 'CLASSES', label: 'Klasy aktywów' },
            { value: 'INSTRUMENTS', label: 'Akcje i ETF' },
          ]}
        />
      }
    >
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <div className="relative h-60 w-60 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={outer} dataKey="weight" nameKey="label" innerRadius="72%" outerRadius="100%" paddingAngle={outer.length > 1 ? 1.5 : 0} stroke="none" isAnimationActive={false}>
                {outer.map((d) => (
                  <Cell key={d.key} fill={d.color} />
                ))}
              </Pie>
              {targetsSet && (
                <Pie data={inner} dataKey="target" nameKey="label" innerRadius="46%" outerRadius="66%" paddingAngle={inner.length > 1 ? 1.5 : 0} stroke="none" isAnimationActive={false}>
                  {inner.map((d) => (
                    <Cell key={d.key} fill={d.color} fillOpacity={0.55} />
                  ))}
                </Pie>
              )}
              <Tooltip content={<DonutTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] text-stone-500 dark:text-stone-400">{mode === 'CLASSES' ? 'Portfel' : 'Akcje + ETF'}</span>
            <span className="text-sm font-semibold tabular">{formatPLN(base, { compact: true })}</span>
          </div>
        </div>
        <div className="w-full min-w-0 flex-1">
          {!targetsSet && (
            <p className="mb-3 rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-600 dark:bg-white/5 dark:text-stone-300">
              Brak wag docelowych – ustaw je w tabeli poniżej, aby zobaczyć pierścień celu.
            </p>
          )}
          <div className="mb-1 grid grid-cols-[1fr_auto_auto] gap-x-3 text-[11px] text-stone-500 dark:text-stone-400">
            <span>Pozycja</span>
            <span className="w-14 text-right">Obecnie</span>
            <span className="w-14 text-right">Cel</span>
          </div>
          <ul className="space-y-1.5 text-sm">
            {data.map((d) => (
              <li key={d.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} />
                  <span className="text-stone-700 dark:text-stone-300">{d.label}</span>
                </span>
                <span className="w-14 text-right tabular font-medium">{formatPercent(d.weight, { digits: 1 })}</span>
                <span className="w-14 text-right tabular text-stone-500 dark:text-stone-400">{targetsSet ? formatPercent(d.target, { digits: 1 }) : '—'}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-4 text-[11px] text-stone-500 dark:text-stone-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded-sm bg-stone-500" /> obecnie (zewn.)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded-sm bg-stone-500/50" /> cel (wewn.)
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
