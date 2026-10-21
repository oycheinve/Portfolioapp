import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../../state/AppContext.jsx';
import { chartChrome, seriesColor } from '../../lib/colors.js';
import { formatAxisPLN, formatPLN, formatPercent } from '../../lib/format.js';
import { ChartTooltip, EmptyState, Select, Toggle } from '../ui.jsx';
import { Legend } from './chartUtils.jsx';
import { Coins } from 'lucide-react';

// 3. Dywidendy miesięczne: wybrany rok vs rok poprzedni
export function DividendsMonthlyChart({ rows, year, years, onYearChange, compare, onCompareChange }) {
  const { isDark } = useApp();
  const chrome = chartChrome(isDark);
  const current = rows.reduce((s, r) => s + r.current, 0);
  const previous = rows.reduce((s, r) => s + r.previous, 0);
  const yoy = previous > 0 ? current / previous - 1 : null;
  const cur = seriesColor(4, isDark);
  const prev = isDark ? '#5f5e5a' : '#c3c2b7';

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Legend
          items={[
            { key: 'c', label: `${year}`, color: cur, bar: true },
            ...(compare ? [{ key: 'p', label: `${year - 1}`, color: prev, bar: true }] : []),
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Toggle checked={compare} onChange={onCompareChange} label="Rok do roku" />
          <Select value={year} onChange={(e) => onYearChange(Number(e.target.value))} className="w-auto" aria-label="Rok">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-xs text-stone-500 dark:text-stone-400">Suma {year}</div>
          <div className="font-semibold tabular">{formatPLN(current)}</div>
        </div>
        <div>
          <div className="text-xs text-stone-500 dark:text-stone-400">Suma {year - 1}</div>
          <div className="font-semibold tabular">{formatPLN(previous)}</div>
        </div>
        <div>
          <div className="text-xs text-stone-500 dark:text-stone-400">Zmiana r/r</div>
          <div className={`font-semibold tabular ${yoy > 0 ? 'text-emerald-700 dark:text-emerald-400' : yoy < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
            {yoy === null ? '—' : formatPercent(yoy, { sign: true, digits: 1 })}
          </div>
        </div>
      </div>
      <div className="mt-3 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="12%">
            <CartesianGrid stroke={chrome.grid} vertical={false} />
            <XAxis dataKey="month" tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: chrome.axis }} />
            <YAxis tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={64} tickFormatter={formatAxisPLN} />
            <Tooltip content={<ChartTooltip formatter={(v) => formatPLN(v)} />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} />
            {compare && <Bar dataKey="previous" name={`${year - 1}`} fill={prev} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />}
            <Bar dataKey="current" name={`${year}`} fill={cur} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

// 4. Dywidendy roczne: suma + linia średniej miesięcznej
export function DividendsYearlyChart({ rows }) {
  const { isDark } = useApp();
  const chrome = chartChrome(isDark);
  if (!rows.length) return <EmptyState icon={Coins} title="Brak dywidend dla wybranych filtrów" />;
  const bar = seriesColor(4, isDark);
  const line = seriesColor(0, isDark);
  const best = rows.reduce((m, r) => (r.total > m.total ? r : m), rows[0]);
  return (
    <>
      <Legend
        items={[
          { key: 't', label: 'Suma roczna', color: bar, bar: true },
          { key: 'a', label: 'Średnia miesięczna', color: line },
        ]}
      />
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <div className="text-xs text-stone-500 dark:text-stone-400">Łącznie</div>
          <div className="font-semibold tabular">{formatPLN(rows.reduce((s, r) => s + r.total, 0))}</div>
        </div>
        <div>
          <div className="text-xs text-stone-500 dark:text-stone-400">Najlepszy rok</div>
          <div className="font-semibold tabular">
            {best.year}: {formatPLN(best.total)}
          </div>
        </div>
        <div>
          <div className="text-xs text-stone-500 dark:text-stone-400">Średnio / mies. ({rows[rows.length - 1].year})</div>
          <div className="font-semibold tabular">{formatPLN(rows[rows.length - 1].monthlyAvg)}</div>
        </div>
      </div>
      <div className="mt-3 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barCategoryGap="18%">
            <CartesianGrid stroke={chrome.grid} vertical={false} />
            <XAxis
              dataKey="year"
              tick={{ fill: chrome.muted, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: chrome.axis }}
              tickFormatter={(y) => (rows.find((r) => r.year === y)?.partial ? `${y} (YTD)` : y)}
            />
            <YAxis tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={64} tickFormatter={formatAxisPLN} />
            <Tooltip content={<ChartTooltip formatter={(v) => formatPLN(v)} />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} />
            <Bar dataKey="total" name="Suma roczna" fill={bar} radius={[4, 4, 0, 0]} maxBarSize={96} isAnimationActive={false} />
            <Line type="monotone" dataKey="monthlyAvg" name="Średnia miesięczna" stroke={line} strokeWidth={2} dot={{ r: 4, fill: line, stroke: chrome.surface, strokeWidth: 2 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
