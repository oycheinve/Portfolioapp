import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, LineChart as LineIcon, Percent, Plus, Scale, Trash2 } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { ETF_ACCOUNTS, ETF_CALC_CURRENCIES, ETF_QUOTE_CURRENCIES, compareEtfs, defaultEtfCalc, etfCurrency, needsFx } from '../../lib/etfCalc.js';
import { XTB_FX_FEE_PCT } from '../../lib/constants.js';
import { computeAllocation } from '../../lib/allocation.js';
import { accountFxPct, fxToPLN } from '../../lib/engine.js';
import { chartChrome, seriesColor } from '../../lib/colors.js';
import { formatAxisPLN, formatMoney, formatPLN, formatPercent } from '../../lib/format.js';
import { Badge, Button, Card, ChartTooltip, Field, Input, Segmented, Select, Slider } from '../ui.jsx';
import { Legend } from '../charts/chartUtils.jsx';
import TerAnalysis from '../allocation/TerAnalysis.jsx';

const KEY = 'wealth-app-etf-calc';
const MAX_ETFS = 5;

function readParams() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    return saved && Array.isArray(saved.etfs) ? { ...defaultEtfCalc(), ...saved } : defaultEtfCalc();
  } catch {
    return defaultEtfCalc();
  }
}

// Kalkulator opłacalności ETF: TER + przewalutowanie XTB 0,05% (kupno i sprzedaż) + podatek → wynik po latach
export default function EtfCostCalculator() {
  const { state, isDark } = useApp();
  const chrome = chartChrome(isDark);
  const [p, setP] = useState(readParams);
  const [chartMode, setChartMode] = useState('COST');
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
  const setEtf = (id, patch) => set({ etfs: p.etfs.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const addEtf = () => set({ etfs: [...p.etfs, { id: `e${Date.now().toString(36)}`, name: `ETF ${p.etfs.length + 1}`, ter: 0.2, currency: 'USD', fxPct: XTB_FX_FEE_PCT }] });

  // Waluta kalkulatora (konta i kwot) – kwoty przeliczane po kursie NBP przy zmianie waluty
  const cur = p.currency || 'PLN';
  const fxRates = state.prices?.fx;
  const rate = fxToPLN(fxRates, cur);
  const money = (v, digits = 2) => formatMoney(v, cur, digits);
  const inPLN = (v) => (cur === 'PLN' ? '' : ` ≈ ${formatPLN(v * rate)}`);
  const changeCurrency = (next) => {
    if (next === cur) return;
    const k = fxToPLN(fxRates, cur) / fxToPLN(fxRates, next);
    const round = (v) => Math.round((Number(v) || 0) * k / 10) * 10;
    set({ currency: next, initial: round(p.initial), monthly: round(p.monthly) });
  };
  const fxSource = fxRates?.source ? fxRates.source.replace(/ \(ostatnie znane\)$/, '') : 'kursy domyślne';
  const removeEtf = (id) => set({ etfs: p.etfs.filter((e) => e.id !== id) });

  // ETF-y z portfela (posiadane) – TER z instrumentu, przewalutowanie wg konta i waluty
  const analysis = useMemo(() => computeAllocation(state), [state]);
  const portfolioEtfs = useMemo(
    () =>
      analysis.instruments
        .filter((r) => r.instrument.kind === 'ETF' && r.value > 0)
        .slice(0, MAX_ETFS)
        .map((r) => {
          const foreign = (r.instrument.currency || 'PLN') !== (p.currency || 'PLN');
          const pos = analysis.valuation.positions.find((x) => x.instrumentId === r.key);
          const fx = foreign ? accountFxPct(state.accounts.find((a) => a.id === pos?.accountId)) || XTB_FX_FEE_PCT : 0;
          return { id: `p_${r.key}`, name: `${r.instrument.ticker} (${r.instrument.currency})`, ter: Number(r.instrument.ter) || 0, currency: ETF_QUOTE_CURRENCIES.includes(r.instrument.currency) ? r.instrument.currency : 'USD', fxPct: fx || XTB_FX_FEE_PCT };
        }),
    [analysis, state.accounts, p.currency],
  );

  const result = useMemo(() => compareEtfs(p), [p]);
  const colors = p.etfs.map((_, i) => seriesColor([0, 1, 4, 3, 5][i % 5], isDark));
  const data = useMemo(() => {
    const years = result.noCost.points.map((pt) => pt.year);
    return years.map((year, idx) => {
      const row = { year: `${year}`, base: result.noCost.points[idx]?.value };
      result.rows.forEach((r) => {
        const v = r.sim.points[idx]?.value;
        // Tryb kosztów: o ile mniej niż ten sam indeks bez kosztów (skumulowany utracony wynik)
        row[r.id] = chartMode === 'COST' ? (result.noCost.points[idx]?.value ?? 0) - (v ?? 0) : v;
      });
      return row;
    });
  }, [result, chartMode]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 1. Dane wejściowe */}
      <Card title="Kalkulator opłacalności ETF" subtitle="Porównanie TER, przewalutowania XTB 0,05% (kupno i sprzedaż) i podatku w długim terminie" icon={Scale}>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2 xl:col-span-3">
            <div className="text-xs font-medium text-stone-600 dark:text-stone-400">Waluta kalkulatora (konta, kwot i wyniku)</div>
            <div className="flex flex-wrap items-center gap-3">
              <Segmented size="sm" value={cur} onChange={changeCurrency} ariaLabel="Waluta kalkulatora" options={ETF_CALC_CURRENCIES.map((c) => ({ value: c, label: c }))} />
              <span className="text-xs text-stone-500 dark:text-stone-400">
                {cur === 'PLN' ? 'Konto w PLN – ETF-y w USD/EUR/GBP z przewalutowaniem.' : `Kurs${/NBP/.test(fxSource) ? ' NBP' : ''}: 1 ${cur} = ${rate.toFixed(4).replace('.', ',')} zł (${fxSource}) · przewalutowanie tylko dla ETF-ów w innej walucie niż ${cur}.`}
              </span>
            </div>
          </div>
          <Field label={`Kapitał początkowy (${cur})`} hint={cur === 'PLN' ? undefined : `≈ ${formatPLN(p.initial * rate)}`}>
            <Input type="number" min="0" step={cur === 'PLN' ? 1000 : 100} value={p.initial} onChange={(e) => set({ initial: Math.max(0, Number(e.target.value) || 0) })} />
          </Field>
          <Slider label={`Wpłata miesięczna (${cur})`} value={p.monthly} onChange={(v) => set({ monthly: v })} min={0} max={cur === 'PLN' ? 20000 : 5000} step={cur === 'PLN' ? 100 : 25} format={(v) => money(v, 0)} unit={cur} accent={seriesColor(0, isDark)} />
          <Slider label="Horyzont inwestycji" value={p.years} onChange={(v) => set({ years: v })} min={1} max={50} step={1} format={(v) => `${v} lat`} accent={seriesColor(0, isDark)} />
          <Slider label="Stopa zwrotu indeksu (przed kosztami)" value={p.grossReturn} onChange={(v) => set({ grossReturn: v })} min={0} max={15} step={0.1} format={(v) => `${v.toFixed(1).replace('.', ',')}%`} accent={seriesColor(2, isDark)} />
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-stone-600 dark:text-stone-400">Rodzaj konta</div>
            <Segmented size="sm" value={p.account} onChange={(v) => set({ account: v })} ariaLabel="Rodzaj konta" options={Object.values(ETF_ACCOUNTS).map((a) => ({ value: a.id, label: a.label }))} />
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">Porównywane ETF-y</span>
            <div className="ml-auto flex flex-wrap gap-2">
              {portfolioEtfs.length > 0 && (
                <Button size="sm" icon={Download} onClick={() => set({ etfs: portfolioEtfs })}>
                  Wczytaj ETF-y z portfela
                </Button>
              )}
              <Button size="sm" icon={Plus} onClick={addEtf} disabled={p.etfs.length >= MAX_ETFS}>
                Dodaj ETF
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {p.etfs.map((e, i) => (
              <div key={e.id} className="grid grid-cols-2 items-end gap-2 rounded-xl border border-stone-200 p-3 sm:grid-cols-[minmax(0,2fr)_7rem_minmax(0,1.6fr)_7rem_auto] dark:border-white/10">
                <Field label="Nazwa" className="col-span-2 sm:col-span-1">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: colors[i] }} />
                    <Input value={e.name} onChange={(ev) => setEtf(e.id, { name: ev.target.value })} aria-label={`Nazwa ETF ${i + 1}`} />
                  </div>
                </Field>
                <Field label="TER (%)">
                  <Input type="number" min="0" step="0.01" value={e.ter} onChange={(ev) => setEtf(e.id, { ter: ev.target.value })} aria-label={`TER ETF ${i + 1}`} />
                </Field>
                <Field label="Waluta notowań">
                  <Select value={etfCurrency(e)} onChange={(ev) => setEtf(e.id, { currency: ev.target.value, foreign: undefined, fxPct: Number(e.fxPct) || XTB_FX_FEE_PCT })} aria-label={`Waluta ETF ${i + 1}`}>
                    {ETF_QUOTE_CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Przewalutowanie (%)">
                  <Input type="number" min="0" step="0.01" value={needsFx(e, cur) ? e.fxPct : 0} disabled={!needsFx(e, cur)} onChange={(ev) => setEtf(e.id, { fxPct: ev.target.value })} aria-label={`Przewalutowanie ETF ${i + 1}`} />
                </Field>
                <button
                  type="button"
                  onClick={() => removeEtf(e.id)}
                  disabled={p.etfs.length <= 1}
                  className="mb-1 justify-self-end rounded-md p-2 text-stone-400 hover:bg-stone-100 hover:text-red-600 disabled:opacity-30 dark:hover:bg-white/5"
                  aria-label={`Usuń ETF ${i + 1}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* 2. Wykres */}
      <Card
        title={chartMode === 'COST' ? 'Utracony wynik przez koszty' : 'Wartość inwestycji w czasie'}
        subtitle={chartMode === 'COST' ? 'Skumulowana różnica względem tego samego indeksu bez TER i przewalutowania (przed sprzedażą)' : 'Przed sprzedażą i podatkiem · linia przerywana – ten sam indeks bez żadnych kosztów'}
        icon={LineIcon}
        actions={
          <Segmented
            size="sm"
            value={chartMode}
            onChange={setChartMode}
            ariaLabel="Rodzaj wykresu"
            options={[
              { value: 'COST', label: 'Koszty' },
              { value: 'VALUE', label: 'Wartość' },
            ]}
          />
        }
      >
        <Legend items={[...result.rows.map((r, i) => ({ key: r.id, label: r.name, color: colors[i] })), ...(chartMode === 'VALUE' ? [{ key: 'base', label: 'Bez kosztów', color: chrome.muted, dashed: true }] : [])]} />
        <div className="mt-2 h-72 sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={chrome.grid} vertical={false} />
              <XAxis dataKey="year" tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: chrome.axis }} minTickGap={16} />
              <YAxis tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={72} tickFormatter={(v) => (cur === 'PLN' ? formatAxisPLN(v) : `${Math.round(v / 1000)} tys. ${cur}`)} />
              <Tooltip content={<ChartTooltip formatter={(v) => `${money(v)}${inPLN(v)}`} labelFormatter={(l) => `Rok ${l}`} />} />
              {chartMode === 'VALUE' && <Line type="monotone" dataKey="base" name="Bez kosztów" stroke={chrome.muted} strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
              {result.rows.map((r, i) => (
                <Line type="monotone" key={r.id} dataKey={r.id} name={r.name} stroke={colors[i]} strokeWidth={2} dot={false} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* 3. Wyniki */}
      <Card title={`Wynik po ${p.years} latach (${cur})`} subtitle={`Wpłacono ${money(result.noCost.contributed)}${inPLN(result.noCost.contributed)} · bez kosztów: ${money(result.noCost.net)} (${formatPercent(result.baselineReturn, { digits: 2 })} rocznie)`} icon={Percent} bodyClassName="p-0 sm:p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-stone-100 text-left text-xs text-stone-500 dark:border-white/5 dark:text-stone-400">
                <th className="px-4 py-2 font-medium sm:px-5">ETF</th>
                <th className="px-3 py-2 font-medium">Waluta</th>
                <th className="px-3 py-2 text-right font-medium">TER</th>
                <th className="px-3 py-2 text-right font-medium">FX</th>
                <th className="px-3 py-2 text-right font-medium">Wynik netto</th>
                <th className="px-3 py-2 text-right font-medium">Koszt TER</th>
                <th className="px-3 py-2 text-right font-medium">Koszt przewalutowania</th>
                <th className="px-3 py-2 text-right font-medium">Stopa roczna netto</th>
                <th className="px-4 py-2 text-right font-medium sm:px-5">vs najlepszy</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {result.rows.map((r, i) => (
                <tr key={r.id} className={`border-b border-stone-100 last:border-0 dark:border-white/5 ${r.isBest ? 'bg-emerald-50/60 dark:bg-emerald-500/5' : ''}`}>
                  <td className="px-4 py-2 sm:px-5">
                    <div className="flex items-center gap-2 font-medium">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[i] }} />
                      {r.name}
                      {r.isBest && <Badge tone="green">najtańszy</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-stone-500">{r.currency}</td>
                  <td className="px-3 py-2 text-right">{formatPercent(r.ter / 100, { digits: 2 })}</td>
                  <td className="px-3 py-2 text-right">{r.fxPct > 0 ? formatPercent(r.fxPct / 100, { digits: 2 }) : '—'}</td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {money(r.net)}
                    {cur !== 'PLN' && <div className="text-[11px] font-normal text-stone-500">{formatPLN(r.net * rate)}</div>}
                  </td>
                  <td className="px-3 py-2 text-right text-red-600 dark:text-red-400">{money(-r.terCost)}</td>
                  <td className="px-3 py-2 text-right text-red-600 dark:text-red-400">{r.fxCost > 0.005 ? money(-r.fxCost) : '—'}</td>
                  <td className="px-3 py-2 text-right">
                    {formatPercent(r.effectiveReturn, { digits: 2 })}
                    <div className="text-[11px] text-stone-500">−{(r.drag * 100).toFixed(2).replace('.', ',')} pp kosztów</div>
                  </td>
                  <td className={`px-4 py-2 text-right sm:px-5 ${r.isBest ? 'text-stone-400' : 'text-red-600 dark:text-red-400'}`}>{r.isBest ? '—' : money(r.vsBest)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 text-[11px] text-stone-500 sm:px-5 dark:text-stone-500">
          Kwoty i wynik w walucie kalkulatora ({cur}){cur !== 'PLN' ? `; przeliczenie na złote po kursie${/NBP/.test(fxSource) ? ' NBP' : ''} 1 ${cur} = ${rate.toFixed(4).replace('.', ',')} zł` : ''}. TER pobierany co miesiąc z wartości funduszu. Przewalutowanie (np. XTB 0,05%) – tylko dla ETF-ów notowanych w innej walucie niż konto – doliczane do każdej wpłaty i potrącane przy sprzedaży całej pozycji na końcu. Koszt TER i przewalutowania to
          utracony wynik netto względem wariantu bez danego kosztu (z efektem procentu składanego). Stopa roczna netto – stopa ważona kapitałem po kosztach i podatku.
        </p>
      </Card>

      {/* 4. Koszty ETF-ów w obecnym portfelu */}
      <TerAnalysis analysis={analysis} />
    </div>
  );
}
