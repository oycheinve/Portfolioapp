import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, CalendarClock, Check, ChevronDown, Coins, Landmark, ListTree, PiggyBank, Repeat, Scale, Snowflake, TrendingUp, Wallet, Waves } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { isoDay } from '../lib/engine.js';
import { cashFlowForecast, cashFlowSeries, multiYearForecast, normSources, passiveCoverage, upcomingCashEvents } from '../lib/cashflow.js';
import { chartChrome, seriesColor } from '../lib/colors.js';
import { formatAxisPLN, formatDate, formatPLN } from '../lib/format.js';
import { BetaBadge, Card, ChartTooltip, Field, Input, Segmented, Toggle } from '../components/ui.jsx';
import { Legend } from '../components/charts/chartUtils.jsx';
import { plannedBudget } from '../components/bonds/SafeGoalCard.jsx';

const pct = (v) => (v === null || !Number.isFinite(v) ? '—' : `${(v * 100).toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
const KIND = {
  dividends: { label: 'Dywidendy', icon: Coins, slot: 4 },
  interest: { label: 'Odsetki z KO', icon: PiggyBank, slot: 3 },
  bonds: { label: 'Obligacje', icon: Landmark, slot: 2 },
};
const SOURCES = [
  { key: 'dividends', label: 'Dywidendy (Akcje / ETF)' },
  { key: 'bonds', label: 'Obligacje skarbowe' },
  { key: 'interest', label: 'Konto oszczędnościowe' },
];
const HORIZONS = [1, 3, 5, 10, 20];
const yearsLabel = (n) => `${n} ${n === 1 ? 'rok' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'lata' : 'lat'}`;
const numOrEmpty = (v) => (v === '' ? '' : Math.max(0, Number(v)));
const inDaysLabel = (n) => (n === 0 ? 'dziś' : n === 1 ? 'jutro' : `za ${n} dni`);
const openKey = (id) => `fintrack-cf-open-${id}`; // rozwinięcie sekcji – tylko to urządzenie

function Mini({ label, value, sub, tone = '' }) {
  return (
    <div className="min-w-0 rounded-xl bg-stone-50 px-3 py-2.5 dark:bg-white/[0.03]">
      <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">{label}</div>
      <div className={`truncate text-base font-semibold tabular ${tone}`}>{value}</div>
      {sub && <div className="truncate text-[11px] text-stone-500 dark:text-stone-500">{sub}</div>}
    </div>
  );
}
const beta = (text) => (
  <>
    {text}
    <BetaBadge />
  </>
);

// Cash Flow Forecast (BETA): prognoza pasywnych przepływów na 12 miesięcy (dywidendy, odsetki z KO, obligacje) z wyborem
// źródeł, pokrycie budżetu, wolna gotówka, nadchodzące wypłaty (90 dni), podatek Belki / oszczędność IKE oraz symulator
// wieloletni (plan wpłat na IKE z granicznikiem, Dividend Yield portfela, poduszka rosnąca najwyżej do celu).
export default function CashFlowView() {
  const { state, actions, isDark } = useApp();
  const chrome = chartChrome(isDark);
  const today = isoDay(new Date());
  const prefs = state.settings.cashflow || {};
  const setPrefs = (patch) => actions.updateSettings({ cashflow: { ...prefs, ...patch } });
  const mode = prefs.mode === 'gross' ? 'gross' : 'net';
  const g = mode === 'gross';
  const sources = normSources(prefs.sources);
  const srcKey = `${sources.dividends}|${sources.bonds}|${sources.interest}`;
  const setSource = (k) => setPrefs({ sources: { ...sources, [k]: !sources[k] } });

  const f = useMemo(() => cashFlowForecast(state, { today, months: 12, sources }), [state, today, srcKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const budget = useMemo(() => plannedBudget(), [state.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const upcoming = useMemo(() => upcomingCashEvents(f, today, 90), [f, today]);
  const kinds = ['dividends', 'interest', 'bonds'].filter((k) => sources[k]);

  const rows = f.rows.map((r) => ({
    ...r,
    vDividends: g ? r.dividendsGross : r.dividends,
    vInterest: g ? r.interestGross : r.interest,
    vBonds: g ? r.bondsGross : r.bonds,
    value: g ? r.gross : r.net,
  }));
  const total = g ? f.totals.gross : f.totals.net;
  const avg = total / 12;
  // Wykres: zakres (kolejne / ostatnie 12 mies., rok kalendarzowy) i podstawa (naliczanie dzienne / realne wypłaty)
  const chartRange = ['next12', 'last12', 'calendar'].includes(prefs.chartRange) ? prefs.chartRange : 'next12';
  const chartBasis = prefs.chartBasis === 'payout' ? 'payout' : 'accrual';
  const series = useMemo(() => cashFlowSeries(state, { today, range: chartRange, basis: chartBasis, sources }), [state, today, chartRange, chartBasis, srcKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const chartRows = series.rows.map((r) => ({ ...r, vDividends: g ? r.dividendsGross : r.dividends, vInterest: g ? r.interestGross : r.interest, vBonds: g ? r.bondsGross : r.bonds }));
  const chartTotal = g ? series.totals.gross : series.totals.net;
  const chartAvg = chartTotal / 12;
  const rangeLabel = { next12: 'kolejne 12 mies.', last12: 'ostatnie 12 mies.', calendar: `rok ${today.slice(0, 4)}` }[chartRange];
  const color = (k) => seriesColor(KIND[k].slot, isDark);
  // Miesiące – harmonijka: rozwinięty jeden naraz
  const [open, setOpen] = useState(() => new Set([f.rows[0]?.key]));
  const toggle = (k) => setOpen((s) => (s.has(k) ? new Set() : new Set([k])));

  // Pokrycie i wolna gotówka (zawsze netto – realnie dostępne pieniądze)
  const cov = passiveCoverage(f.avgNet, { fixed: budget?.fixed || 0, total: budget?.total || 0 });
  const covNow = passiveCoverage(f.currentNet, { fixed: budget?.fixed || 0, total: budget?.total || 0 });
  const inflow = Number(prefs.monthlyIncome) || 0;
  const fcfAvg = inflow - (budget?.total || 0) + f.avgNet;
  const fcfNow = inflow - (budget?.total || 0) + f.currentNet;

  // Symulator wieloletni
  const years = HORIZONS.includes(Number(prefs.years)) ? Number(prefs.years) : 3;
  const drip = prefs.drip !== false;
  const contribution = Number(prefs.contribution) || 0;
  const ike = {
    mode: prefs.ikeMode === 'manual' ? 'manual' : 'auto',
    amount: Number(prefs.ikeAmount) || 0,
    period: prefs.ikePeriod === 'year' ? 'year' : 'month',
    stepEnabled: !!prefs.ikeStepEnabled,
    stepYears: Number(prefs.ikeStepYears) > 0 ? Math.round(Number(prefs.ikeStepYears)) : 3,
    stepAmount: Number(prefs.ikeStepAmount) || 0,
  };
  const ikeKey = JSON.stringify(ike);
  const goal = state.settings.safeGoal || {};
  const sim = useMemo(
    () => multiYearForecast(state, { today, years, sources, drip, otherContribution: contribution, ike, cushion: goal }),
    [state, today, years, drip, contribution, ikeKey, srcKey], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const last = sim.rows.at(-1);
  const cushionTarget = Number(goal.target) || 0;
  const cushionCapYear = sim.rows.find((r) => r.cushionCapped)?.year;
  const ikeSummary = `${formatPLN(sim.base)} / mies.${ike.stepEnabled ? ` → ${formatPLN(ike.stepAmount)} od ${ike.stepYears + 1}. roku` : ''} · ${ike.mode === 'manual' ? 'ręcznie' : 'z historii'}`;
  const dyLabel = sim.dy.basis === 'history' ? `wypłaty z 12 mies. ${formatPLN(sim.dy.received)}` : sim.dy.basis === 'forecast' ? `prognoza stawek ${formatPLN(sim.dy.received)} / rok` : 'brak dywidend';
  const nextUp = upcoming[0];

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Nagłówek: źródła i podsumowanie 12 miesięcy */}
      <section className="min-w-0 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5 dark:border-white/10 dark:bg-neutral-900" aria-label="Cash Flow Forecast">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              <Waves size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold">{beta('Cash Flow Forecast')}</h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">Pasywne przepływy – najbliższe 12 miesięcy ({formatDate(f.window.from)} – {formatDate(f.window.to)})</p>
            </div>
          </div>
          <Segmented size="sm" value={mode} onChange={(v) => setPrefs({ mode: v })} ariaLabel="Brutto czy netto" options={[{ value: 'net', label: 'Netto' }, { value: 'gross', label: 'Brutto' }]} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Źródła w obliczeniach">
          {SOURCES.map((s) => {
            const on = sources[s.key];
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={on}
                onClick={() => setSource(s.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  on ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200' : 'border-stone-200 bg-white text-stone-400 line-through dark:border-white/10 dark:bg-transparent dark:text-stone-500'
                }`}
              >
                <span className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${on ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-stone-300 dark:border-white/20'}`}>{on && <Check size={10} strokeWidth={3} />}</span>
                {s.label}
              </button>
            );
          })}
          <BetaBadge />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Mini label={`Suma 12 mies. (${g ? 'brutto' : 'netto'})`} value={formatPLN(total)} tone="text-emerald-700 dark:text-emerald-400" />
          <Mini label="Średnio / mies." value={formatPLN(avg)} />
          <Mini label="Bieżący miesiąc" value={formatPLN(g ? rows[0]?.gross : rows[0]?.net)} sub={rows[0]?.long} />
          <Mini label="Podatek Belki (12 mies.)" value={formatPLN(f.totals.tax)} sub={f.totals.ikeSaved > 0 ? `IKE/IKZE: oszczędzone ${formatPLN(f.totals.ikeSaved)}` : 'brak oszczędności IKE'} tone="text-red-600 dark:text-red-400" />
        </div>
        {kinds.length > 0 && (
          <div className={`mt-3 grid gap-2.5 ${kinds.length === 3 ? 'grid-cols-3' : kinds.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {kinds.map((k) => {
              const Icon = KIND[k].icon;
              const v = g ? rows.reduce((s, r) => s + r[`${k}Gross`], 0) : f.totals[k];
              return (
                <div key={k} className="min-w-0 rounded-xl border border-stone-100 px-2.5 py-2 dark:border-white/5">
                  <div className="flex items-center gap-1 text-[11px] text-stone-500 dark:text-stone-400">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color(k) }} />
                    <Icon size={12} className="shrink-0" /> <span className="truncate">{KIND[k].label}</span>
                  </div>
                  <div className="truncate text-sm font-semibold tabular">{formatPLN(v)}</div>
                </div>
              );
            })}
          </div>
        )}
        {!kinds.length && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">Wszystkie źródła są wyłączone – zaznacz przynajmniej jedno.</p>}
      </section>

      {/* Wykres: zakres i podstawa naliczania */}
      <Card collapsible defaultOpen storageKey={openKey('chart')} title={beta('Wykres przepływów')} summary={`${rangeLabel} · ${formatPLN(chartTotal)} · średnio ${formatPLN(chartAvg)} / mies.`} icon={BarChart3}>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented size="sm" value={chartRange} onChange={(v) => setPrefs({ chartRange: v })} ariaLabel="Zakres wykresu" options={[{ value: 'last12', label: 'Ostatnie 12 mies.' }, { value: 'next12', label: 'Kolejne 12 mies.' }, { value: 'calendar', label: 'Rok kalendarzowy' }]} />
          <Segmented size="sm" value={chartBasis} onChange={(v) => setPrefs({ chartBasis: v })} ariaLabel="Podstawa odsetek" options={[{ value: 'accrual', label: 'Naliczanie dzienne' }, { value: 'payout', label: 'Realne wypłaty' }]} />
        </div>
        <div className="mt-3">
          <Legend items={[...kinds.map((k) => ({ key: k, label: KIND[k].label, color: color(k), bar: true })), { key: 'avg', label: 'Średnia / mies.', color: chrome.muted, dashed: true }]} />
        </div>
        <div className="mt-2 h-60" aria-label="Wykres przepływów">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={chrome.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: chrome.muted, fontSize: 10 }} tickLine={false} axisLine={{ stroke: chrome.axis }} interval={0} angle={-35} textAnchor="end" height={38} />
              <YAxis tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={52} tickFormatter={formatAxisPLN} />
              <Tooltip content={<ChartTooltip formatter={(v) => formatPLN(v)} />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} />
              {sources.interest && <Bar dataKey="vInterest" name="Odsetki z KO" stackId="cf" fill={color('interest')} stroke={chrome.surface} strokeWidth={1} maxBarSize={30} isAnimationActive={false} />}
              {sources.bonds && <Bar dataKey="vBonds" name="Obligacje" stackId="cf" fill={color('bonds')} stroke={chrome.surface} strokeWidth={1} maxBarSize={30} isAnimationActive={false} />}
              {sources.dividends && (
                <Bar dataKey="vDividends" name="Dywidendy" stackId="cf" stroke={chrome.surface} strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={30} isAnimationActive={false} fill={color('dividends')} />
              )}
              <ReferenceLine y={chartAvg} stroke={chrome.muted} strokeDasharray="5 4" ifOverflow="extendDomain" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[11px] text-stone-500 dark:text-stone-400">
          {chartBasis === 'accrual'
            ? 'Naliczanie dzienne: odsetki z obligacji przyrastają dzień po dniu od daty zakupu (bez skoków przy kapitalizacji i wykupie), odsetki z KO – w miesiącu, w którym narosły. Dywidendy – w dniu wypłaty.'
            : 'Realne wypłaty: dywidendy w dniu wypłaty, kupony i wykup obligacji, dopisanie odsetek na KO (dzień księgowania wg historii konta).'}{' '}
          {chartRange === 'next12' ? 'Prognoza od dziś.' : chartRange === 'last12' ? 'Historia z rejestru (bieżący miesiąc: do dziś + prognoza).' : 'Minione miesiące z rejestru, kolejne z prognozy.'}
        </p>
      </Card>

      {/* Tabela miesiąc po miesiącu */}
      <Card collapsible storageKey={openKey('months')} title={beta('Miesiąc po miesiącu')} summary={`${rows.filter((r) => r.value > 0).length} z 12 mies. z wpływami · ${f.events.length} wypłat`} icon={ListTree}>
        <ul className="divide-y divide-stone-100 rounded-xl border border-stone-100 dark:divide-white/5 dark:border-white/5" aria-label="Prognoza miesiąc po miesiącu">
          {rows.map((r) => {
            const isOpen = open.has(r.key);
            return (
              <li key={r.key}>
                <button type="button" onClick={() => toggle(r.key)} aria-expanded={isOpen} className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-stone-50 dark:hover:bg-white/[0.03]">
                  <span className="min-w-0 flex-1 text-sm font-medium first-letter:uppercase">{r.long}</span>
                  <span className="text-[11px] text-stone-400 tabular">{r.items.length} poz.</span>
                  <span className={`w-24 text-right text-sm font-semibold tabular ${r.value > 0 ? '' : 'text-stone-400'}`}>{formatPLN(r.value)}</span>
                  <ChevronDown size={15} className={`shrink-0 text-stone-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <ul className="space-y-1 px-3 pb-3">
                    {!r.items.length && <li className="text-xs text-stone-500 dark:text-stone-400">Brak prognozowanych wpływów w tym miesiącu.</li>}
                    {r.items.map((it, i) => (
                      <li key={`${it.date}-${it.label}-${i}`} className="flex items-start gap-2 rounded-lg bg-stone-50 px-2.5 py-1.5 text-xs dark:bg-white/[0.03]">
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: color(it.kind) }} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-stone-800 dark:text-stone-100">
                            {it.label} <span className="font-normal text-stone-400">· {formatDate(it.date)} · {it.status}</span>
                          </span>
                          <span className="block truncate text-[11px] text-stone-500 dark:text-stone-400">{it.detail}</span>
                        </span>
                        <span className="shrink-0 text-right tabular">
                          <span className="block font-semibold">{formatPLN(g ? it.gross : it.net)}</span>
                          <span className="block text-[10px] text-stone-400">{g ? `netto ${formatPLN(it.net)}` : `brutto ${formatPLN(it.gross)}`}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-stone-500 dark:text-stone-400">Dywidendy: ogłoszone i w drodze z harmonogramu (np. transze Grupy Kęty) oraz prognoza z wypłat z ostatnich 12 miesięcy dla obecnej liczby akcji. KO: odsetki w dniach kapitalizacji przy obecnym saldzie. Obligacje: kupony i odsetki przy wykupie (inflacja CPI z GUS). Netto: Belka 19%, IKE/IKZE 0%.</p>
      </Card>

      {/* Pokrycie wydatków */}
      <Card collapsible defaultOpen storageKey={openKey('coverage')} title={beta('Pokrycie wydatków')} summary={budget ? `${pct(cov.fixed)} stałych kosztów · ${pct(cov.total)} budżetu` : 'uzupełnij plan w Budżecie'} subtitle="Dochód pasywny netto vs plan z modułu Budżet" icon={Scale}>
        {budget ? (
          <>
            <p className="text-sm text-stone-700 dark:text-stone-200">
              Twój dochód pasywny pokrywa <strong className="text-emerald-700 tabular dark:text-emerald-400">{pct(cov.fixed)}</strong> stałych kosztów miesięcznych i <strong className="tabular">{pct(cov.total)}</strong> całego budżetu.
            </p>
            <div className="mt-3 space-y-2.5">
              {[
                ['Stałe koszty', budget.fixed, cov.fixed, covNow.fixed],
                ['Cały budżet', budget.total, cov.total, covNow.total],
              ].map(([label, amount, c, cNow]) => (
                <div key={label}>
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="text-stone-600 dark:text-stone-300">
                      {label} · {formatPLN(amount)} / mies.
                    </span>
                    <span className="font-semibold tabular">
                      {pct(c)} <span className="font-normal text-stone-400">(teraz {pct(cNow)})</span>
                    </span>
                  </div>
                  <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-stone-100 dark:bg-white/[0.07]">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400" style={{ width: `${Math.min(1, c || 0) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-stone-500 dark:text-stone-400">Uzupełnij plan w module Budżet, aby zobaczyć, jaką część kosztów finansuje dochód pasywny.</p>
        )}
        <div className="mt-4 border-t border-stone-100 pt-3 dark:border-white/5">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Wallet size={15} /> Free Cash Flow – wolna gotówka
          </h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <Field label="Miesięczne wpływy (zł)" hint="np. wynagrodzenie netto">
              <Input type="number" inputMode="decimal" min="0" step="100" placeholder="np. 7000" value={prefs.monthlyIncome ?? ''} onChange={(e) => setPrefs({ monthlyIncome: numOrEmpty(e.target.value) })} aria-label="Miesięczne wpływy" />
            </Field>
            <Mini label="Do zainwestowania – średnio / mies." value={formatPLN(fcfAvg)} sub={`${formatPLN(inflow)} − budżet ${formatPLN(budget?.total || 0)} + pasywne ${formatPLN(f.avgNet)}`} tone={fcfAvg >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'} />
            <Mini label="Do zainwestowania – bieżący miesiąc" value={formatPLN(fcfNow)} sub={`pasywne w tym miesiącu ${formatPLN(f.currentNet)}`} tone={fcfNow >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'} />
          </div>
        </div>
      </Card>

      {/* Nadchodzące wypłaty – 90 dni */}
      <Card collapsible storageKey={openKey('upcoming')} title={beta('Nadchodzące wypłaty')} summary={nextUp ? `${upcoming.length} w 90 dni · najbliższa ${formatDate(nextUp.date)} +${formatPLN(nextUp.net)}` : 'brak w 90 dni'} subtitle="Najbliższe 90 dni – kwoty netto" icon={CalendarClock}>
        {upcoming.length ? (
          <ol className="relative space-y-2 border-l border-stone-200 pl-4 dark:border-white/10" aria-label="Oś czasu wypłat">
            {upcoming.map((e, i) => (
              <li key={`${e.date}-${e.label}-${i}`} className="relative">
                <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full ring-4 ring-white dark:ring-neutral-900" style={{ background: color(e.kind) }} />
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{e.label}</div>
                    <div className="text-[11px] text-stone-500 dark:text-stone-400">
                      {formatDate(e.date)} · <span className="font-semibold text-blue-600 dark:text-blue-400">{inDaysLabel(e.inDays)}</span> · {e.status}
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular text-emerald-700 dark:text-emerald-400">+{formatPLN(e.net)}</span>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-stone-500 dark:text-stone-400">Brak prognozowanych wypłat w najbliższych 90 dniach.</p>
        )}
      </Card>

      {/* Plan wpłat na IKE */}
      <Card collapsible storageKey={openKey('ike')} title={beta('Wpłaty na IKE (XTB)')} summary={ikeSummary} subtitle="Tempo dopłat do IKE w symulatorze wieloletnim" icon={TrendingUp}>
        <div className="mb-1 text-[11px] font-medium text-stone-500 dark:text-stone-400">Wpłaty bazowe</div>
        <Segmented size="sm" value={ike.mode} onChange={(v) => setPrefs({ ikeMode: v })} ariaLabel="Metoda szacowania wpłat na IKE" options={[{ value: 'auto', label: 'Z historii wpłat' }, { value: 'manual', label: 'Wpisz ręcznie' }]} />
        {ike.mode === 'auto' ? (
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <Mini label="Średnio / mies." value={formatPLN(sim.hist.monthly)} sub={sim.hist.first ? `od ${formatDate(sim.hist.first)} (${sim.hist.months} mies.)` : 'brak wpłat w rejestrze'} />
            <Mini label="Średnio / rok" value={formatPLN(sim.hist.yearly)} />
            <Mini label="Wpłacono łącznie" value={formatPLN(sim.hist.total)} sub={`${sim.hist.count} wpłat (rejestr / import XTB)`} />
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <Field label="Kwota (zł)" className="w-36">
              <Input type="number" inputMode="decimal" min="0" step="100" placeholder="np. 600" value={prefs.ikeAmount ?? ''} onChange={(e) => setPrefs({ ikeAmount: numOrEmpty(e.target.value) })} aria-label="Deklarowana wpłata na IKE" />
            </Field>
            <Segmented size="sm" value={ike.period} onChange={(v) => setPrefs({ ikePeriod: v })} ariaLabel="Okres wpłaty" options={[{ value: 'month', label: '/ mies.' }, { value: 'year', label: '/ rok' }]} />
          </div>
        )}
        <div className="mt-4 border-t border-stone-100 pt-3 dark:border-white/5">
          <Toggle checked={ike.stepEnabled} onChange={(v) => setPrefs({ ikeStepEnabled: v })} label={beta('Próg zmiany wpłat (Granicznik)')} description="Skokowa zmiana miesięcznej wpłaty po wskazanej liczbie lat (dwuetapowy plan)." />
          {ike.stepEnabled && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Etap 1: przez (lat)" hint={`wpłata ${formatPLN(sim.base)} / mies.`}>
                <Input type="number" inputMode="numeric" min="1" max="40" step="1" value={prefs.ikeStepYears ?? 3} onChange={(e) => setPrefs({ ikeStepYears: e.target.value === '' ? '' : Math.min(40, Math.max(1, Math.round(Number(e.target.value)))) })} aria-label="Liczba lat do granicznika" />
              </Field>
              <Field label={`Etap 2: od ${ike.stepYears + 1}. roku (zł / mies.)`}>
                <Input type="number" inputMode="decimal" min="0" step="100" placeholder="np. 2000" value={prefs.ikeStepAmount ?? ''} onChange={(e) => setPrefs({ ikeStepAmount: numOrEmpty(e.target.value) })} aria-label="Wpłata po graniczniku" />
              </Field>
            </div>
          )}
        </div>
        <p className="mt-3 rounded-lg bg-stone-50 px-3 py-2 text-[11px] text-stone-500 dark:bg-white/[0.03] dark:text-stone-400">
          Dywidendy z IKE (obecny portfel, nowe wpłaty i DRIP) liczone wg Dividend Yield portfela: <strong className="text-stone-700 tabular dark:text-stone-200">{pct(sim.dy.rate)}</strong> ({dyLabel} / wartość {sim.dy.scope === 'IKE' ? 'IKE' : 'portfela inwestycyjnego – IKE bez dywidend'} {formatPLN(sim.dy.value)}; kapitał IKE {formatPLN(sim.dy.ikeValue)}). Wpłaty od przyszłego miesiąca, w każdym roku najwyżej do limitu IKE.
        </p>
      </Card>

      {/* Symulator wieloletni (kula śnieżna) */}
      <Card collapsible defaultOpen storageKey={openKey('snowball')} title={beta('Kula śnieżna')} summary={last ? `za ${yearsLabel(years)}: ${formatPLN(last.monthly)} / mies. · DRIP ${drip ? 'wł.' : 'wył.'} · kapitał ${formatPLN(last.capital)}` : ''} subtitle="Wieloletnia prognoza dochodu pasywnego netto" icon={Snowflake}>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="mb-1 text-[11px] font-medium text-stone-500 dark:text-stone-400">Horyzont</div>
            <Segmented size="sm" value={String(years)} onChange={(v) => setPrefs({ years: Number(v) })} ariaLabel="Horyzont symulacji" options={HORIZONS.map((n) => ({ value: String(n), label: n === 1 ? '1 rok' : `${n} l.` }))} />
          </div>
          <Field label="Dopłata poza IKE / mies. (zł)" className="w-44">
            <Input type="number" inputMode="decimal" min="0" step="100" placeholder="0" value={prefs.contribution ?? ''} onChange={(e) => setPrefs({ contribution: numOrEmpty(e.target.value) })} aria-label="Miesięczna dopłata w symulacji" />
          </Field>
        </div>
        <div className={`mt-3 rounded-xl border px-3 py-2.5 ${drip ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/25 dark:bg-emerald-500/10' : 'border-stone-200 bg-stone-50 dark:border-white/10 dark:bg-white/[0.03]'}`}>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold">
            <Repeat size={15} className={drip ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-400'} />
            Reinwestycja dywidend (DRIP):
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${drip ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-neutral-950' : 'bg-stone-300 text-stone-700 dark:bg-white/15 dark:text-stone-200'}`}>{drip ? 'Włączona' : 'Wyłączona'}</span>
          </div>
          <Toggle
            checked={drip}
            onChange={(v) => setPrefs({ drip: v })}
            label="Reinwestuj 100% dywidend i odsetek"
            description={
              drip
                ? `Co miesiąc otrzymane dywidendy (IKE: Dividend Yield ${pct(sim.dy.rate)}, pozostałe pozycje: ${pct(sim.otherRate)} netto) i odsetki z poduszki (do progu celu) są dopisywane do kapitału i od następnego miesiąca same generują przepływy. Łącznie reinwestowane: ${formatPLN(last?.reinvestedTotal || 0)}.`
                : 'Dywidendy i odsetki są wypłacane (nie powiększają kapitału) – kapitał rośnie tylko o wpłaty i dopłaty.'
            }
          />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm tabular" aria-label="Symulacja wieloletnia">
            <thead>
              <tr className="text-left text-[11px] text-stone-500 dark:text-stone-400">
                <th className="py-1.5 font-medium">Rok</th>
                <th className="py-1.5 text-right font-medium">Kapitał</th>
                <th className="py-1.5 text-right font-medium">Wpłaty IKE</th>
                <th className="py-1.5 text-right font-medium">Dochód / rok</th>
                <th className="py-1.5 text-right font-medium">Reinwest.</th>
                <th className="py-1.5 text-right font-medium">/ mies.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-white/5">
              <tr className="text-stone-500 dark:text-stone-400">
                <td className="py-1.5">Teraz</td>
                <td className="py-1.5 text-right">{formatPLN(sim.capital0)}</td>
                <td className="py-1.5 text-right">—</td>
                <td className="py-1.5 text-right">—</td>
                <td className="py-1.5 text-right">{formatPLN(f.totals.net)}</td>
                <td className="py-1.5 text-right">{formatPLN(f.avgNet)}</td>
              </tr>
              {sim.rows.map((r) => (
                <tr key={r.year} className={ike.stepEnabled && r.year === ike.stepYears + 1 ? 'bg-blue-50/60 dark:bg-blue-500/10' : ''}>
                  <td className="py-1.5">
                    <Repeat size={11} className="mr-1 inline text-stone-400" />
                    {r.year}
                    {r.cushionCapped && (sources.bonds || sources.interest) && cushionTarget > 0 && (
                      <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400" title="Poduszka na progu celu">
                        cel
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-right">{formatPLN(r.capital)}</td>
                  <td className="py-1.5 text-right">
                    {formatPLN(r.ikeDeposits)}
                    {r.limitCut > 0.5 && <span className="block text-[10px] text-amber-600 dark:text-amber-400">limit −{formatPLN(r.limitCut)}</span>}
                  </td>
                  <td className="py-1.5 text-right font-semibold text-emerald-700 dark:text-emerald-400">{formatPLN(r.annual)}</td>
                  <td className="py-1.5 text-right text-stone-500 dark:text-stone-400">{drip ? `+${formatPLN(r.reinvested)}` : '—'}</td>
                  <td className="py-1.5 text-right">{formatPLN(r.monthly)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-stone-500 dark:text-stone-400">
          {ike.stepEnabled ? `Granicznik: od ${ike.stepYears + 1}. roku wpłata ${formatPLN(ike.stepAmount)} / mies. (wyróżniony wiersz). ` : ''}
          {sources.bonds || sources.interest
            ? cushionTarget > 0
              ? `Poduszka rośnie${drip ? '' : ' (tylko o dopłaty – DRIP wył.)'} najwyżej do celu ${formatPLN(sim.cushion.cap)}${cushionCapYear ? ` (osiągnięty w ${cushionCapYear}. roku)` : ''} – potem odsetki liczone od kwoty celu.`
              : drip
                ? 'Poduszka bez celu – rośnie o odsetki i dopłatę z zakładki Poduszka finansowa.'
                : 'Poduszka bez celu – odsetki wypłacane (DRIP wył.), rośnie tylko o dopłatę z zakładki Poduszka finansowa.'
            : 'Poduszka wyłączona z obliczeń.'}
        </p>
      </Card>
    </div>
  );
}
