import { useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Gauge } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { SCENARIOS, fireChartPoints } from '../../lib/fire.js';
import { chartChrome, seriesColor } from '../../lib/colors.js';
import { formatAxisPLN, formatPLN } from '../../lib/format.js';
import { Card, Segmented } from '../ui.jsx';
import { Legend } from '../charts/chartUtils.jsx';

// Prognoza FIRE: majątek (lewa oś) i miesięczny dochód pasywny (prawa oś). Oś czasu kończy się w momencie
// osiągnięcia celu FIRE w wybranym scenariuszu (wcześniej lub później niż rok docelowy), a nie na roku docelowym.
export default function FireProjectionChart({ scenarios }) {
  const { state, actions, isDark } = useApp();
  const fire = state.settings.fire;
  const real = fire.realValues !== false;
  const chrome = chartChrome(isDark);
  const valueColor = seriesColor(0, isDark);
  const incomeColor = seriesColor(4, isDark);
  const bandColor = isDark ? '#5f5e5a' : '#a3a29b';
  const goalColor = isDark ? '#fb923c' : '#ea580c';

  const chart = useMemo(() => fireChartPoints(scenarios, fire), [scenarios, fire]);
  const data = useMemo(
    () =>
      chart.points.map((p) => {
        const deflate = real || !(p.valueReal > 0) ? 1 : p.value / p.valueReal;
        return {
          t: p.t,
          x: p.x,
          isEnd: p.isEnd,
          value: real ? p.valueReal : p.value,
          income: real ? p.monthlyIncomeReal : p.monthlyIncome,
          pess: p.pess ? (real ? p.pess.valueReal : p.pess.value) : null,
          opt: p.opt ? (real ? p.opt.valueReal : p.opt.value) : null,
          targetValue: fire.targetNetWorth * deflate,
          targetIncome: fire.targetMonthlyIncome * deflate,
        };
      }),
    [chart, real, fire.targetNetWorth, fire.targetMonthlyIncome],
  );
  const endPoint = data[data.length - 1];
  // Grudzień roku docelowego na liniowej osi czasu
  const targetT = fire.targetYear + 11 / 12;
  const showTarget = data.length > 1 && targetT > data[0].t && targetT < endPoint.t - 1e-9;
  const ticks = useMemo(() => {
    if (data.length < 2) return [];
    const from = Math.ceil(data[0].t);
    const to = Math.floor(endPoint.t);
    const step = Math.max(1, Math.ceil((to - from + 1) / 10));
    const out = [];
    for (let y = from; y <= to; y += step) out.push(y);
    return out;
  }, [data, endPoint]);
  const diff = chart.reached ? chart.reached.year - fire.targetYear : null;

  return (
    <Card
      title={chart.reached ? `Ścieżka do FIRE – cel osiągnięty: ${chart.endLabel}` : 'Ścieżka do FIRE – cel nieosiągnięty do 2100'}
      subtitle={`Wykres do momentu realizacji celu · scenariusz ${SCENARIOS[fire.scenario]?.label.toLowerCase() || ''}${
        diff === null ? '' : diff === 0 ? ` · w roku docelowym ${fire.targetYear}` : diff < 0 ? ` · ${-diff} ${-diff === 1 ? 'rok' : -diff < 5 ? 'lata' : 'lat'} przed ${fire.targetYear}` : ` · ${diff} ${diff === 1 ? 'rok' : diff < 5 ? 'lata' : 'lat'} po ${fire.targetYear}`
      }`}
      icon={Gauge}
      actions={
        <Segmented
          size="sm"
          value={real ? 'REAL' : 'NOMINAL'}
          onChange={(v) => actions.updateSettings({ fire: { ...fire, realValues: v === 'REAL' } })}
          ariaLabel="Kwoty"
          options={[
            { value: 'REAL', label: 'Realnie' },
            { value: 'NOMINAL', label: 'Nominalnie' },
          ]}
        />
      }
    >
      <Legend
        items={[
          { key: 'v', label: `Majątek (${SCENARIOS[fire.scenario]?.label.toLowerCase()})`, color: valueColor },
          { key: 'b', label: 'Pesymistyczny / optymistyczny', color: bandColor, dashed: true },
          { key: 'i', label: 'Dochód pasywny / mies. (prawa oś)', color: incomeColor },
          { key: 't', label: 'Cele', color: chrome.primary, dashed: true },
          { key: 'f', label: chart.reached ? `Osiągnięcie FIRE (${chart.endLabel})` : 'Koniec prognozy (2100)', color: goalColor },
        ]}
      />
      <div className="mt-2 h-80 sm:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 18, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="fireFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={valueColor} stopOpacity={0.25} />
                <stop offset="100%" stopColor={valueColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={chrome.grid} vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={['dataMin', 'dataMax']}
              ticks={ticks}
              tickFormatter={(v) => String(Math.round(v))}
              tick={{ fill: chrome.muted, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: chrome.axis }}
              allowDecimals={false}
            />
            <YAxis yAxisId="v" tick={{ fill: valueColor, fontSize: 11 }} tickLine={false} axisLine={false} width={58} tickFormatter={formatAxisPLN} />
            <YAxis yAxisId="i" orientation="right" tick={{ fill: incomeColor, fontSize: 11 }} tickLine={false} axisLine={false} width={52} tickFormatter={formatAxisPLN} />
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-white/10 dark:bg-neutral-900">
                    <div className="mb-1 font-medium">
                      {payload[0]?.payload?.x ?? label}
                      {payload[0]?.payload?.isEnd && chart.reached ? ' · osiągnięcie FIRE' : ''}
                    </div>
                    {payload
                      .filter((p) => p.dataKey !== 'targetValue' && p.dataKey !== 'targetIncome' && p.value !== null)
                      .map((p) => (
                        <div key={p.dataKey} className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: p.stroke }} />
                          <span className="text-stone-500">{p.name}</span>
                          <span className="ml-auto pl-4 font-medium tabular">{formatPLN(p.value)}</span>
                        </div>
                      ))}
                  </div>
                ) : null
              }
              cursor={{ stroke: chrome.axis }}
            />
            <Line type="monotone" yAxisId="v" dataKey="pess" name="Pesymistyczny" stroke={bandColor} strokeDasharray="4 4" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
            <Line type="monotone" yAxisId="v" dataKey="opt" name="Optymistyczny" stroke={bandColor} strokeDasharray="4 4" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
            <Area type="monotone" yAxisId="v" dataKey="value" name="Majątek" stroke={valueColor} strokeWidth={2.5} fill="url(#fireFill)" dot={false} isAnimationActive={false} />
            <Line type="monotone" yAxisId="i" dataKey="income" name="Dochód / mies." stroke={incomeColor} strokeWidth={2.5} dot={false} isAnimationActive={false} />
            {real ? (
              <>
                <ReferenceLine yAxisId="v" y={fire.targetNetWorth} stroke={valueColor} strokeDasharray="6 4" label={{ value: 'cel majątku', position: 'insideTopLeft', fill: valueColor, fontSize: 11 }} />
                <ReferenceLine yAxisId="i" y={fire.targetMonthlyIncome} stroke={incomeColor} strokeDasharray="6 4" label={{ value: 'cel dochodu', position: 'insideBottomRight', fill: incomeColor, fontSize: 11 }} />
              </>
            ) : (
              <>
                <Line type="monotone" yAxisId="v" dataKey="targetValue" name="Cel majątku" stroke={valueColor} strokeDasharray="6 4" strokeWidth={1} dot={false} isAnimationActive={false} />
                <Line type="monotone" yAxisId="i" dataKey="targetIncome" name="Cel dochodu" stroke={incomeColor} strokeDasharray="6 4" strokeWidth={1} dot={false} isAnimationActive={false} />
              </>
            )}
            {showTarget && <ReferenceLine yAxisId="v" x={targetT} stroke={chrome.muted} strokeDasharray="3 3" label={{ value: `rok docelowy ${fire.targetYear}`, position: 'insideTopRight', fill: chrome.muted, fontSize: 10 }} />}
            {endPoint && chart.reached && (
              <>
                <ReferenceLine yAxisId="v" x={endPoint.t} stroke={goalColor} strokeWidth={1.5} label={{ value: 'FIRE', position: 'top', fill: goalColor, fontSize: 11, fontWeight: 700 }} />
                <ReferenceDot yAxisId="v" x={endPoint.t} y={endPoint.value} r={5} fill={goalColor} stroke={chrome.surface} strokeWidth={2} />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {!chart.reached && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Przy obecnych założeniach cel FIRE nie zostaje osiągnięty do 2100 roku – wykres pokazuje prognozę do końca horyzontu symulacji.</p>}
    </Card>
  );
}
