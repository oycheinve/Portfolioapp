import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarClock, ChevronDown, Coins, Landmark, PiggyBank, Repeat, Scale, Snowflake, Wallet, Waves } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { isoDay, livePriceLookup, valuePortfolio } from '../lib/engine.js';
import { dividendPositions } from '../lib/dividends.js';
import { savingsProjection } from '../lib/savings.js';
import { cashFlowForecast, passiveCoverage, snowball, upcomingCashEvents } from '../lib/cashflow.js';
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
const inDaysLabel = (n) => (n === 0 ? 'dziś' : n === 1 ? 'jutro' : `za ${n} dni`);

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

// Cash Flow Forecast (BETA): prognoza pasywnych przepływów na 12 miesięcy (dywidendy, odsetki z KO, obligacje),
// pokrycie budżetu, wolna gotówka, nadchodzące wypłaty (90 dni), podatek Belki / oszczędność IKE i kula śnieżna.
export default function CashFlowView() {
  const { state, actions, isDark } = useApp();
  const chrome = chartChrome(isDark);
  const today = isoDay(new Date());
  const prefs = state.settings.cashflow || {};
  const setPrefs = (patch) => actions.updateSettings({ cashflow: { ...prefs, ...patch } });
  const mode = prefs.mode === 'gross' ? 'gross' : 'net';
  const g = mode === 'gross';

  const f = useMemo(() => cashFlowForecast(state, { today, months: 12 }), [state, today]);
  const budget = useMemo(() => plannedBudget(), [state.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const upcoming = useMemo(() => upcomingCashEvents(f, today, 90), [f, today]);
  // Kapitał dochodowy: pozycje z dywidendą + salda kont oszczędnościowych + aktywne obligacje
  const capital = useMemo(() => {
    const divCap = dividendPositions(state, today).filter((p) => p.annualGross > 0).reduce((s, p) => s + (p.value || 0), 0);
    const sav = state.accounts.filter((a) => a.type === 'SAVINGS').reduce((s, a) => s + Math.max(0, savingsProjection(state, a, today).balance), 0);
    const v = valuePortfolio(state, { asOf: today, accountIds: null, priceLookup: livePriceLookup(state) });
    const bonds = v.bonds.filter((b) => b.value > 0).reduce((s, b) => s + b.value, 0);
    return divCap + sav + bonds;
  }, [state, today]);

  const rows = f.rows.map((r) => ({
    ...r,
    vDividends: g ? r.dividendsGross : r.dividends,
    vInterest: g ? r.interestGross : r.interest,
    vBonds: g ? r.bondsGross : r.bonds,
    value: g ? r.gross : r.net,
  }));
  const total = g ? f.totals.gross : f.totals.net;
  const avg = total / 12;
  const color = (k) => seriesColor(KIND[k].slot, isDark);
  const [open, setOpen] = useState(() => new Set([f.rows[0]?.key]));
  const toggle = (k) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  // Pokrycie i wolna gotówka (zawsze netto – realnie dostępne pieniądze)
  const cov = passiveCoverage(f.avgNet, { fixed: budget?.fixed || 0, total: budget?.total || 0 });
  const covNow = passiveCoverage(f.currentNet, { fixed: budget?.fixed || 0, total: budget?.total || 0 });
  const inflow = Number(prefs.monthlyIncome) || 0;
  const fcfAvg = inflow - (budget?.total || 0) + f.avgNet;
  const fcfNow = inflow - (budget?.total || 0) + f.currentNet;

  // Kula śnieżna
  const years = [1, 3, 5].includes(Number(prefs.years)) ? Number(prefs.years) : 3;
  const drip = prefs.drip !== false;
  const contribution = Number(prefs.contribution) || 0;
  const sim = snowball({ annualIncome: f.totals.net, capital, years, monthlyContribution: contribution, drip });

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Nagłówek i podsumowanie 12 miesięcy */}
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
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Mini label={`Suma 12 mies. (${g ? 'brutto' : 'netto'})`} value={formatPLN(total)} tone="text-emerald-700 dark:text-emerald-400" />
          <Mini label="Średnio / mies." value={formatPLN(avg)} />
          <Mini label="Bieżący miesiąc" value={formatPLN(g ? rows[0]?.gross : rows[0]?.net)} sub={rows[0]?.long} />
          <Mini label="Podatek Belki (12 mies.)" value={formatPLN(f.totals.tax)} sub={f.totals.ikeSaved > 0 ? `IKE/IKZE: oszczędzone ${formatPLN(f.totals.ikeSaved)}` : 'brak oszczędności IKE'} tone="text-red-600 dark:text-red-400" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2.5">
          {['dividends', 'interest', 'bonds'].map((k) => {
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

        {/* Wykres skumulowany 12 miesięcy z linią średniej */}
        <div className="mt-4">
          <Legend items={[...['dividends', 'interest', 'bonds'].map((k) => ({ key: k, label: KIND[k].label, color: color(k), bar: true })), { key: 'avg', label: 'Średnia / mies.', color: chrome.muted, dashed: true }]} />
        </div>
        <div className="mt-2 h-60" aria-label="Wykres prognozy przepływów">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={chrome.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: chrome.muted, fontSize: 10 }} tickLine={false} axisLine={{ stroke: chrome.axis }} interval={0} angle={-35} textAnchor="end" height={38} />
              <YAxis tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={52} tickFormatter={formatAxisPLN} />
              <Tooltip content={<ChartTooltip formatter={(v) => formatPLN(v)} />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} />
              <Bar dataKey="vInterest" name="Odsetki z KO" stackId="cf" fill={color('interest')} stroke={chrome.surface} strokeWidth={1} maxBarSize={30} isAnimationActive={false} />
              <Bar dataKey="vBonds" name="Obligacje" stackId="cf" fill={color('bonds')} stroke={chrome.surface} strokeWidth={1} maxBarSize={30} isAnimationActive={false} />
              <Bar dataKey="vDividends" name="Dywidendy" stackId="cf" fill={color('dividends')} stroke={chrome.surface} strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={30} isAnimationActive={false} />
              <ReferenceLine y={avg} stroke={chrome.muted} strokeDasharray="5 4" ifOverflow="extendDomain" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tabela miesiąc po miesiącu */}
        <ul className="mt-3 divide-y divide-stone-100 rounded-xl border border-stone-100 dark:divide-white/5 dark:border-white/5" aria-label="Prognoza miesiąc po miesiącu">
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
      </section>

      {/* Pokrycie wydatków */}
      <Card title={beta('Pokrycie wydatków')} subtitle="Dochód pasywny netto vs plan z modułu Budżet" icon={Scale}>
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
              <Input type="number" inputMode="decimal" min="0" step="100" placeholder="np. 7000" value={prefs.monthlyIncome ?? ''} onChange={(e) => setPrefs({ monthlyIncome: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) })} aria-label="Miesięczne wpływy" />
            </Field>
            <Mini label="Do zainwestowania – średnio / mies." value={formatPLN(fcfAvg)} sub={`${formatPLN(inflow)} − budżet ${formatPLN(budget?.total || 0)} + pasywne ${formatPLN(f.avgNet)}`} tone={fcfAvg >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'} />
            <Mini label="Do zainwestowania – bieżący miesiąc" value={formatPLN(fcfNow)} sub={`pasywne w tym miesiącu ${formatPLN(f.currentNet)}`} tone={fcfNow >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'} />
          </div>
        </div>
      </Card>

      {/* Nadchodzące wypłaty – 90 dni */}
      <Card title={beta('Nadchodzące wypłaty')} subtitle="Najbliższe 90 dni – kwoty netto" icon={CalendarClock}>
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

      {/* Kula śnieżna */}
      <Card title={beta('Kula śnieżna')} subtitle="Wzrost dochodu pasywnego netto w kolejnych latach" icon={Snowflake}>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="mb-1 text-[11px] font-medium text-stone-500 dark:text-stone-400">Horyzont</div>
            <Segmented size="sm" value={String(years)} onChange={(v) => setPrefs({ years: Number(v) })} ariaLabel="Horyzont symulacji" options={[{ value: '1', label: '1 rok' }, { value: '3', label: '3 lata' }, { value: '5', label: '5 lat' }]} />
          </div>
          <Field label="Dopłata / mies. (zł)" className="w-36">
            <Input type="number" inputMode="decimal" min="0" step="100" placeholder="0" value={prefs.contribution ?? ''} onChange={(e) => setPrefs({ contribution: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) })} aria-label="Miesięczna dopłata w symulacji" />
          </Field>
        </div>
        <div className="mt-3">
          <Toggle checked={drip} onChange={(v) => setPrefs({ drip: v })} label="Reinwestuj 100% przepływów (DRIP)" description={`Stopa dochodu kapitału: ${pct(sim.yieldRate)} rocznie netto (prognoza 12 mies. / kapitał dochodowy ${formatPLN(capital)}); bez wzrostu dywidend i cen.`} />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead>
              <tr className="text-left text-[11px] text-stone-500 dark:text-stone-400">
                <th className="py-1.5 font-medium">Rok</th>
                <th className="py-1.5 text-right font-medium">Kapitał</th>
                <th className="py-1.5 text-right font-medium">Dochód / rok</th>
                <th className="py-1.5 text-right font-medium">/ mies.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-white/5">
              <tr className="text-stone-500 dark:text-stone-400">
                <td className="py-1.5">Teraz</td>
                <td className="py-1.5 text-right">{formatPLN(capital)}</td>
                <td className="py-1.5 text-right">{formatPLN(f.totals.net)}</td>
                <td className="py-1.5 text-right">{formatPLN(f.avgNet)}</td>
              </tr>
              {sim.rows.map((r) => (
                <tr key={r.year}>
                  <td className="py-1.5">
                    <Repeat size={11} className="mr-1 inline text-stone-400" />
                    {r.year}
                  </td>
                  <td className="py-1.5 text-right">{formatPLN(r.capital)}</td>
                  <td className="py-1.5 text-right font-semibold text-emerald-700 dark:text-emerald-400">{formatPLN(r.annual)}</td>
                  <td className="py-1.5 text-right">{formatPLN(r.monthly)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
