import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, Briefcase, Coins, Layers, Zap } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { STRESS_PRESETS, runStress } from '../lib/stress.js';
import { ACCOUNT_TYPES } from '../lib/constants.js';
import { chartChrome, seriesColor } from '../lib/colors.js';
import { formatAxisPLN, formatNumber, formatPLN, formatPercent, signClass } from '../lib/format.js';
import { Card, ChartTooltip, Slider, Toggle } from '../components/ui.jsx';
import { Legend } from '../components/charts/chartUtils.jsx';

const DEFAULT_SHOCK = { stocks: -15, etf: -15, usd: 0, eur: 0, other: 0, plnOnly: false };

function pctLabel(v) {
  return `${v > 0 ? '+' : ''}${formatNumber(v, 0)}%`;
}

export default function StressTestView() {
  const { state, isDark } = useApp();
  const chrome = chartChrome(isDark);
  const [shock, setShock] = useState(DEFAULT_SHOCK);
  const [linked, setLinked] = useState(true);
  const result = useMemo(() => runStress(state, shock), [state, shock]);
  const set = (patch) => setShock((s) => ({ ...s, ...patch }));
  const setMarket = (v) => (linked ? set({ stocks: v, etf: v }) : set({ stocks: v }));
  const before = seriesColor(0, isDark);
  const after = isDark ? '#e66767' : '#d03b3b';

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Wynik */}
      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6 dark:border-white/10 dark:bg-neutral-900">
        <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
          <Zap size={16} className="text-amber-500" /> Symulator „Co jeśli” – majątek całkowity po szoku
        </div>
        <div className="mt-2 grid gap-4 sm:grid-cols-3">
          <div>
            <div className="text-xs text-stone-500">Przed</div>
            <div className="text-2xl font-semibold tabular">{formatPLN(result.before)}</div>
          </div>
          <div>
            <div className="text-xs text-stone-500">Po szoku</div>
            <div className="text-2xl font-semibold tabular">{formatPLN(result.after)}</div>
          </div>
          <div>
            <div className="text-xs text-stone-500">Zmiana</div>
            <div className={`text-2xl font-semibold tabular ${signClass(result.delta)}`}>
              {formatPLN(result.delta, { sign: true })} <span className="text-base">({formatPercent(result.deltaPct, { sign: true })})</span>
            </div>
          </div>
        </div>
        <div className="mt-3 text-xs text-stone-500 dark:text-stone-400">
          Udział aktywów bezpiecznych: {formatPercent(result.safeShareBefore, { digits: 1 })} → <strong>{formatPercent(result.safeShareAfter, { digits: 1 })}</strong> · portfel inwestycyjny{' '}
          {formatPLN(result.portfolioBefore, { compact: true })} → {formatPLN(result.portfolioAfter, { compact: true })}
        </div>
      </section>

      <div className="grid items-start gap-4 sm:gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Card title="Scenariusz" subtitle="Suwaki nagłych zdarzeń rynkowych i walutowych" icon={Activity}>
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {STRESS_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setShock({ ...DEFAULT_SHOCK, ...p.values });
                    setLinked(p.values.stocks === p.values.etf);
                  }}
                  className="rounded-full border border-stone-200 px-3 py-1 text-xs font-medium hover:bg-stone-100 dark:border-white/10 dark:hover:bg-white/5"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Slider label={linked ? 'Korekta akcji i ETF' : 'Korekta akcji'} value={shock.stocks} onChange={setMarket} min={-50} max={0} step={1} format={pctLabel} accent={after} />
            <Toggle checked={linked} onChange={(v) => { setLinked(v); if (v) set({ etf: shock.stocks }); }} label="Ta sama korekta dla akcji i ETF" />
            {!linked && <Slider label="Korekta ETF" value={shock.etf} onChange={(v) => set({ etf: v })} min={-50} max={0} step={1} format={pctLabel} accent={after} />}
            <Toggle checked={!!shock.plnOnly} onChange={(v) => set({ plnOnly: v })} label="Korekta tylko dla instrumentów w PLN (GPW)" />
            <Slider label="Kurs USD/PLN" value={shock.usd} onChange={(v) => set({ usd: v })} min={-10} max={10} step={1} format={pctLabel} accent={seriesColor(6, isDark)} hint="+ = słabszy złoty (zysk na aktywach w USD)" />
            <Slider label="Kurs EUR/PLN" value={shock.eur} onChange={(v) => set({ eur: v })} min={-10} max={10} step={1} format={pctLabel} accent={seriesColor(1, isDark)} />
            <Slider label="Nieruchomości / inne aktywa" value={shock.other} onChange={(v) => set({ other: v })} min={-30} max={10} step={1} format={pctLabel} accent={seriesColor(4, isDark)} hint={state.settings.includeOtherAssets ? 'Działa na wartość brutto – kredyt bez zmian' : 'Kategoria wyłączona z majątku w ustawieniach'} />
            <button type="button" className="text-xs text-blue-600 hover:underline dark:text-blue-400" onClick={() => { setShock(DEFAULT_SHOCK); setLinked(true); }}>
              Przywróć domyślne (−15%)
            </button>
          </div>
        </Card>

        <div className="min-w-0 space-y-4 sm:space-y-6">
          <Card title="Klasy aktywów: przed i po" subtitle="Wykres bez nieruchomości – ich zmiana w zestawieniu poniżej" icon={Layers}>
            <Legend
              items={[
                { key: 'b', label: 'Przed', color: before, bar: true },
                { key: 'a', label: 'Po szoku', color: after, bar: true },
              ]}
            />
            <div className="mt-2 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={result.classes.filter((c) => c.key !== 'OTHER')} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barGap={2}>
                  <CartesianGrid stroke={chrome.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: chrome.axis }} interval={0} />
                  <YAxis tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={58} tickFormatter={formatAxisPLN} />
                  <Tooltip content={<ChartTooltip formatter={(v) => formatPLN(v)} />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} />
                  <Bar dataKey="before" name="Przed" fill={before} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
                  <Bar dataKey="after" name="Po szoku" fill={after} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {result.classes.map((c) => (
                <li key={c.key} className="flex justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2 dark:bg-white/[0.03]">
                  <span>{c.label}</span>
                  <span className={`tabular font-medium ${signClass(c.after - c.before)}`}>
                    {formatPLN(c.after - c.before, { sign: true })} ({formatPercent(c.before ? c.after / c.before - 1 : 0, { sign: true, digits: 1 })})
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Wpływ na konta" icon={Briefcase} bodyClassName="p-0 sm:p-0">
            <ul className="divide-y divide-stone-100 dark:divide-white/5">
              {result.accounts.map((a) => {
                const d = a.after - a.before;
                const pct = a.before ? d / a.before : 0;
                return (
                  <li key={a.account.id} className="px-4 py-3 sm:px-5">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: ACCOUNT_TYPES[a.account.type]?.color }} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.account.name}</span>
                      <span className={`text-sm font-semibold tabular ${signClass(d)}`}>{formatPLN(d, { sign: true })}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100 dark:bg-white/5">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.abs(pct) * 200)}%`, background: d < 0 ? after : seriesColor(2, isDark) }} />
                      </div>
                      <span className="w-40 text-right text-xs text-stone-500 tabular">
                        {formatPLN(a.before, { compact: true })} → {formatPLN(a.after, { compact: true })} ({formatPercent(pct, { sign: true, digits: 1 })})
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            <Card title="Ekspozycja walutowa" icon={Coins} bodyClassName="p-0 sm:p-0">
              <ul className="divide-y divide-stone-100 dark:divide-white/5">
                {result.currencies.map((c) => (
                  <li key={c.currency} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-5">
                    <span className="font-medium">{c.currency}</span>
                    <span className="text-xs text-stone-500 tabular">{formatPLN(c.before, { compact: true })} → {formatPLN(c.after, { compact: true })}</span>
                    <span className={`tabular font-medium ${signClass(c.after - c.before)}`}>{formatPercent(c.before ? c.after / c.before - 1 : 0, { sign: true, digits: 1 })}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Najbardziej dotknięte pozycje" icon={Zap} bodyClassName="p-0 sm:p-0">
              <ul className="divide-y divide-stone-100 dark:divide-white/5">
                {result.positions.slice(0, 6).map((p) => (
                  <li key={p.key} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-5">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{p.instrument?.ticker}</span> <span className="text-xs text-stone-500">{p.account?.name}</span>
                    </span>
                    <span className={`shrink-0 tabular font-medium ${signClass(p.delta)}`}>{formatPLN(p.delta, { sign: true })}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <p className="text-[11px] text-stone-500 dark:text-stone-500">
            Symulacja natychmiastowa: zmiana ceny w walucie notowań × zmiana kursu waluty. Obligacje skarbowe i gotówka bez zmian. To uproszczony test warunków skrajnych, nie prognoza.
          </p>
        </div>
      </div>
    </div>
  );
}
