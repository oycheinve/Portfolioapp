import { Area, AreaChart, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../../state/AppContext.jsx';
import { BENCHMARKS } from '../../lib/constants.js';
import { chartChrome, seriesColor } from '../../lib/colors.js';
import { formatAxisPLN, formatPercent } from '../../lib/format.js';
import { instrumentColorMap } from '../allocation/AllocationDonut.jsx';
import { Segmented } from '../ui.jsx';
import { Legend, PROFIT_COLORS, SeriesTooltip, axisDateFormatter, benchmarkColor } from './chartUtils.jsx';

const pctAxis = (v) => `${Math.round(v * 1000) / 10}%`;

function useAxes(span) {
  const { isDark } = useApp();
  const chrome = chartChrome(isDark);
  const x = {
    dataKey: 'date',
    tick: { fill: chrome.muted, fontSize: 11 },
    tickLine: false,
    axisLine: { stroke: chrome.axis },
    minTickGap: 40,
    tickFormatter: axisDateFormatter(span),
  };
  const y = (formatter) => ({ tick: { fill: chrome.muted, fontSize: 11 }, tickLine: false, axisLine: false, width: 64, tickFormatter: formatter });
  return { chrome, x, y, isDark };
}

// 1. Wartość portfela vs wkład własny (+ „gdyby wpłaty szły w benchmark”)
export function ValueChart({ data, span, benchmarks, compareIds }) {
  const { state } = useApp();
  const { chrome, x, y, isDark } = useAxes(span);
  const valueColor = seriesColor(0, isDark);
  const instColors = instrumentColorMap(state, isDark);
  const instById = Object.fromEntries(state.instruments.map((i) => [i.id, i]));

  if (compareIds.length) {
    return (
      <>
        <Legend items={compareIds.map((id) => ({ key: id, label: instById[id]?.ticker, color: instColors[id] }))} />
        <div className="mt-2 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={chrome.grid} vertical={false} />
              <XAxis {...x} />
              <YAxis {...y(formatAxisPLN)} />
              <Tooltip content={<SeriesTooltip />} cursor={{ stroke: chrome.axis }} />
              {compareIds.map((id) => (
                <Line key={id} dataKey={`i_${id}_value`} name={instById[id]?.ticker} stroke={instColors[id]} strokeWidth={2} dot={false} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </>
    );
  }

  const legend = [
    { key: 'v', label: 'Wartość portfela', color: valueColor },
    { key: 'c', label: 'Wkład własny netto', color: chrome.muted, dashed: true },
    ...benchmarks.map((id) => ({ key: id, label: id === 'CPI' ? 'Wpłaty waloryzowane inflacją' : `Gdyby wpłaty w ${BENCHMARKS[id].label}`, color: benchmarkColor(id, isDark), dashed: id === 'CPI' })),
  ];
  return (
    <>
      <Legend items={legend} />
      <div className="mt-2 h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="valFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={valueColor} stopOpacity={0.25} />
                <stop offset="100%" stopColor={valueColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={chrome.grid} vertical={false} />
            <XAxis {...x} />
            <YAxis {...y(formatAxisPLN)} domain={['auto', 'auto']} />
            <Tooltip content={<SeriesTooltip />} cursor={{ stroke: chrome.axis }} />
            <Area type="monotone" dataKey="value" name="Wartość" stroke={valueColor} strokeWidth={2} fill="url(#valFill)" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            <Line type="stepAfter" dataKey="contrib" name="Wkład netto" stroke={chrome.muted} strokeDasharray="4 4" strokeWidth={2} dot={false} isAnimationActive={false} />
            {benchmarks.map((id) => (
              <Line
                key={id}
                dataKey={`b_${id}_value`}
                name={id === 'CPI' ? 'Wpłaty + inflacja' : BENCHMARKS[id].label}
                stroke={benchmarkColor(id, isDark)}
                strokeWidth={1.5}
                strokeDasharray={id === 'CPI' ? '5 4' : undefined}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

// 2. Zysk w czasie: PLN (rozbicie) lub % TWR (z benchmarkami)
export function ProfitChart({ data, span, benchmarks, compareIds, mode, onModeChange }) {
  const { state } = useApp();
  const { chrome, x, y, isDark } = useAxes(span);
  const instColors = instrumentColorMap(state, isDark);
  const instById = Object.fromEntries(state.instruments.map((i) => [i.id, i]));
  const c = (slot) => seriesColor(slot, isDark);

  const toggle = (
    <Segmented
      size="sm"
      value={mode}
      onChange={onModeChange}
      ariaLabel="Jednostka"
      options={[
        { value: 'PLN', label: 'PLN' },
        { value: 'PCT', label: '% TWR' },
      ]}
    />
  );

  if (mode === 'PCT') {
    const lines = compareIds.length
      ? compareIds.map((id) => ({ key: `i_${id}_pct`, label: instById[id]?.ticker, color: instColors[id] }))
      : [{ key: 'twr', label: 'Portfel (TWR)', color: c(0), width: 2.5 }];
    const legend = [...lines, ...benchmarks.map((id) => ({ key: `b_${id}_pct`, label: BENCHMARKS[id].label, color: benchmarkColor(id, isDark), dashed: id === 'CPI' }))];
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Legend items={legend} />
          {toggle}
        </div>
        <div className="mt-2 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={chrome.grid} vertical={false} />
              <XAxis {...x} />
              <YAxis {...y(pctAxis)} />
              <ReferenceLine y={0} stroke={chrome.axis} />
              <Tooltip content={<SeriesTooltip kind="pct" />} cursor={{ stroke: chrome.axis }} />
              {lines.map((l) => (
                <Line key={l.key} dataKey={l.key} name={l.label} stroke={l.color} strokeWidth={l.width || 2} dot={false} isAnimationActive={false} />
              ))}
              {benchmarks.map((id) => (
                <Line
                  key={id}
                  dataKey={`b_${id}_pct`}
                  name={BENCHMARKS[id].label}
                  stroke={benchmarkColor(id, isDark)}
                  strokeWidth={1.5}
                  strokeDasharray={id === 'CPI' ? '5 4' : undefined}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </>
    );
  }

  const legend = [
    { key: 'p', label: 'Zysk Total', color: chrome.primary },
    { key: 'k', label: 'Zysk kursowy', color: c(PROFIT_COLORS.price) },
    { key: 'd', label: 'Dywidendy netto', color: c(PROFIT_COLORS.dividends) },
    { key: 'i', label: 'Odsetki netto', color: c(PROFIT_COLORS.interest) },
  ];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Legend items={legend} />
        {toggle}
      </div>
      <div className="mt-2 h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={chrome.grid} vertical={false} />
            <XAxis {...x} />
            <YAxis {...y(formatAxisPLN)} />
            <ReferenceLine y={0} stroke={chrome.axis} />
            <Tooltip content={<SeriesTooltip />} cursor={{ stroke: chrome.axis }} />
            <Area type="monotone" dataKey="profit" name="Zysk Total" stroke={chrome.primary} strokeWidth={2.5} fill={chrome.primary} fillOpacity={0.06} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="profitPrice" name="Kursowy" stroke={c(PROFIT_COLORS.price)} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="stepAfter" dataKey="profitDividends" name="Dywidendy" stroke={c(PROFIT_COLORS.dividends)} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="profitInterest" name="Odsetki" stroke={c(PROFIT_COLORS.interest)} strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

// 5. Drawdown – obsunięcie od szczytu (indeks TWR)
export function DrawdownChart({ data, span, benchmarks, compareIds }) {
  const { state } = useApp();
  const { chrome, x, y, isDark } = useAxes(span);
  const ddColor = isDark ? '#e66767' : '#d03b3b';
  const instColors = instrumentColorMap(state, isDark);
  const instById = Object.fromEntries(state.instruments.map((i) => [i.id, i]));
  const bench = benchmarks.filter((id) => id !== 'CPI');
  const legend = [
    ...(compareIds.length
      ? compareIds.map((id) => ({ key: id, label: instById[id]?.ticker, color: instColors[id] }))
      : [{ key: 'dd', label: 'Portfel (TWR)', color: ddColor }]),
    ...bench.map((id) => ({ key: id, label: BENCHMARKS[id].label, color: benchmarkColor(id, isDark) })),
  ];
  return (
    <>
      <Legend items={legend} />
      <div className="mt-2 h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={chrome.grid} vertical={false} />
            <XAxis {...x} />
            <YAxis {...y(pctAxis)} domain={['auto', 0]} />
            <ReferenceLine y={0} stroke={chrome.axis} />
            <Tooltip content={<SeriesTooltip kind="pct" />} cursor={{ stroke: chrome.axis }} />
            {compareIds.length === 0 && (
              <Area type="monotone" dataKey="drawdown" name="Portfel" stroke={ddColor} strokeWidth={2} fill={ddColor} fillOpacity={0.18} dot={false} isAnimationActive={false} />
            )}
            {compareIds.map((id) => (
              <Line key={id} dataKey={`i_${id}_dd`} name={instById[id]?.ticker} stroke={instColors[id]} strokeWidth={2} dot={false} isAnimationActive={false} />
            ))}
            {bench.map((id) => (
              <Line key={id} dataKey={`b_${id}_dd`} name={BENCHMARKS[id].label} stroke={benchmarkColor(id, isDark)} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

export function formatPctSafe(v) {
  return Number.isFinite(v) ? formatPercent(v, { sign: true }) : '—';
}
