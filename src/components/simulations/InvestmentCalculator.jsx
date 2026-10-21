import { useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Calculator, LineChart as LineIcon, ListOrdered } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { CALC_ACCOUNTS, compareAccounts, defaultCalculator, simulateInvestment } from '../../lib/calculator.js';
import { chartChrome, seriesColor } from '../../lib/colors.js';
import { formatAxisPLN, formatNumber, formatPLN, formatPercent } from '../../lib/format.js';
import { Badge, Card, Field, Input, Segmented, Slider, Toggle } from '../ui.jsx';
import { Legend } from '../charts/chartUtils.jsx';

const KEY = 'wealth-app-calculator';

function readParams() {
  try {
    return { ...defaultCalculator(), ...(JSON.parse(localStorage.getItem(KEY) || '{}') || {}) };
  } catch {
    return defaultCalculator();
  }
}

// Kalkulator inwestycyjny: dane wejściowe → wykres → wyniki liczbowe
export default function InvestmentCalculator() {
  const { isDark } = useApp();
  const chrome = chartChrome(isDark);
  const [p, setP] = useState(readParams);
  const [showTable, setShowTable] = useState(false);
  const set = (patch) =>
    setP((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // brak localStorage – parametry nie zostaną zapamiętane
      }
      return next;
    });

  const result = useMemo(() => simulateInvestment(p), [p]);
  const comparison = useMemo(() => compareAccounts(p), [p]);
  const best = comparison.reduce((b, c) => (!b || c.net > b.net ? c : b), null);
  const data = result.points.map((pt) => ({
    year: `${pt.year}`,
    contributed: pt.contributed,
    gain: Math.max(0, pt.value - pt.contributed),
    value: pt.value,
    real: pt.real,
  }));
  const cContrib = seriesColor(0, isDark);
  const cGain = seriesColor(2, isDark);
  const cReal = seriesColor(1, isDark);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 1. Dane wejściowe */}
      <Card title="Kalkulator inwestycyjny" subtitle="Procent składany z kapitalizacją miesięczną, kosztem TER i podatkiem wg rodzaju konta" icon={Calculator}>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Kapitał początkowy (zł)">
            <Input type="number" min="0" step="1000" value={p.initial} onChange={(e) => set({ initial: Math.max(0, Number(e.target.value) || 0) })} />
          </Field>
          <Slider label="Wpłata miesięczna" value={p.monthly} onChange={(v) => set({ monthly: v })} min={0} max={20000} step={100} format={(v) => formatPLN(v)} accent={cContrib} />
          <Slider label="Okres inwestycji" value={p.years} onChange={(v) => set({ years: v })} min={1} max={50} step={1} format={(v) => `${v} lat`} accent={cContrib} />
          <Slider label="Oczekiwana roczna stopa zwrotu" value={p.annualReturn} onChange={(v) => set({ annualReturn: v })} min={0} max={15} step={0.5} format={(v) => `${formatNumber(v, 1)}%`} accent={cGain} />
          <Slider label="Wzrost wpłat rok do roku" value={p.contributionGrowth} onChange={(v) => set({ contributionGrowth: v })} min={0} max={10} step={0.5} format={(v) => `${formatNumber(v, 1)}%`} accent={cContrib} />
          <Slider label="Koszt TER funduszy" value={p.ter} onChange={(v) => set({ ter: v })} min={0} max={2} step={0.05} format={(v) => `${formatNumber(v, 2)}%`} accent={seriesColor(7, isDark)} />
          <Slider label="Inflacja (wartość realna)" value={p.inflation} onChange={(v) => set({ inflation: v })} min={0} max={10} step={0.1} format={(v) => `${formatNumber(v, 1)}%`} accent={cReal} />
          <div className="space-y-1.5 sm:col-span-2 xl:col-span-2">
            <div className="text-xs font-medium text-stone-600 dark:text-stone-400">Rodzaj konta</div>
            <Segmented
              size="sm"
              value={p.account}
              onChange={(v) => set({ account: v })}
              ariaLabel="Rodzaj konta"
              options={[
                { value: 'REGULAR', label: 'Zwykłe (19%)' },
                { value: 'IKE', label: 'IKE' },
                { value: 'IKZE', label: 'IKZE' },
              ]}
            />
            {p.account === 'IKZE' && (
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Field label="Stawka PIT do ulgi (%)" className="w-36">
                  <Input type="number" min="0" max="32" value={p.pitRate} onChange={(e) => set({ pitRate: Number(e.target.value) || 0 })} />
                </Field>
                <Toggle checked={!!p.reinvestRefund} onChange={(v) => set({ reinvestRefund: v })} label="Reinwestuj zwrot PIT" />
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* 2. Wykres wynikowy */}
      <Card title={`Wzrost kapitału przez ${p.years} lat`} subtitle={CALC_ACCOUNTS[p.account].label} icon={LineIcon}>
        <Legend
          items={[
            { key: 'c', label: 'Wpłacony kapitał', color: cContrib, bar: true },
            { key: 'g', label: 'Zysk z procentu składanego', color: cGain, bar: true },
            { key: 'r', label: 'Wartość realna (po inflacji)', color: cReal, dashed: true },
          ]}
        />
        <div className="mt-2 h-72 sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={chrome.grid} vertical={false} />
              <XAxis dataKey="year" tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: chrome.axis }} minTickGap={16} tickFormatter={(y) => `${y} r.`} />
              <YAxis tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={72} tickFormatter={formatAxisPLN} />
              <Tooltip
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-white/10 dark:bg-neutral-900">
                      <div className="mb-1 font-medium">Rok {label}</div>
                      {payload.map((x) => (
                        <div key={x.dataKey} className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: x.color || x.stroke }} />
                          <span className="text-stone-500">{x.name}</span>
                          <span className="ml-auto pl-4 font-medium tabular">{formatPLN(x.value)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null
                }
                cursor={{ stroke: chrome.axis }}
              />
              <Area type="monotone" dataKey="contributed" name="Wpłaty" stackId="v" stroke={cContrib} fill={cContrib} fillOpacity={0.55} strokeWidth={1.5} isAnimationActive={false} />
              <Area type="monotone" dataKey="gain" name="Zysk" stackId="v" stroke={cGain} fill={cGain} fillOpacity={0.55} strokeWidth={1.5} isAnimationActive={false} />
              <Line type="monotone" dataKey="real" name="Wartość realna" stroke={cReal} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* 3. Wyniki liczbowe */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Wartość końcowa (brutto)" value={formatPLN(result.value)} sub={`po ${p.years} latach`} />
        <Tile label="Wpłacony kapitał" value={formatPLN(result.contributed)} sub={`zysk ${formatPLN(result.gain)}`} />
        <Tile label={p.account === 'REGULAR' ? 'Podatek Belki' : p.account === 'IKZE' ? 'Podatek 10% przy wypłacie' : 'Podatek'} value={formatPLN(result.tax)} sub={p.account === 'IKZE' ? `zwroty PIT ${formatPLN(result.refunds)}` : p.account === 'IKE' ? 'zwolnienie z Belki' : '19% od zysku'} />
        <Tile label="Na rękę (netto)" value={formatPLN(result.net)} sub={`×${formatNumber(result.multiple, 2)} wpłat · realnie ${formatPLN(result.netReal)}`} tone="text-emerald-700 dark:text-emerald-400" />
      </div>

      <Card title="Porównanie rodzajów kont" subtitle="Te same wpłaty i stopa zwrotu – różnica wynika wyłącznie z podatków" icon={Calculator} bodyClassName="p-0 sm:p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-stone-100 text-left text-xs text-stone-500 dark:border-white/5 dark:text-stone-400">
                <th className="px-4 py-2 font-medium sm:px-5">Konto</th>
                <th className="px-3 py-2 text-right font-medium">Wartość brutto</th>
                <th className="px-3 py-2 text-right font-medium">Podatek</th>
                <th className="px-3 py-2 text-right font-medium">Zwrot PIT</th>
                <th className="px-3 py-2 text-right font-medium">Netto</th>
                <th className="px-4 py-2 text-right font-medium sm:px-5">Netto realnie</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {comparison.map((c) => (
                <tr key={c.id} className={`border-b border-stone-100 last:border-0 dark:border-white/5 ${c.id === p.account ? 'bg-blue-50/50 dark:bg-blue-500/5' : ''}`}>
                  <td className="px-4 py-2 font-medium sm:px-5">
                    {c.label} {best?.id === c.id && <Badge tone="green">najkorzystniej</Badge>}
                  </td>
                  <td className="px-3 py-2 text-right">{formatPLN(c.value)}</td>
                  <td className="px-3 py-2 text-right text-red-600 dark:text-red-400">{c.tax ? `−${formatPLN(c.tax)}` : '0,00 zł'}</td>
                  <td className="px-3 py-2 text-right">{c.refunds ? formatPLN(c.refunds) : '—'}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatPLN(c.net)}</td>
                  <td className="px-4 py-2 text-right text-stone-500 sm:px-5">{formatPLN(c.netReal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 px-4 py-2.5 text-[11px] text-stone-500 sm:px-5 dark:border-white/5">
          <span>
            Koszt TER w całym okresie: <strong>{formatPLN(result.terCost)}</strong>. Wpłaty na IKE/IKZE w rzeczywistości ograniczają roczne limity – kalkulator ich nie przycina.
          </span>
          <button type="button" onClick={() => setShowTable((v) => !v)} className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400">
            <ListOrdered size={12} /> {showTable ? 'Ukryj' : 'Pokaż'} wyliczenia rok po roku
          </button>
        </div>
        {showTable && (
          <div className="max-h-80 overflow-auto border-t border-stone-100 dark:border-white/5">
            <table className="w-full min-w-[520px] text-xs">
              <thead className="sticky top-0 bg-white dark:bg-neutral-900">
                <tr className="text-left text-stone-500">
                  <th className="px-4 py-2 font-medium sm:px-5">Rok</th>
                  <th className="px-3 py-2 text-right font-medium">Wpłacono</th>
                  <th className="px-3 py-2 text-right font-medium">Zysk</th>
                  <th className="px-3 py-2 text-right font-medium">Wartość</th>
                  <th className="px-4 py-2 text-right font-medium sm:px-5">Realnie</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {result.points.slice(1).map((pt) => (
                  <tr key={pt.year} className="border-t border-stone-100 dark:border-white/5">
                    <td className="px-4 py-1.5 sm:px-5">{pt.year}</td>
                    <td className="px-3 py-1.5 text-right">{formatPLN(pt.contributed)}</td>
                    <td className="px-3 py-1.5 text-right">{formatPLN(pt.value - pt.contributed)}</td>
                    <td className="px-3 py-1.5 text-right font-medium">{formatPLN(pt.value)}</td>
                    <td className="px-4 py-1.5 text-right text-stone-500 sm:px-5">{formatPLN(pt.real)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-[11px] text-stone-500 dark:text-stone-500">Symulacja przy stałej stopie zwrotu – w rzeczywistości wyniki rynkowe są zmienne. Stopa {formatPercent((p.annualReturn - p.ter) / 100, { digits: 2 })} netto po TER.</p>
    </div>
  );
}

function Tile({ label, value, sub, tone = '' }) {
  return (
    <div className="min-w-0 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm sm:p-4 dark:border-white/10 dark:bg-neutral-900">
      <div className="truncate text-[11px] text-stone-500 sm:text-xs dark:text-stone-400">{label}</div>
      <div className={`mt-1 truncate text-lg font-semibold tabular ${tone}`}>{value}</div>
      {sub && <div className="truncate text-[11px] text-stone-500">{sub}</div>}
    </div>
  );
}
