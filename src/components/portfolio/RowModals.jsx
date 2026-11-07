import { useMemo, useState } from 'react';
import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../../state/AppContext.jsx';
import { incomeEventsWithTax, isoDay, isSyntheticDeposit } from '../../lib/engine.js';
import { STATUS_META, evaluateScheduleItem } from '../../lib/dividends.js';
import { createPriceResolver } from '../../lib/history.js';
import { chartChrome, seriesColor } from '../../lib/colors.js';
import { formatDate, formatPLN, formatPercent } from '../../lib/format.js';
import { Badge, Button, Field, Input, Modal, Segmented, Select } from '../ui.jsx';

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
  { value: 'all', label: 'Wszystko' },
];
const BUY = '#16a34a';
const SELL = '#dc2626';
const fmtQty = (q) => (Number(q) || 0).toLocaleString('pl-PL', { maximumFractionDigits: 4 });

// Transakcje waloru (wszystkie konta) zgrupowane per dzień i stronę: ilość, średnia cena jednostkowa w PLN, szczegóły
function tradeMarkers(state, instrumentId) {
  const acc = Object.fromEntries(state.accounts.map((a) => [a.id, a]));
  const byKey = new Map();
  for (const t of state.trades) {
    if (t.instrumentId !== instrumentId || !t.date) continue;
    const side = t.side === 'SELL' ? 'sell' : 'buy';
    const qty = Number(t.quantity) || 0;
    const unit = (Number(t.price) || 0) * (Number(t.fxRate) || 1);
    if (!(qty > 0) || !(unit > 0)) continue;
    const key = `${t.date}|${side}`;
    const m = byKey.get(key) || { date: t.date, side, qty: 0, value: 0, items: [] };
    m.qty += qty;
    m.value += qty * unit;
    m.items.push({ qty, unit, account: acc[t.accountId]?.name || '', imported: isSyntheticDeposit(t) || /OPEN/i.test(String(t.source || '')) });
    byKey.set(key, m);
  }
  return [...byKey.values()].map((m) => ({ ...m, price: m.value / m.qty })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

function MarkerDetails({ m }) {
  return (
    <div className="space-y-0.5">
      <div className={`font-semibold ${m.side === 'buy' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
        {m.side === 'buy' ? '● Zakup' : '● Sprzedaż'} · {formatDate(m.date)}
      </div>
      <div className="tabular">
        {fmtQty(m.qty)} szt. × {formatPLN(m.price)} = <strong>{formatPLN(m.value)}</strong>
      </div>
      {m.items.length > 1 && <div className="text-[11px] text-stone-500 dark:text-stone-400">{m.items.length} transakcje tego dnia – cena średnia</div>}
      {[...new Set(m.items.map((i) => i.account).filter(Boolean))].length > 0 && <div className="text-[11px] text-stone-500 dark:text-stone-400">konto: {[...new Set(m.items.map((i) => i.account).filter(Boolean))].join(', ')}</div>}
      {m.items.some((i) => i.imported) && <div className="text-[11px] text-amber-700 dark:text-amber-400">pozycja z importu (data importu, cena średnia)</div>}
    </div>
  );
}

// Dymek: cena z dnia + szczegóły transakcji, gdy w tym dniu był zakup / sprzedaż
function PriceTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="max-w-[16rem] rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-white/10 dark:bg-neutral-900">
      <div className="font-medium">{formatDate(p.date)}</div>
      {Number.isFinite(p.price) && <div className="tabular text-stone-600 dark:text-stone-300">Kurs: {formatPLN(p.price)}</div>}
      {p.buyM && (
        <div className="mt-1.5">
          <MarkerDetails m={p.buyM} />
        </div>
      )}
      {p.sellM && (
        <div className="mt-1.5">
          <MarkerDetails m={p.sellM} />
        </div>
      )}
    </div>
  );
}

// Wykres ceny waloru (PLN) z linią średniej ceny zakupu i znacznikami transakcji (zielone – zakup, czerwone – sprzedaż)
export function PriceChartModal({ row, onClose }) {
  const { state, isDark } = useApp();
  const [days, setDays] = useState(365);
  const [picked, setPicked] = useState(null);
  const chrome = chartChrome(isDark);
  const inst = row ? state.instruments.find((i) => i.id === row.instrumentId) : null;
  const markers = useMemo(() => (inst ? tradeMarkers(state, inst.id) : []), [state, inst]);
  const span = useMemo(() => {
    if (days !== 'all') return days;
    const first = markers[0]?.date;
    return first ? Math.max(30, Math.ceil((Date.now() - new Date(`${first}T12:00:00`).getTime()) / 86400000) + 7) : 365 * 3;
  }, [days, markers]);
  const data = useMemo(() => {
    if (!inst) return [];
    const resolver = createPriceResolver(state);
    const from = isoDay(new Date(Date.now() - span * 86400000));
    const step = span <= 90 ? 1 : span <= 365 ? 3 : span <= 365 * 3 ? 7 : 14;
    const dates = new Set();
    for (let d = span; d >= 0; d -= step) dates.add(isoDay(new Date(Date.now() - d * 86400000)));
    for (const m of markers) if (m.date >= from) dates.add(m.date); // dni transakcji zawsze na osi
    const today = isoDay(new Date());
    const out = [...dates]
      .sort()
      .map((iso) => {
        const v = resolver.instrumentPLN(inst, iso);
        return { date: iso, price: Number.isFinite(v) ? Math.round(v * 100) / 100 : null };
      })
      .filter((p) => p.price !== null || markers.some((m) => m.date === p.date));
    if (row.currentPricePLN) {
      const last = out.find((p) => p.date === today);
      if (last) last.price = Math.round(row.currentPricePLN * 100) / 100;
      else out.push({ date: today, price: Math.round(row.currentPricePLN * 100) / 100 });
    }
    for (const p of out) {
      const b = markers.find((m) => m.date === p.date && m.side === 'buy');
      const s = markers.find((m) => m.date === p.date && m.side === 'sell');
      if (b) Object.assign(p, { buy: Math.round(b.price * 100) / 100, buyM: b });
      if (s) Object.assign(p, { sell: Math.round(s.price * 100) / 100, sellM: s });
    }
    return out;
  }, [state, inst, span, row, markers]);
  const priced = data.filter((p) => Number.isFinite(p.price));
  const first = priced[0]?.price;
  const last = priced[priced.length - 1]?.price;
  const color = last >= first ? seriesColor(0, isDark) : seriesColor(7, isDark);
  const inRange = markers.filter((m) => data.some((p) => p.date === m.date));
  const nBuy = inRange.filter((m) => m.side === 'buy').reduce((s, m) => s + m.items.length, 0);
  const nSell = inRange.filter((m) => m.side === 'sell').reduce((s, m) => s + m.items.length, 0);
  const dot = (fill) => (props) => {
    const { cx, cy, payload } = props;
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
    const m = fill === BUY ? payload.buyM : payload.sellM;
    return <circle cx={cx} cy={cy} r={m?.items.length > 1 ? 6.5 : 5} fill={fill} stroke={chrome.surface} strokeWidth={1.5} style={{ cursor: 'pointer' }} onClick={() => setPicked(m)} aria-label={`${fill === BUY ? 'Zakup' : 'Sprzedaż'} ${payload.date}`} />;
  };
  return (
    <Modal
      open={!!row}
      onClose={() => {
        setPicked(null);
        onClose();
      }}
      title={`Notowania: ${row?.name || ''}`}
    >
      {row && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented
              size="sm"
              value={days}
              onChange={(v) => {
                setDays(v);
                setPicked(null);
              }}
              options={RANGES}
              ariaLabel="Zakres"
            />
            <span className="text-sm tabular">
              {formatPLN(last)}{' '}
              {first > 0 && <span className={last >= first ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>({formatPercent(last / first - 1, { sign: true })})</span>}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-stone-600 dark:text-stone-300" aria-label="Legenda wykresu">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: color }} /> Kurs (PLN)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: BUY }} /> Zakup ({nBuy})
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: SELL }} /> Sprzedaż ({nSell})
            </span>
            {row.avgPricePLN > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 border-t border-dashed" style={{ borderColor: chrome.muted }} /> Śr. cena zakupu
              </span>
            )}
          </div>
          <div className="h-64" aria-label="Wykres notowań z transakcjami">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={chrome.grid} vertical={false} />
                <XAxis dataKey="date" tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: chrome.axis }} minTickGap={40} tickFormatter={(d) => new Date(d).toLocaleDateString('pl-PL', { month: 'short', year: '2-digit' })} />
                <YAxis domain={['auto', 'auto']} tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                <Tooltip content={<PriceTooltip />} />
                {row.avgPricePLN > 0 && <ReferenceLine y={row.avgPricePLN} stroke={chrome.muted} strokeDasharray="4 4" label={{ value: 'śr. cena zakupu', fill: chrome.muted, fontSize: 10, position: 'insideBottomRight' }} />}
                <Line type="monotone" dataKey="price" name="Cena (PLN)" stroke={color} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                <Scatter dataKey="buy" name="Zakup" fill={BUY} shape={dot(BUY)} isAnimationActive={false} />
                <Scatter dataKey="sell" name="Sprzedaż" fill={SELL} shape={dot(SELL)} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {picked && (
            <div className="flex items-start justify-between gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/[0.03]" aria-label="Szczegóły transakcji">
              <MarkerDetails m={picked} />
              <button type="button" onClick={() => setPicked(null)} className="text-stone-400 hover:text-stone-600" aria-label="Zamknij szczegóły">
                ✕
              </button>
            </div>
          )}
          <p className="text-[11px] text-stone-500">
            Ceny w PLN (historia z Yahoo lub rekonstrukcja z transakcji i migawek). Kropki – Twoje transakcje w dniu i po cenie wykonania (wszystkie konta; kilka tego samego dnia – cena średnia, większa kropka); najedź albo dotknij, aby zobaczyć szczegóły. Linia przerywana – średnia cena zakupu.
          </p>
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
