import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Landmark, RotateCcw, Trophy } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { BOND_CALC_TYPES, compareBonds, defaultBondCalc } from '../../lib/bondCalc.js';
import { getCpiTable } from '../../lib/bonds.js';
import { chartChrome, seriesColor } from '../../lib/colors.js';
import { formatPLN, formatPercent } from '../../lib/format.js';
import { Badge, Button, Card, ChartTooltip, Field, Input, Slider, Toggle } from '../ui.jsx';
import { Legend } from '../charts/chartUtils.jsx';
import { CpiCard } from '../bonds/SavingsSection.jsx';

const KEY = 'wealth-app-bond-calc';
const SLOTS = { OTS: 6, ROR: 3, DOR: 4, TOS: 1, COI: 2, EDO: 0 };
const QUICK = [
  { months: 3, label: '3 mies.' },
  { months: 12, label: '1 rok' },
  { months: 24, label: '2 lata' },
  { months: 36, label: '3 lata' },
  { months: 48, label: '4 lata' },
  { months: 120, label: '10 lat' },
];

function readParams() {
  const base = defaultBondCalc();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    return saved ? { ...base, ...saved, offers: { ...base.offers, ...(saved.offers || {}) } } : base;
  } catch {
    return base;
  }
}

function horizonLabel(m) {
  const y = Math.floor(m / 12);
  const r = m % 12;
  return [y ? `${y} ${y === 1 ? 'rok' : y < 5 ? 'lata' : 'lat'}` : '', r ? `${r} mies.` : ''].filter(Boolean).join(' ') || '0 mies.';
}

