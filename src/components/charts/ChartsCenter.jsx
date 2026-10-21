import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Database, Layers, LineChart as LineIcon, Plus, RefreshCw, Scale, Trash2 } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { ACCOUNT_TYPES, BENCHMARKS, benchmarkDefs } from '../../lib/constants.js';
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
import { computeHoldings, isoDay, livePriceLookup, valuePortfolio } from '../../lib/engine.js';
import { formatDate, formatDateTime, formatPLN, formatPercent, signClass } from '../../lib/format.js';
import { instrumentColorMap } from '../allocation/AllocationDonut.jsx';
import { Button, Card, Dropdown, Input, Segmented, Select } from '../ui.jsx';
import { DrawdownChart, ProfitChart, ValueChart } from './PortfolioCharts.jsx';
import { DividendsMonthlyChart, DividendsYearlyChart } from './DividendCharts.jsx';
import { benchmarkColor } from './chartUtils.jsx';
import HeatmapCard from '../dashboard/HeatmapCard.jsx';
import LivePricesCard from '../dashboard/LivePricesCard.jsx';

// Lista wykresów (wybór z rozwijanej listy zamiast poziomych zakładek)
export const CHART_OPTIONS = [
  { id: 'value', label: 'Wartość vs wkład', group: 'Portfel', kind: 'series' },
  { id: 'profit', label: 'Zysk w czasie', group: 'Portfel', kind: 'series' },
  { id: 'drawdown', label: 'Drawdown (obsunięcie)', group: 'Portfel', kind: 'series' },
  { id: 'divMonthly', label: 'Dywidendy – miesięcznie', group: 'Dywidendy', kind: 'dividends' },
  { id: 'divYearly', label: 'Dywidendy – rocznie', group: 'Dywidendy', kind: 'dividends' },
  { id: 'heatmap', label: 'Mapa cieplna dnia', group: 'Rynek', kind: 'market' },
  { id: 'quotes', label: 'Notowania i kursy walut', group: 'Rynek', kind: 'market' },
];

const KIND_LABELS = { STOCK: 'Akcje', ETF: 'ETF', BONDS: 'Obligacje', CASH: 'Gotówka' };
const CHART_KEY = 'wealth-app-chart-type';

function CheckItem({ checked, onChange, label, color, disabled }) {
  return (
    <label className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-sm ${disabled ? 'opacity-50' : 'cursor-pointer hover:bg-stone-100 dark:hover:bg-white/5'}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded accent-blue-600" />
      {color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />}
      <span className="truncate">{label}</span>
    </label>
  );
}

