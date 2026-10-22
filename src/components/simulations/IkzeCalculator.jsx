import { useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PiggyBank } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { IKZE_TAX_FORMS, defaultIkzeCalc, simulateIkze } from '../../lib/ikzeCalc.js';
import { contributionLimitsForYear } from '../../lib/tax.js';
import { chartChrome, seriesColor } from '../../lib/colors.js';
import { formatAxisPLN, formatPLN, formatPercent } from '../../lib/format.js';
import { Card, ChartTooltip, Field, Input, Segmented, Slider, Toggle } from '../ui.jsx';
import { Legend } from '../charts/chartUtils.jsx';

const KEY = 'wealth-app-ikze-calc';

// Kalkulator IKZE: zwrot podatku wg formy opodatkowania i zarobków + projekcja kapitału i zysku w czasie
export default function IkzeCalculator() {
  const { state, isDark } = useApp();
  const chrome = chartChrome(isDark);
  const year = new Date().getFullYear();
  const limits = contributionLimitsForYear(state.settings, year);
  const [p, setP] = useState(() => {
    const base = defaultIkzeCalc(state.settings, limits.ikze);
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      return saved ? { ...base, ...saved } : base;
    } catch {
      return base;
    }
  });
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
  const limit0 = p.selfEmployed ? limits.ikzeSelfEmployed : limits.ikze;
  const sim = useMemo(() => simulateIkze(p, limit0), [p, limit0]);
  const c = (slot) => seriesColor(slot, isDark);
  const data = sim.rows.map((r) => ({
    label: `${year + r.year - 1}`,
    contributions: Math.round(r.contributions),
    ikze: Math.round(r.ikze),
    totalNet: Math.round(r.totalNet),
    brokerNet: Math.round(r.brokerNet),
  }));
  const first = sim.firstYear;

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card title="Kalkulator IKZE" subtitle="Zwrot podatku z wpłat na IKZE i wzrost kapitału w czasie – wg Twoich zarobków i formy opodatkowania" icon={PiggyBank}>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2 xl:col-span-3">
            <div className="text-xs font-medium text-stone-600 dark:text-stone-400">Forma opodatkowania</div>
            <Segmented size="sm" value={p.form} onChange={(v) => set({ form: v })} ariaLabel="Forma opodatkowania" options={Object.values(IKZE_TAX_FORMS).map((f) => ({ value: f.id, label: f.label }))} />
          </div>
          {p.form === 'SCALE' && (
            <Field label="Roczny dochód do opodatkowania (zł)" hint="Powyżej 120 000 zł część odliczenia daje zwrot 32%">
              <Input type="number" min="0" step="1000" value={p.income} onChange={(e) => set({ income: Math.max(0, Number(e.target.value) || 0) })} />
            </Field>
          )}
          {p.form === 'LUMP_SUM' && (
            <Field label="Stawka ryczałtu (%)" hint="Wpłata na IKZE odliczana od przychodu">
              <Input type="number" min="0" max="17" step="0.5" value={p.lumpRate} onChange={(e) => set({ lumpRate: e.target.value })} />
            </Field>
          )}
          {p.form === 'SCALE' && (
            <Slider label="Wzrost dochodu r/r" value={p.incomeGrowth} onChange={(v) => set({ incomeGrowth: v })} min={0} max={15} step={0.5} format={(v) => `${v.toFixed(1).replace('.', ',')}%`} accent={c(3)} />
          )}
          <div className="space-y-2">
            <div className="text-xs font-medium text-stone-600 dark:text-stone-400">Wpłaty roczne</div>
            <Segmented
              size="sm"
              value={p.contributionMode}
              onChange={(v) => set({ contributionMode: v })}
              ariaLabel="Wpłaty"
              options={[
                { value: 'LIMIT', label: 'Pełny limit' },
                { value: 'CUSTOM', label: 'Własna kwota' },
              ]}
            />
            {p.contributionMode === 'CUSTOM' && (
              <Input type="number" min="0" step="100" value={p.amount} onChange={(e) => set({ amount: Math.max(0, Number(e.target.value) || 0) })} aria-label="Roczna wpłata" />
            )}
            <div className="text-[11px] text-stone-500">
              Limit {year}: {formatPLN(limit0)}
              {p.selfEmployed ? ' (JDG)' : ''}
            </div>
          </div>
          <div className="space-y-3">
            <Toggle checked={!!p.selfEmployed} onChange={(v) => set({ selfEmployed: v })} label="Prowadzę działalność gospodarczą" description="Wyższy limit IKZE (1,8× przeciętnego wynagrodzenia)" />
            <Toggle checked={!!p.reinvestRefund} onChange={(v) => set({ reinvestRefund: v })} label="Reinwestuj zwrot podatku" description="Zwrot z PIT inwestowany na zwykłym koncie (Belka 19% od zysku)" />
          </div>
          <Slider label="Założona roczna stopa zwrotu" value={p.returnPct} onChange={(v) => set({ returnPct: v })} min={0} max={15} step={0.1} format={(v) => `${v.toFixed(1).replace('.', ',')}%`} accent={c(0)} />
          <Slider label="Horyzont (lata wpłat)" value={p.years} onChange={(v) => set({ years: v })} min={1} max={45} step={1} format={(v) => `${v} lat`} accent={c(0)} />
          <Slider label="Wzrost limitu r/r" value={p.limitGrowth} onChange={(v) => set({ limitGrowth: v })} min={0} max={12} step={0.5} format={(v) => `${v.toFixed(1).replace('.', ',')}%`} accent={c(2)} />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label={`Zwrot podatku w ${year}`} value={formatPLN(first.refund)} sub={`${formatPercent(first.rate, { digits: 1 })} wpłaty ${formatPLN(first.amount)}`} tone="text-emerald-700 dark:text-emerald-400" />
        <Tile label="Suma wpłat" value={formatPLN(sim.contributions)} sub={`${p.years} lat`} />
        <Tile label="Suma zwrotów podatku" value={formatPLN(sim.refunds)} tone="text-emerald-700 dark:text-emerald-400" />
        <Tile label="Wartość IKZE" value={formatPLN(sim.ikze)} sub={`zysk ${formatPLN(sim.ikze - sim.contributions, { sign: true })}`} />
        <Tile label="IKZE netto po wypłacie" value={formatPLN(sim.ikzeNet)} sub={`podatek 10%: ${formatPLN(sim.payoutTax)}`} />
        <Tile label="Przewaga vs zwykłe konto" value={formatPLN(sim.advantage, { sign: true })} sub={`razem ze zwrotami ${formatPLN(sim.totalNet)}`} tone={sim.advantage >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'} />
      </div>

      <Card title="Kapitał i zysk w czasie" bodyClassName="p-4 sm:p-5">
        <Legend
          items={[
            { key: 'c', label: 'Suma wpłat', color: chrome.muted, dashed: true },
            { key: 'i', label: 'Wartość IKZE', color: c(0) },
            { key: 't', label: 'IKZE netto + zwroty podatku', color: c(2) },
            { key: 'b', label: 'Zwykłe konto (netto)', color: c(7) },
          ]}
        />
        <div className="mt-2 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={chrome.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: chrome.axis }} minTickGap={20} />
              <YAxis tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={64} tickFormatter={formatAxisPLN} />
              <Tooltip content={<ChartTooltip formatter={(v) => formatPLN(v)} />} />
              <Area type="monotone" dataKey="ikze" name="Wartość IKZE" stroke={c(0)} fill={c(0)} fillOpacity={0.1} strokeWidth={2.5} isAnimationActive={false} />
              <Line type="monotone" dataKey="totalNet" name="IKZE netto + zwroty" stroke={c(2)} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="brokerNet" name="Zwykłe konto (netto)" stroke={c(7)} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="contributions" name="Suma wpłat" stroke={chrome.muted} strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Projekcja rok po roku" bodyClassName="p-0 sm:p-0">
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="sticky top-0 bg-white dark:bg-neutral-900">
              <tr className="border-b border-stone-100 text-left text-xs text-stone-500 dark:border-white/5">
                <th className="px-4 py-2 font-medium">Rok</th>
                <th className="px-3 py-2 text-right font-medium">Wpłata</th>
                <th className="px-3 py-2 text-right font-medium">Zwrot podatku</th>
                <th className="px-3 py-2 text-right font-medium">Suma wpłat</th>
                <th className="px-3 py-2 text-right font-medium">Wartość IKZE</th>
                <th className="px-3 py-2 text-right font-medium">Zysk</th>
                <th className="px-4 py-2 text-right font-medium">Netto + zwroty</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {sim.rows.map((r) => (
                <tr key={r.year} className="border-b border-stone-100 last:border-0 dark:border-white/5">
                  <td className="px-4 py-1.5">{year + r.year - 1}</td>
                  <td className="px-3 py-1.5 text-right">{formatPLN(r.amount)}</td>
                  <td className="px-3 py-1.5 text-right text-emerald-700 dark:text-emerald-400">
                    {formatPLN(r.refund)} <span className="text-[11px] text-stone-500">({formatPercent(r.rate, { digits: 0 })})</span>
                  </td>
                  <td className="px-3 py-1.5 text-right">{formatPLN(r.contributions)}</td>
                  <td className="px-3 py-1.5 text-right font-medium">{formatPLN(r.ikze)}</td>
                  <td className="px-3 py-1.5 text-right text-emerald-700 dark:text-emerald-400">{formatPLN(r.gain, { sign: true })}</td>
                  <td className="px-4 py-1.5 text-right">{formatPLN(r.totalNet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2.5 text-[11px] text-stone-500 sm:px-5">
          Wpłata na początku roku, zwrot podatku po rozliczeniu PIT. Wypłata z IKZE po 65. r.ż.: 10% zryczałtowanego podatku od całej kwoty. Zwykłe konto: te same wpłaty, Belka 19% od zysku. Limit w kolejnych latach rośnie o założony procent.
        </p>
      </Card>
    </div>
  );
}

function Tile({ label, value, sub, tone = '' }) {
  return (
    <div className="min-w-0 rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">{label}</div>
      <div className={`truncate text-lg font-semibold tabular ${tone}`}>{value}</div>
      {sub && <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">{sub}</div>}
    </div>
  );
}
