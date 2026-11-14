import { Area, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../../state/AppContext.jsx';
import { benchmarkLabel, isCustomBenchmark } from '../../lib/constants.js';
import { chartChrome, seriesColor } from '../../lib/colors.js';
import { formatAxisPLN, formatDate, formatPLN, formatPercent } from '../../lib/format.js';
import { instrumentColorMap } from '../allocation/AllocationDonut.jsx';
import { Select } from '../ui.jsx';
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

// Wartość portfela z wpłatami (+) i wypłatami (−): przepływ w punkcie = zmiana wkładu własnego netto względem
// poprzedniego punktu (zgodnie z wybranym filtrem kont / aktywów i zakresem); znacznik na linii wartości
const FLOW_MIN = 0.5;
export function flowPoints(data) {
  return (data || []).map((p, i) => {
    const prev = i > 0 ? data[i - 1] : null;
    const flow = prev && Number.isFinite(p.contrib) && Number.isFinite(prev.contrib) ? Math.round((p.contrib - prev.contrib) * 100) / 100 : 0;
    return { ...p, flow, depMark: flow > FLOW_MIN ? p.value : null, wdMark: flow < -FLOW_MIN ? p.value : null };
  });
}
const FlowMark = (sign, color) =>
  function Mark({ cx, cy }) {
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
    return (
      <g>
        <circle cx={cx} cy={cy} r={6} fill={color} stroke="#fff" strokeWidth={1.5} />
        <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">
          {sign}
        </text>
      </g>
    );
  };
function FlowTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload || {};
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-white/10 dark:bg-neutral-900">
      <div className="mb-1 font-medium">{formatDate(label || p.date)}</div>
      <div className="flex gap-3">
        <span className="text-stone-500 dark:text-stone-400">Wartość</span>
        <span className="ml-auto font-medium tabular">{formatPLN(p.value)}</span>
      </div>
      {Math.abs(p.flow || 0) > FLOW_MIN && (
        <div className={`flex gap-3 font-semibold ${p.flow > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          <span>{p.flow > 0 ? 'Wpłata' : 'Wypłata'}</span>
          <span className="ml-auto tabular">{formatPLN(p.flow, { sign: true })}</span>
        </div>
      )}
    </div>
  );
}
export function FlowsChart({ data, span }) {
  const { chrome, x, y, isDark } = useAxes(span);
  const valueColor = seriesColor(0, isDark);
  const rows = flowPoints(data);
  const dep = rows.filter((r) => r.flow > FLOW_MIN);
  const wd = rows.filter((r) => r.flow < -FLOW_MIN);
  const sum = (list) => list.reduce((s, r) => s + r.flow, 0);
  const green = isDark ? '#34d399' : '#059669';
  const red = isDark ? '#f87171' : '#dc2626';
  return (
    <>
      <Legend
        items={[
          { key: 'v', label: 'Wartość portfela', color: valueColor },
          { key: 'd', label: 'Wpłata (+)', color: green },
          { key: 'w', label: 'Wypłata (−)', color: red },
        ]}
      />
      <div className="mt-2 h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="flowFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={valueColor} stopOpacity={0.22} />
                <stop offset="100%" stopColor={valueColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={chrome.grid} vertical={false} />
            <XAxis {...x} />
            <YAxis {...y(formatAxisPLN)} domain={['auto', 'auto']} />
            <Tooltip content={<FlowTooltip />} cursor={{ stroke: chrome.axis }} />
            <Area type="monotone" dataKey="value" name="Wartość" stroke={valueColor} strokeWidth={2} fill="url(#flowFill)" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            <Scatter dataKey="depMark" name="Wpłata" shape={FlowMark('+', green)} isAnimationActive={false} />
            <Scatter dataKey="wdMark" name="Wypłata" shape={FlowMark('−', red)} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-stone-100 pt-3 text-xs tabular dark:border-white/5">
        <span>
          Wpłaty: <strong className="text-emerald-700 dark:text-emerald-400">{formatPLN(sum(dep), { sign: true })}</strong> <span className="text-stone-400">({dep.length})</span>
        </span>
        <span>
          Wypłaty: <strong className="text-red-600 dark:text-red-400">{formatPLN(sum(wd), { sign: true })}</strong> <span className="text-stone-400">({wd.length})</span>
        </span>
        <span className="text-stone-500 dark:text-stone-400">Wkład netto w okresie: {formatPLN(sum(dep) + sum(wd), { sign: true })}</span>
      </div>
    </>
  );
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
                <Line type="monotone" key={id} dataKey={`i_${id}_value`} name={instById[id]?.ticker} stroke={instColors[id]} strokeWidth={2} dot={false} isAnimationActive={false} />
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
    ...benchmarks.map((id) => ({ key: id, label: benchmarkLabel(state.settings, id), color: benchmarkColor(id, isDark), dashed: id === 'CPI' || isCustomBenchmark(id) })),
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
            <Line type="monotone" dataKey="contrib" name="Wkład netto" stroke={chrome.muted} strokeDasharray="4 4" strokeWidth={2} dot={false} isAnimationActive={false} />
            {benchmarks.map((id) => (
              <Line type="monotone"
                key={id}
                dataKey={`b_${id}_value`}
                name={benchmarkLabel(state.settings, id)}
                stroke={benchmarkColor(id, isDark)}
                strokeWidth={1.5}
                strokeDasharray={id === 'CPI' || isCustomBenchmark(id) ? '5 4' : undefined}
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

  // Wybór widoku z listy: zysk total / zysk kursowy (PLN) albo stopa TWR (%) – jedna linia, bez dublujących się serii
  const toggle = compareIds.length ? null : (
    <Select value={mode} onChange={(e) => onModeChange(e.target.value)} className="h-8 w-auto text-xs" aria-label="Widok zysku">
      <option value="PLN">Zysk total (PLN)</option>
      <option value="PRICE">Zysk kursowy (PLN)</option>
      <option value="PCT">Stopa zwrotu TWR (%)</option>
    </Select>
  );

  if (mode === 'PCT') {
    const lines = compareIds.length
      ? compareIds.map((id) => ({ key: `i_${id}_pct`, label: instById[id]?.ticker, color: instColors[id] }))
      : [{ key: 'twr', label: 'Portfel (TWR)', color: c(0), width: 2.5 }];
    const legend = [...lines, ...benchmarks.map((id) => ({ key: `b_${id}_pct`, label: benchmarkLabel(state.settings, id), color: benchmarkColor(id, isDark), dashed: id === 'CPI' || isCustomBenchmark(id) }))];
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
                <Line type="monotone" key={l.key} dataKey={l.key} name={l.label} stroke={l.color} strokeWidth={l.width || 2} dot={false} isAnimationActive={false} />
              ))}
              {benchmarks.map((id) => (
                <Line type="monotone"
                  key={id}
                  dataKey={`b_${id}_pct`}
                  name={benchmarkLabel(state.settings, id)}
                  stroke={benchmarkColor(id, isDark)}
                  strokeWidth={1.5}
                  strokeDasharray={id === 'CPI' || isCustomBenchmark(id) ? '5 4' : undefined}
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

  const price = mode === 'PRICE';
  const color = price ? c(PROFIT_COLORS.price) : chrome.primary;
  const legend = [price ? { key: 'k', label: 'Zysk kursowy (bez dywidend i odsetek)', color } : { key: 'p', label: 'Zysk total (kursowy + dywidendy + odsetki)', color }];
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
            <Area type="monotone" dataKey={price ? 'profitPrice' : 'profit'} name={price ? 'Zysk kursowy' : 'Zysk total'} stroke={color} strokeWidth={2.5} fill={color} fillOpacity={0.08} dot={false} isAnimationActive={false} />
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
    ...bench.map((id) => ({ key: id, label: benchmarkLabel(state.settings, id), color: benchmarkColor(id, isDark) })),
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
              <Line type="monotone" key={id} dataKey={`i_${id}_dd`} name={instById[id]?.ticker} stroke={instColors[id]} strokeWidth={2} dot={false} isAnimationActive={false} />
            ))}
            {bench.map((id) => (
              <Line type="monotone" key={id} dataKey={`b_${id}_dd`} name={benchmarkLabel(state.settings, id)} stroke={benchmarkColor(id, isDark)} strokeWidth={1.5} dot={false} isAnimationActive={false} />
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
