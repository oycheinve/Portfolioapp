import { seriesColor } from '../../lib/colors.js';
import { formatDate, formatPLN, formatPercent } from '../../lib/format.js';

// Stałe przypisanie kolorów do benchmarków (kolor podąża za benchmarkiem, nie za kolejnością)
const BENCHMARK_SLOT = { MSCI_WORLD: 1, WIG20TR: 3, WIG: 5, SP500: 6, CPI: 7 };

export function benchmarkColor(id, isDark) {
  return seriesColor(BENCHMARK_SLOT[id] ?? 7, isDark);
}

export const PROFIT_COLORS = { price: 0, dividends: 4, interest: 2 };

export function axisDateFormatter(span) {
  return (d) =>
    span <= 100
      ? new Date(d).toLocaleDateString('pl-PL', { day: '2-digit', month: 'short' })
      : new Date(d).toLocaleDateString('pl-PL', { month: 'short', year: '2-digit' });
}

export function SeriesTooltip({ active, payload, label, kind = 'pln' }) {
  if (!active || !payload?.length) return null;
  const fmt = (v) => (kind === 'pct' ? formatPercent(v, { sign: true }) : formatPLN(v));
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-white/10 dark:bg-neutral-900">
      <div className="mb-1 font-medium">{formatDate(label)}</div>
      {payload
        .filter((p) => p.value !== undefined && p.value !== null)
        .map((p) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.stroke }} />
            <span className="text-stone-500 dark:text-stone-400">{p.name}</span>
            <span className="ml-auto pl-4 font-medium tabular">{fmt(p.value)}</span>
          </div>
        ))}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600 dark:text-stone-300">
      {items.map((it) => (
        <span key={it.key} className="flex items-center gap-1.5">
          {it.dashed ? (
            <span className="w-4 border-t-2 border-dashed" style={{ borderColor: it.color }} />
          ) : it.bar ? (
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: it.color }} />
          ) : (
            <span className="h-0.5 w-4 rounded" style={{ background: it.color }} />
          )}
          {it.label}
        </span>
      ))}
    </div>
  );
}
