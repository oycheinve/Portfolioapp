import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Building2, Landmark, ShieldCheck, TrendingUp } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { assetClassColor, chartChrome, seriesColor } from '../../lib/colors.js';
import { formatAxisPLN, formatDate, formatPLN, formatPercent } from '../../lib/format.js';
import { ChartTooltip, Segmented } from '../ui.jsx';
import { otherAssetsValue } from '../../lib/engine.js';

const RANGES = [
  { value: '6M', label: '6M' },
  { value: '1Y', label: '1R' },
  { value: 'ALL', label: 'Max' },
];

export default function NetWorthPanel({ valuation, compact = false }) {
  const { state, isDark } = useApp();
  const [range, setRange] = useState('1Y');
  const chrome = chartChrome(isDark);
  const t = valuation.totals;
  const other = otherAssetsValue(state);
  const netWorth = t.total + other.includedValue;

  const segments = [
    { key: 'STOCKS', label: 'Akcje', value: t.stocks, risk: 'Rynkowe' },
    { key: 'ETF', label: 'ETF', value: t.etf, risk: 'Rynkowe' },
    { key: 'BONDS', label: 'Obligacje', value: t.bonds, risk: 'Bezpieczne' },
    // Wolne środki IKE/IKZE/maklerskie – część kont inwestycyjnych; oszczędności – poduszka
    { key: 'FREE_CASH', label: 'Wolne środki (IKE, IKZE, makl.)', value: t.brokerCash, risk: 'Inwestycyjne' },
    { key: 'CASH', label: 'Oszczędności', value: t.savingsCash, risk: 'Bezpieczne' },
    { key: 'OTHER', label: 'Nieruchomości / inne (netto)', value: other.includedValue, risk: 'Inne' },
  ].filter((s) => s.value > 0.005);

  const safeShare = netWorth > 0 ? t.safe / netWorth : 0;
  const marketShare = netWorth > 0 ? t.market / netWorth : 0;
  const otherShare = netWorth > 0 ? other.includedValue / netWorth : 0;

  const history = useMemo(() => {
    const ids = state.accounts.map((a) => a.id);
    const cutoff = new Date();
    if (range === '6M') cutoff.setMonth(cutoff.getMonth() - 6);
    else if (range === '1Y') cutoff.setFullYear(cutoff.getFullYear() - 1);
    else cutoff.setFullYear(1970);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    return state.snapshots
      .filter((s) => s.date >= cutoffIso)
      .map((s) => ({
        date: s.date,
        value: ids.reduce((acc, id) => acc + (s.accounts?.[id]?.value || 0), 0),
        contrib: ids.reduce((acc, id) => acc + (s.accounts?.[id]?.contrib || 0), 0),
      }));
  }, [state.snapshots, state.accounts, range]);

  const valueColor = seriesColor(0, isDark);

  // Wykres kołowy struktury majątku (duży w trybie kompaktowym Pulpitu)
  const pieBlock = (big) => (
          <div className={big ? 'flex flex-col items-center gap-5' : 'flex flex-col gap-4 sm:flex-row sm:items-center'}>
            <div className={`relative shrink-0 self-center ${big ? 'h-56 w-56 sm:h-64 sm:w-64' : 'h-36 w-36'}`}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={segments}
                    dataKey="value"
                    nameKey="label"
                    innerRadius="64%"
                    outerRadius="100%"
                    paddingAngle={segments.length > 1 ? 2 : 0}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {segments.map((s) => (
                      <Cell key={s.key} fill={assetClassColor(s.key, isDark)} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={
                      <ChartTooltip
                        formatter={(v) => `${formatPLN(v)} (${formatPercent(netWorth > 0 ? v / netWorth : 0, { digits: 1 })})`}
                      />
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className={`${big ? 'text-xs' : 'text-[10px]'} text-stone-500 dark:text-stone-400`}>Łączny majątek</span>
                <span className={`${big ? 'text-xl sm:text-2xl' : 'text-sm'} font-bold tabular leading-tight`}>
                  {big ? `${Math.round(netWorth).toLocaleString('pl-PL')} zł` : formatPLN(netWorth, { compact: true })}
                </span>
                <span className={`${big ? 'text-[11px]' : 'text-[9px]'} text-stone-500 dark:text-stone-400`}>{segments.length} {segments.length === 1 ? 'klasa' : segments.length < 5 ? 'klasy' : 'klas'} aktywów</span>
              </div>
            </div>
            <ul className={big ? 'grid w-full grid-cols-1 gap-1.5 text-sm' : 'grid flex-1 grid-cols-1 gap-1.5 text-sm'}>
              {segments.map((s) => (
                <li key={s.key} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: assetClassColor(s.key, isDark) }} />
                  <span className="truncate text-stone-600 dark:text-stone-300">{s.label}</span>
                  <span className="ml-auto tabular font-medium">{formatPLN(s.value)}</span>
                  <span className="w-14 text-right tabular text-xs text-stone-500 dark:text-stone-400">
                    {formatPercent(netWorth > 0 ? s.value / netWorth : 0, { digits: 1 })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
  );
  const contribColor = chrome.muted;

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
              <Landmark size={16} /> Majątek Całkowity (Net Worth)
            </div>
            <div className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{formatPLN(netWorth)}</div>
            <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              Inwestycje i gotówka: <span className="font-medium tabular text-stone-700 dark:text-stone-300">{formatPLN(t.total)}</span>
              {other.includedValue !== 0 && (
                <>
                  {' '}· Nieruchomości/inne netto:{' '}
                  <span className="font-medium tabular text-stone-700 dark:text-stone-300">{formatPLN(other.includedValue)}</span>
                </>
              )}
            </div>
          </div>

          {/* Bezpieczne vs rynkowe */}
          <div className="space-y-2">
            <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" aria-label="Podział majątku: bezpieczne, rynkowe, inne">
              {marketShare > 0 && <div style={{ width: `${marketShare * 100}%`, background: seriesColor(0, isDark) }} className="h-full" />}
              {safeShare > 0 && <div style={{ width: `${safeShare * 100}%`, background: seriesColor(2, isDark) }} className="h-full" />}
              {otherShare > 0 && <div style={{ width: `${otherShare * 100}%`, background: seriesColor(4, isDark) }} className="h-full" />}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <RiskTile icon={TrendingUp} color={seriesColor(0, isDark)} label="Rynkowe" sub="Akcje + ETF" value={t.market} share={marketShare} />
              <RiskTile icon={ShieldCheck} color={seriesColor(2, isDark)} label="Bezpieczne" sub="Obligacje + gotówka" value={t.safe} share={safeShare} />
              <RiskTile icon={Building2} color={seriesColor(4, isDark)} label="Inne" sub="Nieruchomości itp." value={other.includedValue} share={otherShare} muted={!other.globallyEnabled} />
            </div>
          </div>

          {!compact && pieBlock(false)}

          {other.items.length > 0 && (
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Nieruchomości i ruchomości ({other.items.length}) zawsze w majątku: {formatPLN(other.totalValue)} netto po zobowiązaniach. Widoczność w zakładce Portfel – w ustawieniach.
            </p>
          )}
        </div>

        {compact ? (
          <div className="flex min-w-0 flex-col justify-center">
            <div className="mb-3 text-sm font-semibold">Struktura majątku</div>
            {pieBlock(true)}
          </div>
        ) : (
        <div className="flex min-w-0 flex-col">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Historia wartości portfela</div>
              <div className="text-xs text-stone-500 dark:text-stone-400">Bez nieruchomości · z migawek dziennych</div>
            </div>
            <Segmented options={RANGES} value={range} onChange={setRange} size="sm" ariaLabel="Zakres historii" />
          </div>
          <div className="mb-2 flex gap-4 text-xs text-stone-600 dark:text-stone-300">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: valueColor }} /> Wartość
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded border-t-2 border-dashed" style={{ borderColor: contribColor }} /> Wkład własny netto
            </span>
          </div>
          <div className="h-56 min-h-[14rem] flex-1 sm:h-64">
            {history.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={valueColor} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={valueColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={chrome.grid} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: chrome.muted, fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: chrome.axis }}
                    minTickGap={40}
                    tickFormatter={(d) => new Date(d).toLocaleDateString('pl-PL', { month: 'short', year: '2-digit' })}
                  />
                  <YAxis
                    tick={{ fill: chrome.muted, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    tickFormatter={formatAxisPLN}
                  />
                  <Tooltip
                    content={<ChartTooltip formatter={(v) => formatPLN(v)} labelFormatter={(d) => formatDate(d)} />}
                    cursor={{ stroke: chrome.axis }}
                  />
                  <Area type="monotone" dataKey="contrib" name="Wkład netto" stroke={contribColor} strokeDasharray="4 4" strokeWidth={2} fill="none" isAnimationActive={false} dot={false} />
                  <Area type="monotone" dataKey="value" name="Wartość" stroke={valueColor} strokeWidth={2} fill="url(#nwFill)" isAnimationActive={false} dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-stone-500">Historia pojawi się po kilku dniach korzystania.</div>
            )}
          </div>
        </div>
        )}
      </div>
    </section>
  );
}

function RiskTile({ icon: Icon, color, label, sub, value, share, muted }) {
  return (
    <div className={`rounded-xl border border-stone-100 bg-stone-50 px-3 py-2.5 dark:border-white/5 dark:bg-white/[0.03] ${muted ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <Icon size={13} />
        {label}
        <span className="ml-auto tabular">{formatPercent(share, { digits: 1 })}</span>
      </div>
      <div className="mt-0.5 text-base font-semibold tabular">{formatPLN(value)}</div>
      <div className="text-[11px] text-stone-500 dark:text-stone-500">{sub}</div>
    </div>
  );
}