// Własne benchmarki o stałej stopie: lista (z usuwaniem) i formularz „Stwórz własny benchmark / stała stopa”
function CustomBenchmarks({ selected, onToggle, onCreate, info, isDark }) {
  const { state, actions } = useApp();
  const custom = state.settings.customBenchmarks || [];
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const rateNum = Number(String(rate).replace(',', '.'));
  const valid = name.trim().length > 0 && rate !== '' && Number.isFinite(rateNum) && rateNum > -50 && rateNum < 100;
  const create = () => {
    if (!valid) return;
    const id = `custom_${Date.now().toString(36)}`;
    actions.updateSettings({ customBenchmarks: [...custom, { id, name: name.trim(), ratePct: rateNum }] });
    onCreate(id);
    setName('');
    setRate('');
    actions.notify(`Dodano benchmark „${name.trim()}”`, 'success');
  };
  const remove = (id) => actions.updateSettings({ customBenchmarks: custom.filter((c) => c.id !== id) });
  return (
    <div className="mt-2 border-t border-stone-100 pt-2 dark:border-white/5">
      <div className="mb-1 px-1.5 text-[11px] font-semibold tracking-wide text-stone-500 uppercase">Własne (stała stopa)</div>
      {custom.map((c) => (
        <div key={c.id} className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <CheckItem checked={selected.includes(c.id)} onChange={() => onToggle(c.id)} label={c.name} color={benchmarkColor(c.id, isDark)} />
            <div className="pl-8 text-[11px] text-stone-500">{info[c.id]?.source}</div>
          </div>
          <button
            type="button"
            onClick={() => remove(c.id)}
            className="mt-1 rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-red-600 dark:hover:bg-white/5"
            aria-label={`Usuń benchmark ${c.name}`}
            title="Usuń"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <form
        className="mt-1.5 space-y-1.5 rounded-lg bg-stone-50 p-2 dark:bg-white/[0.03]"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <div className="text-xs font-medium">Stwórz własny benchmark / stała stopa</div>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nazwa, np. Moja lokata 4%" aria-label="Nazwa benchmarku" className="h-8 text-xs" />
        <div className="flex gap-1.5">
          <Input
            type="number"
            step="0.1"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="% rocznie"
            aria-label="Stopa roczna w procentach"
            className="h-8 text-xs"
          />
          <Button type="submit" size="sm" variant="primary" icon={Plus} disabled={!valid}>
            Dodaj
          </Button>
        </div>
      </form>
    </div>
  );
}

function readChart(param) {
  if (param && CHART_OPTIONS.some((c) => c.id === param)) return param;
  try {
    const v = localStorage.getItem(CHART_KEY);
    return CHART_OPTIONS.some((c) => c.id === v) ? v : 'value';
  } catch {
    return 'value';
  }
}

export default function ChartsCenter({ param }) {
  const { state, actions, isDark, historyLoading } = useApp();
  const [chart, setChartState] = useState(() => readChart(param));
  const [range, setRange] = useState('1Y');
  const [selection, setSelection] = useState(defaultSelection);
  const [benchmarkIds, setBenchmarks] = useState(['SP500', 'CPI']);
  const defs = useMemo(() => benchmarkDefs(state.settings), [state.settings]);
  // Usunięte własne benchmarki znikają z wyboru
  const benchmarks = useMemo(() => benchmarkIds.filter((id) => defs[id]), [benchmarkIds, defs]);
  const [profitMode, setProfitMode] = useState('PLN');
  const [divNet, setDivNet] = useState(true);
  const [divYear, setDivYear] = useState(new Date().getFullYear());
  const [divCompare, setDivCompare] = useState(true);
  const option = CHART_OPTIONS.find((c) => c.id === chart) || CHART_OPTIONS[0];

  const setChart = (id) => {
    setChartState(id);
    try {
      localStorage.setItem(CHART_KEY, id);
    } catch {
      // brak localStorage – wybór nie zostanie zapamiętany
    }
  };

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
  const valuation = useMemo(
    () => (option.id === 'heatmap' ? valuePortfolio(state, { asOf: isoDay(new Date()), accountIds: null, priceLookup: livePriceLookup(state) }) : null),
    [state, option.id],
  );

  const years = useMemo(() => {
    const set = new Set([new Date().getFullYear()]);
    for (const c of state.cashflows) set.add(Number(c.date.slice(0, 4)));
    return [...set].sort((a, b) => b - a);
  }, [state.cashflows]);

  const accountIds = selectionAccountIds(state, selection);
  const allAccounts = selection.accounts === 'ALL';
  const instColors = instrumentColorMap(state, isDark);
  const span = (new Date(series.end) - new Date(series.start)) / 86400000;
  const instById = Object.fromEntries(state.instruments.map((i) => [i.id, i]));
  // Na liście aktywów tylko instrumenty obecnie posiadane
  const heldInstruments = useMemo(() => {
    const held = new Set(computeHoldings(state, isoDay(new Date()), null).filter((h) => h.quantity > 1e-9).map((h) => h.instrumentId));
    return state.instruments.filter((i) => held.has(i.id));
  }, [state]);

  const setKinds = (kinds) => setSelection((s) => ({ ...s, kinds, instruments: [], compare: false }));
  const presets = [
    { id: 'all', label: 'Cały majątek', apply: () => setSelection(defaultSelection()) },
    ...['IKE', 'IKZE', 'BROKERAGE', 'BONDS']
      .filter((t) => state.accounts.some((a) => a.type === t))
      .map((t) => ({
        id: `type-${t}`,
        label: `Tylko ${ACCOUNT_TYPES[t].label}`,
        apply: () => setSelection({ ...defaultSelection(), accounts: state.accounts.filter((a) => a.type === t).map((a) => a.id) }),
      })),
    { id: 'etf', label: 'Tylko ETF', apply: () => setSelection({ ...defaultSelection(), kinds: { STOCK: false, ETF: true, BONDS: false, CASH: false } }) },
    { id: 'stock', label: 'Tylko akcje', apply: () => setSelection({ ...defaultSelection(), kinds: { STOCK: true, ETF: false, BONDS: false, CASH: false } }) },
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

  // Opis bieżącego wyboru aktywów (etykieta przycisku)
  const selectionLabel = (() => {
    if (compareIds.length) return `Porównanie: ${compareIds.map((id) => instById[id]?.ticker).join(', ')}`;
    const kinds = Object.entries(selection.kinds)
      .filter(([, v]) => v)
      .map(([k]) => KIND_LABELS[k]);
    const accLabel = allAccounts
      ? ''
      : state.accounts
          .filter((a) => accountIds.includes(a.id))
          .map((a) => a.name.split(' – ')[0])
          .join(', ');
    if (allAccounts && kinds.length === 4) return 'Cały majątek';
    return [kinds.length === 4 ? 'Wszystkie klasy' : kinds.join(' + '), accLabel].filter(Boolean).join(' · ');
  })();

  const sum = series.summary;
  const firstBench = benchmarks.find((b) => b !== 'CPI');
  const historyStatus = state.priceHistory.status;
  const reconstructed = Object.values(resolver.sources).includes('reconstructed');
  const usesSelection = option.kind === 'series' || option.kind === 'dividends';
  const usesBenchmarks = option.kind === 'series';

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Pasek wyboru: wykres · aktywa · benchmarki · zakres */}
      <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm sm:p-4 dark:border-white/10 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56 sm:max-w-[18rem]">
            <LineIcon size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-blue-600 dark:text-blue-400" />
            <Select value={chart} onChange={(e) => setChart(e.target.value)} aria-label="Wybierz wykres" className="pl-9 font-medium">
              {['Portfel', 'Dywidendy', 'Rynek'].map((g) => (
                <optgroup key={g} label={g}>
                  {CHART_OPTIONS.filter((c) => c.group === g).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>

          {usesSelection && (
            <Dropdown label={selectionLabel} icon={Layers} title="Które portfolio / aktywa analizować" className="max-w-full sm:max-w-[20rem]">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((p) => (
                    <button key={p.id} type="button" onClick={p.apply} className="rounded-full border border-stone-200 px-2.5 py-1 text-xs font-medium hover:bg-stone-100 dark:border-white/10 dark:hover:bg-white/5">
                      {p.label}
                    </button>
                  ))}
                </div>
                <div>
                  <div className="mb-1 text-[11px] font-semibold tracking-wide text-stone-500 uppercase">Konta</div>
                  {state.accounts.map((a) => (
                    <CheckItem key={a.id} checked={allAccounts || accountIds.includes(a.id)} onChange={(on) => toggleAccount(a.id, on)} label={a.name} color={ACCOUNT_TYPES[a.type]?.color} />
                  ))}
                </div>
                <div className="border-t border-stone-100 pt-2 dark:border-white/5">
                  <div className="mb-1 text-[11px] font-semibold tracking-wide text-stone-500 uppercase">Klasy aktywów</div>
                  <div className="grid grid-cols-2">
                    {Object.entries(KIND_LABELS).map(([k, label]) => (
                      <CheckItem
                        key={k}
                        checked={selection.instruments.length === 0 && selection.kinds[k]}
                        disabled={selection.instruments.length > 0}
                        onChange={(on) => {
                          const kinds = { ...selection.kinds, [k]: on };
                          if (!Object.values(kinds).some(Boolean)) return;
                          setKinds(kinds);
                        }}
                        label={label}
                      />
                    ))}
                  </div>
                </div>
                <div className="border-t border-stone-100 pt-2 dark:border-white/5">
                  <div className="mb-1 flex items-center justify-between text-[11px] font-semibold tracking-wide text-stone-500 uppercase">
                    <span>Porównaj instrumenty</span>
                    {selection.instruments.length > 0 && (
                      <button type="button" className="font-normal normal-case text-blue-600 hover:underline dark:text-blue-400" onClick={() => setSelection((s) => ({ ...s, instruments: [], compare: false }))}>
                        wyczyść
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2">
                    {heldInstruments.map((i) => (
                      <CheckItem key={i.id} checked={selection.instruments.includes(i.id)} onChange={(on) => toggleInstrument(i.id, on)} label={i.ticker} color={instColors[i.id]} />
                    ))}
                  </div>
                </div>
              </div>
            </Dropdown>
          )}

          {usesBenchmarks && (
            <Dropdown label={benchmarks.length ? `Benchmarki (${benchmarks.length})` : 'Benchmarki'} icon={Scale} title="Benchmarki do porównania">
              <div className="space-y-1">
                {Object.values(BENCHMARKS).map((b) => {
                  const info = resolver.benchmarkInfo[b.id];
                  return (
                    <div key={b.id}>
                      <CheckItem checked={benchmarks.includes(b.id)} disabled={!info?.available} onChange={() => toggleBenchmark(b.id)} label={b.label} color={benchmarkColor(b.id, isDark)} />
                      <div className="pl-8 text-[11px] text-stone-500">{info?.source}</div>
                    </div>
                  );
                })}
                <CustomBenchmarks
                  selected={benchmarks}
                  onToggle={toggleBenchmark}
                  onCreate={(id) => setBenchmarks((b) => [...b, id])}
                  info={resolver.benchmarkInfo}
                  isDark={isDark}
                />
              </div>
            </Dropdown>
          )}

          {option.kind === 'series' && (
            <div className="flex flex-wrap items-center gap-2">
              <CalendarRange size={16} className="hidden text-stone-500 sm:block" />
              <Segmented options={RANGE_PRESETS} value={RANGE_PRESETS.some((r) => r.value === range) ? range : ''} onChange={setRange} ariaLabel="Zakres czasu" size="sm" />
              <Select value={/^Y\d{4}$/.test(range) ? range : ''} onChange={(e) => e.target.value && setRange(e.target.value)} className="h-8 w-auto text-xs" aria-label="Wybór roku">
                <option value="">Rok…</option>
                {years.map((y) => (
                  <option key={y} value={`Y${y}`}>
                    {y}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="ml-auto">
            {option.kind === 'series' && (
              <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => actions.refreshHistory()} disabled={historyLoading} title="Pobierz historię cen z Yahoo Finance">
                <span className="hidden sm:inline">{historyLoading ? 'Pobieranie…' : 'Historia cen'}</span>
              </Button>
            )}
            {option.kind === 'market' && (
              <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => actions.refreshPrices()}>
                Odśwież kursy
              </Button>
            )}
          </div>
        </div>
        {option.kind === 'series' && (
          <div className="mt-2 text-xs text-stone-500 tabular dark:text-stone-400">
            {formatDate(series.start)} – {formatDate(series.end)}
          </div>
        )}
      </div>

      {/* Podsumowanie okresu (wykresy portfela) */}
      {option.kind === 'series' && (
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
                    .map((id) => `${defs[id].label} ${Number.isFinite(sum.benchmarks[id]?.pct) ? formatPercent(sum.benchmarks[id].pct, { sign: true, digits: 1 }) : '—'}`)
                    .join(' · ')
                : '—'
            }
            small
          />
        </div>
      )}

      {option.id === 'heatmap' && valuation && <HeatmapCard valuation={valuation} />}
      {option.id === 'quotes' && <LivePricesCard />}

      {option.kind !== 'market' && (
        <Card title={option.label} bodyClassName="p-4 sm:p-5">
          {chart === 'value' && <ValueChart data={series.points} span={span} benchmarks={benchmarks} compareIds={compareIds} />}
          {chart === 'profit' && <ProfitChart data={series.points} span={span} benchmarks={benchmarks} compareIds={compareIds} mode={compareIds.length ? 'PCT' : profitMode} onModeChange={setProfitMode} />}
          {chart === 'drawdown' && <DrawdownChart data={series.points} span={span} benchmarks={benchmarks} compareIds={compareIds} />}
          {option.kind === 'dividends' && (
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
          {chart === 'divMonthly' && <DividendsMonthlyChart rows={divMonthly} year={divYear} years={years} onYearChange={setDivYear} compare={divCompare} onCompareChange={setDivCompare} />}
          {chart === 'divYearly' && <DividendsYearlyChart rows={divYearly} />}

          {(chart === 'value' || chart === 'profit') && compareIds.length === 0 && (
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-stone-100 pt-4 text-sm sm:grid-cols-4 dark:border-white/5">
              <Tile plain label="Zysk kursowy" value={formatPLN(sum.profitPrice, { sign: true })} tone={signClass(sum.profitPrice)} />
              <Tile plain label="Dywidendy netto" value={formatPLN(sum.profitDividends, { sign: true })} tone={signClass(sum.profitDividends)} />
              <Tile plain label="Odsetki netto" value={formatPLN(sum.profitInterest, { sign: true })} tone={signClass(sum.profitInterest)} />
              {firstBench ? (
                <Tile
                  plain
                  label={defs[firstBench].label}
                  value={formatPLN(sum.benchmarks[firstBench]?.value)}
                  sub={`Twój portfel ${formatPLN(sum.value - (sum.benchmarks[firstBench]?.value || 0), { sign: true })}`}
                />
              ) : (
                <Tile plain label="Benchmark" value="—" sub="wybierz w „Benchmarki”" />
              )}
            </div>
          )}
          {option.kind === 'series' && (
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-stone-100 pt-3 text-[11px] text-stone-500 dark:border-white/5 dark:text-stone-500">
              <Database size={12} />
              <span>
                Wartości: {series.valueSource === 'snapshots' ? 'zapisane migawki dzienne' : 'wycena historyczna pozycji'} · historia cen:{' '}
                {historyStatus === 'live'
                  ? 'Yahoo Finance'
                  : historyStatus === 'partial'
                    ? 'Yahoo (częściowo) + migawki/rekonstrukcja'
                    : reconstructed
                      ? 'migawki i rekonstrukcja z transakcji (offline)'
                      : 'migawki dzienne'}
                {state.priceHistory.updatedAt && ` · ${formatDateTime(state.priceHistory.updatedAt)}`}
              </span>
            </div>
          )}
        </Card>
      )}
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
