import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarRange, History, Trophy } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { createPriceResolver } from '../../lib/history.js';
import { resolveAccountIds } from '../../lib/engine.js';
import { firstActivity, makePeriod, periodMetrics, yearSummary } from '../../lib/reports.js';
import { chartChrome, seriesColor } from '../../lib/colors.js';
import { formatAxisPLN, formatPLN, formatPercent, signClass } from '../../lib/format.js';
import { Badge, Card, ChartTooltip, Select } from '../ui.jsx';

function Mover({ m }) {
  if (!m) return <span className="text-stone-400">—</span>;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className="font-medium">{m.instrument.ticker}</span>
      <span className={signClass(m.pct)}>{formatPercent(m.pct, { sign: true, digits: 1 })}</span>
    </span>
  );
}

function MetricsRow({ m, label, current }) {
  return (
    <tr className={`border-b border-stone-100 last:border-0 dark:border-white/5 ${current ? 'bg-blue-50/40 dark:bg-blue-500/5' : ''}`}>
      <td className="px-4 py-2 font-medium whitespace-nowrap sm:px-5">
        {label} {current && <Badge tone="blue">w toku</Badge>}
      </td>
      <td className="px-3 py-2 text-right">{formatPLN(m.endValue)}</td>
      <td className="px-3 py-2 text-right">{formatPLN(m.flows, { sign: true })}</td>
      <td className={`px-3 py-2 text-right font-semibold ${signClass(m.profit)}`}>{formatPLN(m.profit, { sign: true })}</td>
      <td className={`px-3 py-2 text-right ${signClass(m.pct)}`}>{formatPercent(m.pct, { sign: true })}</td>
      <td className="px-3 py-2 text-right">{m.dividends > 0 ? formatPLN(m.dividends) : '—'}</td>
      <td className="px-3 py-2">
        <Mover m={m.best} kind="best" />
      </td>
      <td className="px-4 py-2 sm:px-5">
        <Mover m={m.worst} kind="worst" />
      </td>
    </tr>
  );
}

