import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../../state/AppContext.jsx';
import { incomeEventsWithTax, isoDay } from '../../lib/engine.js';
import { STATUS_META, evaluateScheduleItem } from '../../lib/dividends.js';
import { createPriceResolver } from '../../lib/history.js';
import { chartChrome, seriesColor } from '../../lib/colors.js';
import { formatDate, formatPLN, formatPercent } from '../../lib/format.js';
import { Badge, Button, ChartTooltip, Field, Input, Modal, Segmented, Select } from '../ui.jsx';

// Dywidendy waloru na danym koncie: wypłacone (brutto, podatek, netto) + nadchodzące z harmonogramu
export function DividendsModal({ row, onClose }) {
  const { state } = useApp();
  const today = isoDay(new Date());
  const paid = useMemo(
    () =>
      row
        ? incomeEventsWithTax(state)
            .filter((i) => i.type === 'DIVIDEND' && i.instrumentId === row.instrumentId && i.accountId === row.accountId && i.date <= today)
            .sort((a, b) => (a.date < b.date ? 1 : -1))
        : [],
    [state, row],
  );
  const upcoming = useMemo(
    () =>
      row
        ? state.dividendSchedule
            .filter((d) => d.instrumentId === row.instrumentId && (d.payDate || d.exDate) >= today)
            .map((d) => ({ item: d, ev: evaluateScheduleItem(state, d, today) }))
            .sort((a, b) => ((a.item.payDate || a.item.exDate) < (b.item.payDate || b.item.exDate) ? -1 : 1))
        : [],
    [state, row, today],
  );
  const totalNet = paid.reduce((s, i) => s + i.net, 0);
  const yieldOnCost = row?.cost > 0 ? paid.filter((i) => i.date > isoDay(new Date(Date.now() - 365 * 86400000))).reduce((s, i) => s + i.net, 0) / row.cost : null;
  return (
    <Modal open={!!row} onClose={onClose} title={`Dywidendy: ${row?.name || ''}`}>
      {row && (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-2">
            <Mini label="Otrzymane netto" value={formatPLN(totalNet)} />
            <Mini label="Wypłat" value={String(paid.length)} />
            <Mini label="Stopa od kosztu (12 mies.)" value={yieldOnCost === null ? '—' : formatPercent(yieldOnCost, { digits: 2 })} />
          </div>
          {upcoming.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold text-stone-500">Nadchodzące</div>
              <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 dark:divide-white/5 dark:border-white/10">
                {upcoming.map(({ item, ev }) => (
                  <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="w-24 shrink-0 text-xs text-stone-500 tabular">{formatDate(item.payDate || item.exDate)}</span>
                    <Badge tone={STATUS_META[ev.status]?.tone}>{STATUS_META[ev.status]?.label}</Badge>
                    <span className="ml-auto font-semibold tabular">{formatPLN(ev.perAccount.find((a) => a.accountId === row.accountId)?.net ?? ev.net)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <div className="mb-1 text-xs font-semibold text-stone-500">Wypłacone</div>
            {paid.length === 0 ? (
              <p className="text-xs text-stone-500">Brak zaksięgowanych dywidend dla tej pozycji.</p>
            ) : (
              <ul className="max-h-[45vh] divide-y divide-stone-100 overflow-y-auto rounded-xl border border-stone-200 dark:divide-white/5 dark:border-white/10">
                {paid.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-24 shrink-0 text-xs text-stone-500 tabular">{formatDate(i.date)}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-stone-500">
                      brutto {formatPLN(Number(i.gross))} · podatek {formatPLN(i.tax)}
                    </span>
                    <span className="font-semibold text-emerald-700 tabular dark:text-emerald-400">{formatPLN(i.net, { sign: true })}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

// Edycja danych instrumentu (ticker, nazwa, rodzaj, waluta, symbol notowań, TER)
export function InstrumentEditModal({ instrumentId, onClose }) {
  const { state, actions } = useApp();
  const inst = state.instruments.find((i) => i.id === instrumentId);
  const [form, setForm] = useState(null);
  const f = form || inst;
  const set = (patch) => setForm({ ...f, ...patch });
  const close = () => {
    setForm(null);
    onClose();
  };
  return (
    <Modal
      open={!!inst}
      onClose={close}
      title={`Edytuj walor: ${inst?.ticker || ''}`}
      footer={
        <>
          <Button onClick={close}>Anuluj</Button>
          <Button
            variant="primary"
            disabled={!f?.ticker?.trim()}
            onClick={() => {
              actions.upsert('instruments', { ...f, ticker: f.ticker.trim().toUpperCase(), name: (f.name || '').trim() || f.ticker.trim(), ter: Number(f.ter) || 0 });
              actions.notify('Zapisano walor', 'success');
              close();
            }}
          >
            Zapisz
          </Button>
        </>
      }
    >
      {f && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ticker">
            <Input value={f.ticker || ''} onChange={(e) => set({ ticker: e.target.value })} />
          </Field>
          <Field label="Nazwa">
            <Input value={f.name || ''} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Rodzaj">
            <Select value={f.kind} onChange={(e) => set({ kind: e.target.value })}>
              <option value="STOCK">Akcja</option>
              <option value="ETF">ETF/ETC/ETN</option>
            </Select>
          </Field>
          <Field label="Waluta notowań">
            <Select value={f.currency || 'PLN'} onChange={(e) => set({ currency: e.target.value })}>
              {['PLN', 'USD', 'EUR', 'GBP', 'CHF'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Symbol Yahoo (notowania)">
            <Input value={f.yahooSymbol || ''} onChange={(e) => set({ yahooSymbol: e.target.value })} placeholder="np. LPP.WA" />
          </Field>
          <Field label="TER (%)">
            <Input type="number" step="0.01" min="0" value={f.ter ?? 0} onChange={(e) => set({ ter: e.target.value })} />
          </Field>
          <Field label="Strona firmy (logo w raporcie X)" className="col-span-2" hint="Domena, np. lpp.com – puste = wbudowana lista spółek">
            <Input value={f.logoDomain || ''} onChange={(e) => set({ logoDomain: e.target.value.trim() })} placeholder="np. lpp.com" />
          </Field>
          <Field label="Sektor" className="col-span-2">
            <Input value={f.sector || ''} onChange={(e) => set({ sector: e.target.value })} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

const RANGES = [
  { value: 90, label: '3M' },
  { value: 365, label: '1R' },
  { value: 365 * 3, label: '3L' },
];

// Wykres ceny waloru (PLN) z linią średniej ceny zakupu
export function PriceChartModal({ row, onClose }) {
  const { state, isDark } = useApp();
  const [days, setDays] = useState(365);
  const chrome = chartChrome(isDark);
  const inst = row ? state.instruments.find((i) => i.id === row.instrumentId) : null;
  const data = useMemo(() => {
    if (!inst) return [];
    const resolver = createPriceResolver(state);
    const out = [];
    const step = days <= 90 ? 1 : days <= 365 ? 3 : 7;
    for (let d = days; d >= 0; d -= step) {
      const iso = isoDay(new Date(Date.now() - d * 86400000));
      const v = resolver.instrumentPLN(inst, iso);
      if (Number.isFinite(v)) out.push({ date: iso, price: Math.round(v * 100) / 100 });
    }
    if (row.currentPricePLN) out.push({ date: isoDay(new Date()), price: Math.round(row.currentPricePLN * 100) / 100 });
    return out;
  }, [state, inst, days, row]);
  const first = data[0]?.price;
  const last = data[data.length - 1]?.price;
  const color = last >= first ? seriesColor(0, isDark) : seriesColor(7, isDark);
  return (
    <Modal open={!!row} onClose={onClose} title={`Notowania: ${row?.name || ''}`}>
      {row && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented size="sm" value={days} onChange={setDays} options={RANGES} ariaLabel="Zakres" />
            <span className="text-sm tabular">
              {formatPLN(last)}{' '}
              {first > 0 && <span className={last >= first ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>({formatPercent(last / first - 1, { sign: true })})</span>}
            </span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={chrome.grid} vertical={false} />
                <XAxis dataKey="date" tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: chrome.axis }} minTickGap={40} tickFormatter={(d) => new Date(d).toLocaleDateString('pl-PL', { month: 'short', year: '2-digit' })} />
                <YAxis domain={['auto', 'auto']} tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                <Tooltip content={<ChartTooltip formatter={(v) => formatPLN(v)} labelFormatter={(d) => formatDate(d)} />} />
                {row.avgPricePLN > 0 && <ReferenceLine y={row.avgPricePLN} stroke={chrome.muted} strokeDasharray="4 4" label={{ value: 'śr. cena zakupu', fill: chrome.muted, fontSize: 10, position: 'insideBottomRight' }} />}
                <Line type="monotone" dataKey="price" name="Cena (PLN)" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-stone-500">Ceny w PLN (historia z Yahoo lub rekonstrukcja z transakcji i migawek). Linia przerywana – średnia cena zakupu.</p>
        </div>
      )}
    </Modal>
  );
}

function Mini({ label, value }) {
  return (
    <div className="min-w-0 rounded-lg bg-stone-50 px-3 py-2 dark:bg-white/[0.03]">
      <div className="truncate text-[11px] text-stone-500">{label}</div>
      <div className="truncate text-sm font-semibold tabular">{value}</div>
    </div>
  );
}
