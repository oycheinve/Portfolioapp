import { AlertTriangle, Equal, Eraser, Scale } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { seriesColor } from '../../lib/colors.js';
import { formatNumber, formatPLN, formatPercent } from '../../lib/format.js';
import { Button, Card } from '../ui.jsx';

// Niedowaga = niebieski (slot 1), nadwaga = pomarańczowy (slot 2)
export function deviationColors(isDark) {
  return { under: seriesColor(0, isDark), over: seriesColor(1, isDark) };
}

export function formatDeviation(devPP, devPLN) {
  const sign = devPP > 0 ? '+' : devPP < 0 ? '−' : '';
  const pp = `${sign}${formatNumber(Math.abs(devPP), 2)} pp`;
  const pln = `${devPLN > 0 ? '+' : devPLN < 0 ? '−' : ''}${formatPLN(Math.abs(devPLN))}`;
  return { pp, pln };
}

export default function DeviationList({
  title,
  subtitle,
  icon,
  rows,
  colorFor,
  targets,
  onTargetChange,
  onNormalize,
  onSetCurrent,
  onClear,
  threshold,
  emptyText,
}) {
  const { isDark } = useApp();
  const colors = deviationColors(isDark);
  const sum = Object.values(targets || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  const sumOk = Math.abs(sum - 100) < 0.01;
  const targetsSet = sum > 0;
  const scaleMax = Math.max(0.05, ...rows.map((r) => Math.max(r.weight, r.target))) * 1.08;

  return (
    <Card
      title={title}
      subtitle={subtitle}
      icon={icon}
      actions={
        <>
          <span
            className={`rounded-md px-2 py-1 text-xs font-medium tabular ${
              sumOk
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                : 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300'
            }`}
            title="Suma wag docelowych"
          >
            Suma: {formatNumber(sum, 2)}%
          </span>
          <Button size="sm" icon={Scale} onClick={onNormalize} disabled={!targetsSet || sumOk} title="Przeskaluj wagi tak, by sumowały się do 100%">
            Do 100%
          </Button>
          <Button size="sm" icon={Equal} onClick={onSetCurrent} title="Ustaw cel równy obecnym wagom">
            Jak obecnie
          </Button>
          <Button size="sm" variant="ghost" icon={Eraser} onClick={onClear} disabled={!targetsSet}>
            Wyczyść
          </Button>
        </>
      }
      bodyClassName="p-0 sm:p-0"
    >
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-stone-500">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-stone-100 dark:divide-white/5">
          {rows.map((r) => {
            const under = r.devPP < 0;
            const devColor = under ? colors.under : colors.over;
            const breach = targetsSet && Math.abs(r.devPP) > threshold;
            const { pp, pln } = formatDeviation(r.devPP, r.devPLN);
            const neutral = !targetsSet || Math.abs(r.devPP) < 0.005;
            return (
              <li key={r.key} className="px-4 py-3 sm:px-5">
                <div className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colorFor(r) }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{r.label}</span>
                      {r.sub && <span className="hidden truncate text-xs text-stone-500 sm:inline dark:text-stone-400">{r.sub}</span>}
                      {breach && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
                          <AlertTriangle size={11} /> &gt; {threshold} pp
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-stone-500 tabular dark:text-stone-400">{formatPLN(r.value)}</div>
                  </div>
                  <label className="flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400">
                    <span className="hidden sm:inline">Cel</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      inputMode="decimal"
                      aria-label={`Waga docelowa ${r.label} (%)`}
                      value={targets?.[r.key] ?? ''}
                      placeholder="0"
                      onChange={(e) => onTargetChange(r.key, e.target.value === '' ? 0 : Math.max(0, Math.min(100, Number(e.target.value))))}
                      className="h-8 w-16 rounded-md border border-stone-200 bg-white px-2 text-right text-sm text-stone-900 tabular outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-neutral-800 dark:text-stone-100"
                    />
                    %
                  </label>
                </div>

                <div className="mt-2 grid grid-cols-1 items-center gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="relative h-2.5 rounded-full bg-stone-100 dark:bg-white/5" aria-hidden="true">
                    <div
                      className="absolute top-0 left-0 h-full rounded-full"
                      style={{ width: `${Math.min(100, (r.weight / scaleMax) * 100)}%`, background: neutral ? (isDark ? '#5f5e5a' : '#a3a29b') : devColor }}
                    />
                    {targetsSet && (
                      <div
                        className="absolute -top-1 h-[18px] w-[3px] -translate-x-1/2 rounded-full bg-stone-900 ring-2 ring-white dark:bg-white dark:ring-neutral-900"
                        style={{ left: `${Math.min(100, (r.target / scaleMax) * 100)}%` }}
                        title={`Cel ${formatPercent(r.target, { digits: 1 })}`}
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs tabular sm:justify-end">
                    <span className="text-stone-500 dark:text-stone-400">
                      {formatPercent(r.weight, { digits: 1 })} / {targetsSet ? formatPercent(r.target, { digits: 1 }) : '—'}
                    </span>
                    {targetsSet && (
                      <span className="min-w-[10.5rem] text-right font-medium" style={{ color: neutral ? undefined : devColor }}>
                        {neutral ? 'zgodnie z celem' : `${under ? 'niedowaga' : 'nadwaga'} ${pp} [${pln}]`}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-4 border-t border-stone-100 px-4 py-2.5 text-[11px] text-stone-500 sm:px-5 dark:border-white/5 dark:text-stone-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full" style={{ background: colors.under }} /> niedowaga
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full" style={{ background: colors.over }} /> nadwaga
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-[3px] rounded-full bg-stone-900 dark:bg-white" /> waga docelowa
        </span>
      </div>
    </Card>
  );
}
