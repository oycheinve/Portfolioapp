import { useMemo, useState } from 'react';
import { useApp } from '../../state/AppContext.jsx';
import { computePeriodStats, fxToPLN } from '../../lib/engine.js';
import { createPriceResolver } from '../../lib/history.js';
import { formatPLN, formatPercent, signClass } from '../../lib/format.js';
import { Segmented, Select } from '../ui.jsx';

const RATE_KEY = 'wealth-app-quick-rate';
const SCOPE_KEY = 'wealth-app-quick-scope';
const RATES = [
  { value: 'SIMPLE', label: 'Prosta' },
  { value: 'TWR', label: 'TWR' },
  { value: 'MWR', label: 'MWR' },
];
const SCOPES = [
  { value: 'INVEST', label: 'Portfel inwestycyjny' },
  { value: 'ALL', label: 'Portfel całościowy (z poduszką)' },
  { value: 'SAFE', label: 'Poduszka finansowa' },
];

function readPref(key, fallback, allowed) {
  try {
    const v = localStorage.getItem(key);
    return allowed.some((o) => o.value === v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function savePref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // brak localStorage – wybór nie zostanie zapamiętany
  }
}

// Stopa wybranego rodzaju i jej odpowiednik roczny (dla okresu „całość” – po liczbie lat inwestowania)
function rateOf(stats, kind) {
  return kind === 'TWR' ? stats.twr : kind === 'MWR' ? stats.mwr : stats.totalReturnPct;
}

function annualize(rate, years) {
  if (!Number.isFinite(rate) || !(years > 0)) return null;
  if (years < 1) return rate;
  return 1 + rate > 0 ? Math.pow(1 + rate, 1 / years) - 1 : null;
}

// Zwarty panel na górze Pulpitu: kluczowe metryki portfela z wyborem stopy zwrotu (Prosta / TWR / MWR)
export default function QuickStatsPanel() {
  const { state } = useApp();
  const [rate, setRate] = useState(() => readPref(RATE_KEY, 'TWR', RATES));
  const [scope, setScope] = useState(() => readPref(SCOPE_KEY, 'INVEST', SCOPES));
  const resolver = useMemo(() => createPriceResolver(state), [state]);
  const data = useMemo(() => {
    const opts = { filter: scope, priceAt: resolver.instrumentPLN };
    const all = computePeriodStats(state, { ...opts, period: 'ALL' });
    const week = computePeriodStats(state, { ...opts, period: '1W' });
    const month = computePeriodStats(state, { ...opts, period: '1M' });
    const ytd = computePeriodStats(state, { ...opts, period: 'YTD' });
    const ids = new Set(all.accountIds);
    const quotes = state.prices?.quotes || {};
    const fx = state.prices?.fx;
    // Zmiana dzienna z notowań (kurs bieżący vs zamknięcie poprzedniej sesji) dla akcji i ETF w zakresie
    let dayChange = 0;
    let up = 0;
    let down = 0;
    let unrealized = 0;
    for (const p of all.valuation.positions) {
      if (!ids.has(p.accountId)) continue;
      const q = quotes[p.instrumentId];
      if (q && q.prevClose > 0 && q.price > 0) {
        const ccy = q.currency || p.instrument?.currency;
        dayChange += p.quantity * (q.price - q.prevClose) * fxToPLN(fx, ccy);
      }
      const gain = p.value - p.costPLN;
      unrealized += gain;
      if (gain > 0.005) up += 1;
      else if (gain < -0.005) down += 1;
    }
    const prevValue = all.endValue - dayChange;
    return { all, week, month, ytd, dayChange, dayPct: prevValue > 0 ? dayChange / prevValue : 0, unrealized, up, down };
  }, [state, scope, resolver]);

  const { all, week, month, ytd } = data;
  const chosen = rateOf(all, rate);
  const years = all.cagrYears;
  const label = RATES.find((r) => r.value === rate).label;
  const footer = RATES.map((r) => {
    const v = rateOf(all, r.value);
    const yr = r.value === 'TWR' ? all.cagr : annualize(v, years);
    return { ...r, v, yr };
  });

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5 dark:border-white/10 dark:bg-neutral-900" aria-label="Statystyki portfela">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
          <Select
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              savePref(SCOPE_KEY, e.target.value);
            }}
            className="h-8 w-full min-w-0 max-w-[20rem] truncate px-2 text-sm font-semibold sm:w-auto"
            aria-label="Zakres statystyk"
          >
            {SCOPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label} – statystyki
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
          <span className="hidden sm:inline">Stopa zwrotu:</span>
          <Segmented
            size="sm"
            options={RATES}
            value={rate}
            onChange={(v) => {
              setRate(v);
              savePref(RATE_KEY, v);
            }}
            ariaLabel="Rodzaj stopy zwrotu"
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Wartość" value={formatPLN(all.endValue)} big />
        <Metric label="Zmiana dzienna" value={formatPercent(data.dayPct, { sign: true })} tone={signClass(data.dayChange)} sub={formatPLN(data.dayChange, { sign: true })} />
        <Metric label="Zysk całkowity" value={formatPLN(all.totalReturn, { sign: true })} tone={signClass(all.totalReturn)} sub={`dywidendy ${formatPLN(all.dividendsNet)}`} />
        <Metric
          label={`Stopa (${label})`}
          value={formatPercent(chosen, { sign: true })}
          tone={signClass(chosen)}
          sub={(() => {
            const yr = rate === 'TWR' ? all.cagr : annualize(chosen, years);
            return yr === null ? null : `śr. roczna ${formatPercent(yr, { sign: true })}`;
          })()}
        />
        <Metric label="Zysk dzienny" value={formatPLN(data.dayChange, { sign: true })} tone={signClass(data.dayChange)} />
        <Metric label="Zysk bieżący" value={formatPLN(data.unrealized, { sign: true })} tone={signClass(data.unrealized)} sub="niezrealizowany (akcje i ETF)" />

        <Metric label="Wkład własny" value={formatPLN(all.contributionsAll)} big />
        <Metric label="Zmiana tygodniowa" value={formatPercent(rateOf(week, rate === 'TWR' ? 'TWR' : 'SIMPLE'), { sign: true })} tone={signClass(week.totalReturn)} sub={formatPLN(week.totalReturn, { sign: true })} />
        <Metric label="Zmiana miesięczna" value={formatPercent(rateOf(month, rate === 'TWR' ? 'TWR' : 'SIMPLE'), { sign: true })} tone={signClass(month.totalReturn)} sub={formatPLN(month.totalReturn, { sign: true })} />
        <Metric label="Od początku roku" value={formatPercent(rateOf(ytd, rate), { sign: true })} tone={signClass(ytd.totalReturn)} sub={formatPLN(ytd.totalReturn, { sign: true })} />
        <Metric label="CAGR (TWR)" value={formatPercent(all.cagr, { sign: true })} tone={signClass(all.cagr)} sub={`${Math.round(years * 365.25)} dni inwestowania`} />
        <Metric
          label="Walory ↑ / ↓"
          value={
            <>
              <span className="text-emerald-700 dark:text-emerald-400">{data.up}</span> / <span className="text-red-600 dark:text-red-400">{data.down}</span>
            </>
          }
          sub="z zyskiem / ze stratą"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-stone-100 pt-2 text-[11px] text-stone-500 tabular dark:border-white/5 dark:text-stone-400">
        {footer.map((f) => (
          <span key={f.value} className={f.value === rate ? 'font-semibold text-stone-700 dark:text-stone-200' : ''}>
            {f.label}: <span className={signClass(f.v)}>{formatPercent(f.v, { sign: true })}</span>
            {f.yr !== null && ` (${formatPercent(f.yr, { sign: true })} r/r)`}
          </span>
        ))}
      </div>
    </section>
  );
}

function Metric({ label, value, sub, tone = '', big = false }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[10px] font-medium tracking-wide text-stone-500 uppercase dark:text-stone-400">{label}</div>
      <div className={`truncate font-semibold tabular ${big ? 'text-lg sm:text-xl' : 'text-base sm:text-lg'} ${tone}`}>{value}</div>
      {sub && <div className="truncate text-[11px] text-stone-500 tabular dark:text-stone-400">{sub}</div>}
    </div>
  );
}