// Kalkulator obligacyjny: która obligacja skarbowa opłaca się najbardziej przy planowanym horyzoncie –
// z przedterminowym wykupem (opłata), podatkiem Belki, reinwestycją i miesięcznymi odczytami inflacji
export default function BondCalculator() {
  const { state, isDark } = useApp();
  const chrome = chartChrome(isDark);
  const [p, setP] = useState(readParams);
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
  const setOffer = (id, patch) => set({ offers: { ...p.offers, [id]: { ...p.offers[id], ...patch } } });
  const cpi = useMemo(() => getCpiTable(state.settings), [state.settings]);
  const result = useMemo(() => compareBonds(p, cpi), [p, cpi]);
  const color = (id) => seriesColor(SLOTS[id] ?? 0, isDark);
  const data = useMemo(() => {
    const H = Math.max(1, Math.round(p.horizon));
    const step = H > 60 ? 3 : 1;
    const out = [];
    for (let m = 0; m <= H; m += step) {
      const row = { month: m };
      for (const r of result.rows) if (!r.unavailable) row[r.id] = Math.round(r.points[m]?.value ?? 0);
      out.push(row);
    }
    if (out[out.length - 1].month !== H) {
      const row = { month: H };
      for (const r of result.rows) if (!r.unavailable) row[r.id] = Math.round(r.points[H]?.value ?? 0);
      out.push(row);
    }
    return out;
  }, [result, p.horizon]);
  const best = result.rows.find((r) => r.id === result.best);

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card title="Kalkulator obligacyjny" subtitle="Porównanie obligacji skarbowych przy Twoim horyzoncie – z przedterminowym wykupem, podatkiem Belki i inflacją" icon={Landmark}>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Kwota inwestycji (zł)">
            <Input type="number" min="100" step="100" value={p.amount} onChange={(e) => set({ amount: Math.max(0, Number(e.target.value) || 0) })} />
          </Field>
          <div className="space-y-2">
            <Slider label="Horyzont – ile miesięcy trzymasz obligacje" value={p.horizon} onChange={(v) => set({ horizon: v })} min={1} max={144} step={1} format={(v) => `${v} mies.`} unit="mies." accent={seriesColor(0, isDark)} />
            <div className="flex flex-wrap gap-1">
              {QUICK.map((q) => (
                <button
                  key={q.months}
                  type="button"
                  onClick={() => set({ horizon: q.months })}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] ${p.horizon === q.months ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'border-stone-200 hover:bg-stone-100 dark:border-white/10 dark:hover:bg-white/5'}`}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
          <Field label="Miesiąc zakupu">
            <Input type="month" value={p.start} onChange={(e) => e.target.value && set({ start: e.target.value })} />
          </Field>
          <Slider label="Założona inflacja (r/r) dla miesięcy bez odczytu" value={p.inflation} onChange={(v) => set({ inflation: v })} min={0} max={15} step={0.1} format={(v) => `${v.toFixed(1).replace('.', ',')}%`} accent={seriesColor(2, isDark)} />
          <Slider label="Stopa referencyjna NBP (ROR / DOR)" value={p.nbpRate} onChange={(v) => set({ nbpRate: v })} min={0} max={10} step={0.05} format={(v) => `${v.toFixed(2).replace('.', ',')}%`} accent={seriesColor(3, isDark)} />
          <div className="space-y-3">
            <Toggle checked={p.belka !== false} onChange={(v) => set({ belka: v })} label="Podatek Belki (19%)" description="Od odsetek i kuponów; przy wcześniejszym wykupie – od zysku po opłacie" />
            <Toggle checked={!!p.reinvest} onChange={(v) => set({ reinvest: v })} label="Reinwestuj po wykupie" description="Gdy horyzont jest dłuższy niż czas trwania obligacji – zakup kolejnej serii" />
          </div>
        </div>

        <details className="mt-5 rounded-xl border border-stone-200 dark:border-white/10">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold">Parametry ofert (oprocentowanie, marża, opłata za wcześniejszy wykup)</summary>
          <div className="overflow-x-auto px-4 pb-3">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-500">
                  <th className="py-1.5 font-medium">Obligacja</th>
                  <th className="py-1.5 font-medium">Oprocentowanie 1. okresu (%)</th>
                  <th className="py-1.5 font-medium">Marża (%)</th>
                  <th className="py-1.5 font-medium">Opłata za wykup (zł / szt.)</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(BOND_CALC_TYPES).map((t) => (
                  <tr key={t.id}>
                    <td className="py-1 pr-2">
                      <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ background: color(t.id) }} />
                      {t.label}
                    </td>
                    <td className="py-1 pr-2">
                      <Input type="number" step="0.05" value={p.offers[t.id].first} onChange={(e) => setOffer(t.id, { first: e.target.value })} className="h-8" aria-label={`Oprocentowanie ${t.id}`} />
                    </td>
                    <td className="py-1 pr-2">
                      <Input type="number" step="0.05" value={p.offers[t.id].margin} disabled={t.indexed === 'FIXED'} onChange={(e) => setOffer(t.id, { margin: e.target.value })} className="h-8" aria-label={`Marża ${t.id}`} />
                    </td>
                    <td className="py-1">
                      {t.fee === null ? (
                        <span className="text-xs text-stone-500">brak wcześniejszego wykupu</span>
                      ) : (
                        <Input type="number" step="0.1" min="0" value={p.offers[t.id].fee} onChange={(e) => setOffer(t.id, { fee: e.target.value })} className="h-8" aria-label={`Opłata ${t.id}`} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-500">
              <span>COI/EDO od 2. roku: marża + inflacja CPI r/r z miesiąca o 2 wcześniejszego niż początek okresu; ROR/DOR od 2. miesiąca: stopa NBP + marża. Opłata za wcześniejszy wykup nie przekracza naliczonych odsetek.</span>
              <Button size="sm" icon={RotateCcw} onClick={() => set({ offers: defaultBondCalc().offers })}>
                Domyślne oferty
              </Button>
            </div>
          </div>
        </details>
      </Card>

      {best && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <Trophy size={18} className="text-emerald-700 dark:text-emerald-400" />
          <span>
            Przy horyzoncie <strong>{horizonLabel(p.horizon)}</strong> najbardziej opłaca się <strong>{best.type.label}</strong>: {formatPLN(best.final)} na rękę (
            <span className="text-emerald-700 dark:text-emerald-400">{formatPLN(best.profit, { sign: true })}</span>, {formatPercent(best.annual, { sign: true })} rocznie
            {best.fees > 0 ? `, po opłacie za wcześniejszy wykup ${formatPLN(best.fees)}` : ''}).
          </span>
        </div>
      )}

      <Card title="Wartość netto przy wykupie w danym miesiącu" subtitle="Ile dostaniesz, sprzedając obligacje w tym momencie (po opłacie i podatku)" bodyClassName="p-4 sm:p-5">
        <Legend items={result.rows.filter((r) => !r.unavailable).map((r) => ({ key: r.id, label: r.id, color: color(r.id) }))} />
        <div className="mt-2 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={chrome.grid} vertical={false} />
              <XAxis dataKey="month" tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: chrome.axis }} tickFormatter={(m) => (m % 12 === 0 ? `${m / 12} r.` : `${m} m`)} minTickGap={24} />
              <YAxis tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => `${Math.round(v).toLocaleString('pl-PL')}`} domain={['auto', 'auto']} />
              <Tooltip content={<ChartTooltip formatter={(v) => formatPLN(v)} labelFormatter={(m) => `Po ${horizonLabel(m)}`} />} />
              {result.rows
                .filter((r) => !r.unavailable)
                .map((r) => (
                  <Line key={r.id} type="monotone" dataKey={r.id} name={r.id} stroke={color(r.id)} strokeWidth={r.id === result.best ? 3 : 1.75} dot={false} isAnimationActive={false} />
                ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title={`Wynik po ${horizonLabel(p.horizon)}`} subtitle={`Kwota ${formatPLN(p.amount)} · od ${p.start}`} bodyClassName="p-0 sm:p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-stone-100 text-left text-xs text-stone-500 dark:border-white/5">
                <th className="px-4 py-2 font-medium">Obligacja</th>
                <th className="px-3 py-2 text-right font-medium">Wartość netto</th>
                <th className="px-3 py-2 text-right font-medium">Zysk przed opłatą</th>
                <th className="px-3 py-2 text-right font-medium">Opłata za wykup</th>
                <th className="px-3 py-2 text-right font-medium">Zysk na rękę</th>
                <th className="px-3 py-2 text-right font-medium">Rocznie (na rękę)</th>
                <th className="px-3 py-2 text-right font-medium">Realnie (po inflacji)</th>
                <th className="px-4 py-2 font-medium">Wykup</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {result.rows.map((r) => (
                <tr key={r.id} className={`border-b border-stone-100 last:border-0 dark:border-white/5 ${r.unavailable ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2 font-medium">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color(r.id) }} />
                      {r.type.label}
                      {r.id === result.best && <Badge tone="green">najlepsza</Badge>}
                    </div>
                  </td>
                  {r.unavailable ? (
                    <td colSpan={8} className="px-3 py-2 text-xs text-stone-500">
                      Bez przedterminowego wykupu – wybierz horyzont będący wielokrotnością {r.type.months} mies.
                    </td>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-right font-semibold">{formatPLN(r.final)}</td>
                      <td className="px-3 py-2 text-right text-stone-500">{formatPLN(r.profitBeforeFee, { sign: true })}</td>
                      <td className={`px-3 py-2 text-right ${r.fees > 0 ? 'text-red-600 dark:text-red-400' : 'text-stone-400'}`}>{r.fees > 0 ? `−${formatPLN(r.fees)}` : '—'}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${r.profit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{formatPLN(r.profit, { sign: true })}</td>
                      <td className="px-3 py-2 text-right">{formatPercent(r.annual, { sign: true })}</td>
                      <td className={`px-3 py-2 text-right ${r.real >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {formatPLN(r.real, { sign: true })}
                        <div className="text-[11px] text-stone-500">{formatPercent(r.realAnnual, { sign: true })} / rok</div>
                      </td>
                      <td className="px-4 py-2 text-xs text-stone-500">
                        {(() => {
                          const rolled = r.early ? r.cycles : r.cycles - 1;
                          const prefix = rolled > 0 ? `${rolled}× wykup${p.reinvest ? ' + reinwestycja' : ''}, ` : '';
                          return r.early ? `${prefix}przedterminowy po ${horizonLabel(p.horizon - r.cycles * r.type.months)} od zakupu serii` : `${prefix}w terminie`;
                        })()}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2.5 text-[11px] text-stone-500 sm:px-5">
          Wartość, zysk i stopy „na rękę” – po opłacie za przedterminowy wykup (odejmowanej od wypracowanych odsetek; zgodnie z listem emisyjnym nie wyższej niż naliczone odsetki, więc nie zmniejsza wpłaconego kapitału) i po podatku Belki od zysku pomniejszonego o opłatę. Ranking wg kwoty na rękę. Inflacja: miesięczne odczyty CPI z tabeli poniżej (GUS lub wpisane ręcznie), dla przyszłych miesięcy – założenie. Kupony COI/ROR/DOR wypłacane i niereinwestowane (wliczone do wartości).
        </p>
      </Card>

      <CpiCard />
    </div>
  );
}