function MetricsCard({ m, label, current }) {
  return (
    <li className={`px-4 py-3 ${current ? 'bg-blue-50/40 dark:bg-blue-500/5' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          {label} {current && <Badge tone="blue">w toku</Badge>}
        </span>
        <span className={`text-sm font-semibold tabular ${signClass(m.profit)}`}>
          {formatPLN(m.profit, { sign: true })} <span className="text-xs">({formatPercent(m.pct, { sign: true, digits: 1 })})</span>
        </span>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-stone-500 tabular dark:text-stone-400">
        <span>Wartość: {formatPLN(m.endValue)}</span>
        <span>Wpłaty netto: {formatPLN(m.flows, { sign: true })}</span>
        <span>Dywidendy: {m.dividends > 0 ? formatPLN(m.dividends) : '—'}</span>
        <span className="flex gap-2">
          <Mover m={m.best} kind="best" /> / <Mover m={m.worst} kind="worst" />
        </span>
      </div>
    </li>
  );
}

const HEAD = ['Okres', 'Wartość na koniec', 'Wpłaty netto', 'Zysk / strata', 'Stopa', 'Dywidendy', 'Najlepszy', 'Najgorszy'];

function MetricsTable({ rows }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-stone-100 text-left text-xs text-stone-500 dark:border-white/5 dark:text-stone-400">
              {HEAD.map((h, i) => (
                <th key={h} className={`py-2 font-medium ${i === 0 ? 'px-4 sm:px-5' : i === HEAD.length - 1 ? 'px-4 sm:px-5' : 'px-3'} ${i >= 1 && i <= 5 ? 'text-right' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.map((r) => (
              <MetricsRow key={r.key} m={r.m} label={r.label} current={!r.m.period.closed} />
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-stone-100 md:hidden dark:divide-white/5">
        {rows.map((r) => (
          <MetricsCard key={r.key} m={r.m} label={r.label} current={!r.m.period.closed} />
        ))}
      </ul>
    </>
  );
}

// parts: które sekcje pokazać – 'year' (podsumowanie roku), 'months' (tabela miesięcy), 'years' (lata kalendarzowe)
// filter – zakres kont jak w Statystykach (ALL / INVEST / SAFE / TYPE:… / id konta)
export default function Summaries({ parts = ['year', 'months', 'years'], filter = 'ALL' }) {
  const { state, isDark } = useApp();
  const chrome = chartChrome(isDark);
  const resolver = useMemo(() => createPriceResolver(state), [state]);
  const currentYear = new Date().getFullYear();
  const firstYear = Number(firstActivity(state).slice(0, 4));
  const years = useMemo(() => Array.from({ length: currentYear - firstYear + 1 }, (_, i) => currentYear - i), [currentYear, firstYear]);
  const [year, setYear] = useState(currentYear);
  const accountIds = useMemo(() => (filter === 'ALL' ? null : resolveAccountIds(state, filter)), [state, filter]);
  const summary = useMemo(() => yearSummary(state, year, resolver, undefined, accountIds), [state, year, resolver, accountIds]);
  const allYears = useMemo(() => years.map((y) => periodMetrics(state, makePeriod('YEAR', `${y}-06-01`), resolver, undefined, accountIds)), [state, years, resolver, accountIds]);
  const t = summary.total;
  const monthsDesc = [...summary.months].reverse();
  const chartData = summary.months.map((m) => ({ label: m.period.shortLabel, profit: m.profit, pct: m.pct }));
  const bestMonth = summary.months.reduce((b, m) => (!b || m.profit > b.profit ? m : b), null);
  const worstMonth = summary.months.reduce((b, m) => (!b || m.profit < b.profit ? m : b), null);

  return (
    <div className="space-y-4 sm:space-y-6">
      {parts.includes('year') && (
        <Card
          title={`Podsumowanie roku ${year}`}
          subtitle={t.period.closed ? `Rok kalendarzowy: 1 stycznia – 31 grudnia ${year}` : `Rok kalendarzowy w toku: 1 stycznia – dziś`}
          icon={CalendarRange}
          actions={
            <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-auto" aria-label="Rok">
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Zysk / strata" value={formatPLN(t.profit, { sign: true })} tone={signClass(t.profit)} />
            <Kpi label="Stopa zwrotu" value={formatPercent(t.pct, { sign: true })} tone={signClass(t.pct)} sub="na kapitale zaangażowanym" />
            <Kpi label="Wpłaty netto" value={formatPLN(t.flows, { sign: true })} sub={`wpłaty ${formatPLN(t.deposits, { compact: true })}`} />
            <Kpi label="Dywidendy netto" value={formatPLN(t.dividends)} sub={t.interest > 0 ? `odsetki ${formatPLN(t.interest)}` : null} />
            <Kpi label="Wartość: start → koniec" value={formatPLN(t.endValue, { compact: true })} sub={`z ${formatPLN(t.startValue, { compact: true })}`} />
            <Kpi
              label="Najlepszy / najgorszy"
              value={t.best ? `${t.best.instrument.ticker} ${formatPercent(t.best.pct, { sign: true, digits: 1 })}` : '—'}
              sub={t.worst ? `${t.worst.instrument.ticker} ${formatPercent(t.worst.pct, { sign: true, digits: 1 })}` : null}
            />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={chrome.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: chrome.axis }} />
                  <YAxis tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={58} tickFormatter={formatAxisPLN} />
                  <ReferenceLine y={0} stroke={chrome.axis} />
                  <Tooltip content={<ChartTooltip formatter={(v) => formatPLN(v, { sign: true })} />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} />
                  <Bar dataKey="profit" name="Wynik miesiąca" radius={[4, 4, 4, 4]} maxBarSize={32} isAnimationActive={false}>
                    {chartData.map((d) => (
                      <Cell key={d.label} fill={d.profit >= 0 ? seriesColor(0, isDark) : seriesColor(7, isDark)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3 text-sm">
              <div className="rounded-xl bg-stone-50 p-3 dark:bg-white/[0.03]">
                <div className="flex items-center gap-1.5 text-xs text-stone-500">
                  <Trophy size={13} /> Najlepszy miesiąc
                </div>
                <div className="font-semibold">{bestMonth?.period.label || '—'}</div>
                {bestMonth && <div className={`text-xs tabular ${signClass(bestMonth.profit)}`}>{formatPLN(bestMonth.profit, { sign: true })} ({formatPercent(bestMonth.pct, { sign: true, digits: 1 })})</div>}
              </div>
              <div className="rounded-xl bg-stone-50 p-3 dark:bg-white/[0.03]">
                <div className="text-xs text-stone-500">Najsłabszy miesiąc</div>
                <div className="font-semibold">{worstMonth?.period.label || '—'}</div>
                {worstMonth && <div className={`text-xs tabular ${signClass(worstMonth.profit)}`}>{formatPLN(worstMonth.profit, { sign: true })} ({formatPercent(worstMonth.pct, { sign: true, digits: 1 })})</div>}
              </div>
              <div className="text-xs text-stone-500 dark:text-stone-400">
                Miesiące dodatnie: <strong>{summary.months.filter((m) => m.profit > 0).length}</strong> / {summary.months.length}
              </div>
            </div>
          </div>
        </Card>
      )}

      {parts.includes('months') && (
        <Card title={`Miesiące ${year}`} subtitle="Każdy miesiąc kalendarzowy osobno · najnowsze na górze" icon={History} bodyClassName="p-0 sm:p-0">
          <MetricsTable rows={monthsDesc.map((m) => ({ key: m.period.first, m, label: m.period.label }))} />
        </Card>
      )}

      {parts.includes('years') && (
        <Card title="Lata kalendarzowe" subtitle="1 stycznia – 31 grudnia każdego roku (bieżący rok do dziś)" icon={CalendarRange} bodyClassName="p-0 sm:p-0">
          <MetricsTable rows={allYears.map((m) => ({ key: m.period.first, m, label: m.period.label }))} />
        </Card>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, tone = '' }) {
  return (
    <div className="min-w-0 rounded-xl bg-stone-50 px-3 py-2 dark:bg-white/[0.03]">
      <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">{label}</div>
      <div className={`truncate text-base font-semibold tabular ${tone}`}>{value}</div>
      {sub && <div className="truncate text-[11px] text-stone-500 dark:text-stone-500">{sub}</div>}
    </div>
  );
}
