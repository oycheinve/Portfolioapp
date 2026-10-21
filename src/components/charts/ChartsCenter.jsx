import { useEffect, useMemo, useState } from 'react';
import { AreaChart as AreaIcon, BarChart3, CalendarRange, Coins, Database, Filter, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { ACCOUNT_TYPES, BENCHMARKS } from '../../lib/constants.js';
import { createPriceResolver, historyAgeDays } from '../../lib/history.js';
import {
  RANGE_PRESETS,
  buildPortfolioSeries,
  defaultSelection,
  dividendEvents,
  dividendsByMonth,
  dividendsByYear,
  selectionAccountIds,
} from '../../lib/series.js';
import { formatDate, formatDateTime, formatPLN, formatPercent, signClass } from '../../lib/format.js';
import { instrumentColorMap } from '../allocation/AllocationDonut.jsx';
import { Button, Card, Segmented, Select } from '../ui.jsx';
import { DrawdownChart, ProfitChart, ValueChart } from './PortfolioCharts.jsx';
import { DividendsMonthlyChart, DividendsYearlyChart } from './DividendCharts.jsx';
import { benchmarkColor } from './chartUtils.jsx';

const CHART_TABS = [
  { id: 'value', label: 'Wartość vs wkład', icon: AreaIcon },
  { id: 'profit', label: 'Zysk w czasie', icon: TrendingUp },
  { id: 'divMonthly', label: 'Dywidendy – miesięcznie', icon: BarChart3 },
  { id: 'divYearly', label: 'Dywidendy – rocznie', icon: Coins },
  { id: 'drawdown', label: 'Drawdown', icon: TrendingDown },
];

const KIND_LABELS = { STOCK: 'Akcje', ETF: 'ETF', BONDS: 'Obligacje', CASH: 'Gotówka' };

function Chip({ active, onClick, children, color }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-300'
          : 'border-stone-200 text-stone-600 hover:bg-stone-100 dark:border-white/10 dark:text-stone-300 dark:hover:bg-white/5'
      }`}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}

function CheckItem({ checked, onChange, label, color }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-stone-100 dark:hover:bg-white/5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded accent-blue-600" />
      {color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />}
      <span className="truncate">{label}</span>
    </label>
  );
}

export default function ChartsCenter() {
  const { state, actions, isDark, historyLoading } = useApp();
  const [range, setRange] = useState('1Y');
  const [selection, setSelection] = useState(defaultSelection);
  const [benchmarks, setBenchmarks] = useState(['SP500', 'CPI']);
  const [tab, setTab] = useState('value');
  const [profitMode, setProfitMode] = useState('PLN');
  const [divNet, setDivNet] = useState(true);
  const [divYear, setDivYear] = useState(new Date().getFullYear());
  const [divCompare, setDivCompare] = useState(true);
  const [showFilters, setShowFilters] = useState(() => typeof window === 'undefined' || window.innerWidth >= 768);

  // Pierwsze wejście: spróbuj pobrać historię, jeśli jest starsza niż doba
  useEffect(() => {
    if (state.settings.priceMode !== 'mock' && historyAgeDays(state) > 1 && state.priceHistory.status !== 'loading') {
      actions.refreshHistory({ silent: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resolver = useMemo(() => createPriceResolver(state), [state]);
  const compareIds = selection.instruments;
  const series = useMemo(() => buildPortfolioSeries(state, { range, selection, benchmarks, resolver }), [state, range, selection, benchmarks, resolver]);
  const divEvents = useMemo(() => dividendEvents(state, selection, { net: divNet }), [state, selection, divNet]);
  const divMonthly = useMemo(() => dividendsByMonth(divEvents, divYear), [divEvents, divYear]);
  const divYearly = useMemo(() => dividendsByYear(divEvents), [divEvents]);

  const years = useMemo(() => {
    const set = new Set([new Date().getFullYear()]);
    for (const c of state.cashflows) set.add(Number(c.date.slice(0, 4)));
    return [...set].sort((a, b) => b - a);
  }, [state.cashflows]);

  const accountIds = selectionAccountIds(state, selection);
  const allAccounts = selection.accounts === 'ALL';
  const instColors = instrumentColorMap(state, isDark);
  const span = (new Date(series.end) - new Date(series.start)) / 86400000;

  const setKinds = (kinds) => setSelection((s) => ({ ...s, kinds, instruments: [], compare: false }));
  const presets = [
    { id: 'all', label: 'Cały majątek', apply: () => setSelection(defaultSelection()) },
    ...['IKE', 'IKZE', 'OKI', 'BROKERAGE']
      .filter((t) => state.accounts.some((a) => a.type === t))
      .map((t) => ({
        id: `type-${t}`,
        label: `Tylko ${ACCOUNT_TYPES[t].label}`,
        apply: () => setSelection({ ...defaultSelection(), accounts: state.accounts.filter((a) => a.type === t).map((a) => a.id) }),
      })),
    { id: 'etf', label: 'Tylko ETF', apply: () => setSelection({ ...defaultSelection(), kinds: { STOCK: false, ETF: true, BONDS: false, CASH: false } }) },
    { id: 'stock', label: 'Tylko Akcje', apply: () => setSelection({ ...defaultSelection(), kinds: { STOCK: true, ETF: false, BONDS: false, CASH: false } }) },
    { id: 'bonds', label: 'Obligacje', apply: () => setSelection({ ...defaultSelection(), kinds: { STOCK: false, ETF: false, BONDS: true, CASH: false } }) },
  ];

  const toggleAccount = (id, on) =>
    setSelection((s) => {
      const current = Array.isArray(s.accounts) ? s.accounts : state.accounts.map((a) => a.id);
      const next = on ? [...new Set([...current, id])] : current.filter((x) => x !== id);
      return { ...s, accounts: next.length === state.accounts.length ? 'ALL' : next };
    });
  const toggleInstrument = (id, on) =>
    setSelection((s) => {
      const next = on ? [...s.instruments, id] : s.instruments.filter((x) => x !== id);
      return { ...s, instruments: next, compare: next.length > 0 };
    });
  const toggleBenchmark = (id) => setBenchmarks((b) => (b.includes(id) ? b.filter((x) => x !== id) : [...b, id]));

  const sum = series.summary;
  const firstBench = benchmarks.find((b) => b !== 'CPI');
  const historyStatus = state.priceHistory.status;
  const reconstructed = Object.values(resolver.sources).includes('reconstructed');

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Pasek filtrów czasu */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-neutral-900">
        <CalendarRange size={16} className="text-stone-500" />
        <Segmented options={RANGE_PRESETS} value={RANGE_PRESETS.some((r) => r.value === range) ? range : ''} onChange={setRange} ariaLabel="Zakres czasu" />
        <Select value={/^Y\d{4}$/.test(range) ? range : ''} onChange={(e) => e.target.value && setRange(e.target.value)} className="w-auto" aria-label="Wybór roku">
          <option value="">Rok…</option>
          {years.map((y) => (
            <option key={y} value={`Y${y}`}>
              {y}
            </option>
          ))}
        </Select>
        <span className="text-xs text-stone-500 tabular dark:text-stone-400">
          {formatDate(series.start)} – {formatDate(series.end)}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" icon={Filter} onClick={() => setShowFilters((v) => !v)}>
            {showFilters ? 'Ukryj filtry' : 'Pokaż filtry'}
          </Button>
          <Button size="sm" icon={RefreshCw} onClick={() => actions.refreshHistory()} disabled={historyLoading}>
            {historyLoading ? 'Pobieranie…' : 'Pobierz historię cen'}
          </Button>
        </div>
      </div>

      {showFilters && (
        <Card title="Co wliczać do wykresu" subtitle="Szybki wybór, konta, klasy aktywów, porównanie instrumentów i benchmarki" icon={Filter}>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <Chip key={p.id} onClick={p.apply} active={false}>
                  {p.label}
                </Chip>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="mb-1 text-xs font-semibold text-stone-500 dark:text-stone-400">Konta</div>
                <div className="grid">
                  {state.accounts.map((a) => (
                    <CheckItem
                      key={a.id}
                      checked={allAccounts || accountIds.includes(a.id)}
                      onChange={(on) => toggleAccount(a.id, on)}
                      label={a.name}
                      color={ACCOUNT_TYPES[a.type]?.color}
                    />
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-stone-500 dark:text-stone-400">Klasy aktywów</div>
                <div className="grid">
                  {Object.entries(KIND_LABELS).map(([k, label]) => (
                    <CheckItem
                      key={k}
                      checked={selection.instruments.length === 0 && selection.kinds[k]}
                      onChange={(on) => {
                        const kinds = { ...selection.kinds, [k]: on };
                        if (!Object.values(kinds).some(Boolean)) return;
                        setKinds(kinds);
                      }}
                      label={label}
                    />
                  ))}
                </div>
                {selection.instruments.length > 0 && (
                  <p className="mt-1 px-1.5 text-[11px] text-amber-700 dark:text-amber-400">Tryb porównania instrumentów – klasy nieaktywne.</p>
                )}
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs font-semibold text-stone-500 dark:text-stone-400">
                  <span>Porównaj instrumenty</span>
                  {selection.instruments.length > 0 && (
                    <button type="button" className="font-normal text-blue-600 hover:underline dark:text-blue-400" onClick={() => setSelection((s) => ({ ...s, instruments: [], compare: false }))}>
                      wyczyść
                    </button>
                  )}
                </div>
                <div className="grid max-h-56 overflow-y-auto">
                  {state.instruments.map((i) => (
                    <CheckItem
                      key={i.id}
                      checked={selection.instruments.includes(i.id)}
                      onChange={(on) => toggleInstrument(i.id, on)}
                      label={`${i.ticker} · ${i.kind === 'ETF' ? 'ETF' : 'akcja'}`}
                      color={instColors[i.id]}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-semibold text-stone-500 dark:text-stone-400">Benchmarki</div>
              <div className="flex flex-wrap gap-2">
                {Object.values(BENCHMARKS).map((b) => {
                  const info = resolver.benchmarkInfo[b.id];
                  return (
                    <span key={b.id} title={info?.source}>
                      <Chip active={benchmarks.includes(b.id)} onClick={() => info?.available && toggleBenchmark(b.id)} color={benchmarkColor(b.id, isDark)}>
                        {b.label}
                        {!info?.available && ' (brak danych)'}
                      </Chip>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Podsumowanie okresu */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Wartość" value={formatPLN(sum.value)} />
        <Tile label="Wkład netto" value={formatPLN(sum.contrib)} />
        <Tile label="Zysk w okresie" value={formatPLN(sum.profit, { sign: true })} tone={signClass(sum.profit)} />
        <Tile label="TWR w okresie" value={formatPercent(sum.twr, { sign: true })} tone={signClass(sum.twr)} sub={sum.annualized !== null ? `rocznie ${formatPercent(sum.annualized, { sign: true })}` : null} />
        <Tile label="Maks. obsunięcie" value={formatPercent(sum.maxDrawdown)} tone={sum.maxDrawdown < 0 ? 'text-red-600 dark:text-red-400' : ''} sub={`obecnie ${formatPercent(sum.currentDrawdown)}`} />
        <Tile
          label="vs benchmarki"
          value={
            benchmarks.length
              ? benchmarks
                  .slice(0, 2)
                  .map((id) => `${BENCHMARKS[id].label.split(' ')[0]} ${Number.isFinite(sum.benchmarks[id]?.pct) ? formatPercent(sum.benchmarks[id].pct, { sign: true, digits: 1 }) : '—'}`)
                  .join(' · ')
              : '—'
          }
          small
        />
      </div>

      <Card bodyClassName="p-0 sm:p-0">
        <div className="flex gap-1 overflow-x-auto border-b border-stone-100 px-2 pt-2 dark:border-white/5" role="tablist" aria-label="Typ wykresu">
          {CHART_TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  active ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300' : 'border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
                }`}
              >
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>
        <div className="p-4 sm:p-5">
          {tab === 'value' && <ValueChart data={series.points} span={span} benchmarks={benchmarks} compareIds={compareIds} />}
          {tab === 'profit' && <ProfitChart data={series.points} span={span} benchmarks={benchmarks} compareIds={compareIds} mode={compareIds.length ? 'PCT' : profitMode} onModeChange={setProfitMode} />}
          {tab === 'drawdown' && <DrawdownChart data={series.points} span={span} benchmarks={benchmarks} compareIds={compareIds} />}
          {(tab === 'divMonthly' || tab === 'divYearly') && (
            <div className="mb-3 flex justify-end">
              <Segmented
                size="sm"
                value={divNet ? 'NET' : 'GROSS'}
                onChange={(v) => setDivNet(v === 'NET')}
                ariaLabel="Netto/brutto"
                options={[
                  { value: 'NET', label: 'Netto' },
                  { value: 'GROSS', label: 'Brutto' },
                ]}
              />
            </div>
          )}
          {tab === 'divMonthly' && <DividendsMonthlyChart rows={divMonthly} year={divYear} years={years} onYearChange={setDivYear} compare={divCompare} onCompareChange={setDivCompare} />}
          {tab === 'divYearly' && <DividendsYearlyChart rows={divYearly} />}

          {(tab === 'value' || tab === 'profit') && compareIds.length === 0 && (
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-stone-100 pt-4 text-sm sm:grid-cols-4 dark:border-white/5">
              <Tile plain label="Zysk kursowy" value={formatPLN(sum.profitPrice, { sign: true })} tone={signClass(sum.profitPrice)} />
              <Tile plain label="Dywidendy netto" value={formatPLN(sum.profitDividends, { sign: true })} tone={signClass(sum.profitDividends)} />
              <Tile plain label="Odsetki netto" value={formatPLN(sum.profitInterest, { sign: true })} tone={signClass(sum.profitInterest)} />
              {firstBench ? (
                <Tile
                  plain
                  label={`Gdyby wpłaty w ${BENCHMARKS[firstBench].label}`}
                  value={formatPLN(sum.benchmarks[firstBench]?.value)}
                  sub={`Twój portfel ${formatPLN(sum.value - (sum.benchmarks[firstBench]?.value || 0), { sign: true })}`}
                />
              ) : (
                <Tile plain label="Benchmark" value="—" sub="wybierz w filtrach" />
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-stone-100 px-4 py-2.5 text-[11px] text-stone-500 sm:px-5 dark:border-white/5 dark:text-stone-500">
          <Database size={12} />
          <span>
            Wartości: {series.valueSource === 'snapshots' ? 'zapisane migawki dzienne' : 'wycena historyczna pozycji'} · historia cen:{' '}
            {historyStatus === 'live' ? 'Yahoo Finance' : historyStatus === 'partial' ? 'Yahoo (częściowo) + rekonstrukcja' : reconstructed ? 'rekonstrukcja z transakcji (offline)' : '—'}
            {state.priceHistory.updatedAt && ` · ${formatDateTime(state.priceHistory.updatedAt)}`}
          </span>
          {benchmarks.map((id) => (
            <span key={id}>
              · {BENCHMARKS[id].label}: {resolver.benchmarkInfo[id]?.source}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Tile({ label, value, sub, tone = '', small, plain }) {
  return (
    <div className={plain ? 'min-w-0' : 'min-w-0 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-neutral-900'}>
      <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">{label}</div>
      <div className={`truncate font-semibold tabular ${small ? 'text-xs leading-6' : 'text-base'} ${tone}`}>{value}</div>
      {sub && <div className="truncate text-[11px] text-stone-500 dark:text-stone-500">{sub}</div>}
    </div>
  );
}
