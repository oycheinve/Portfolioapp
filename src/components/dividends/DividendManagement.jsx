import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BookCheck, CalendarClock, Megaphone, Pencil, Plus, Trash2, TrendingUp } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { bookingEntries, dividendPositions, evaluateScheduleItem, projectDividends } from '../../lib/dividends.js';
import { chartChrome, seriesColor } from '../../lib/colors.js';
import { formatAxisPLN, formatDate, formatNumber, formatPLN, formatPercent, todayISO } from '../../lib/format.js';
import { SUPPORTED_CURRENCIES } from '../../lib/constants.js';
import { Badge, Button, Card, ChartTooltip, EmptyState, Field, IconButton, Input, Modal, Segmented, Select, Slider, Toggle } from '../ui.jsx';
import { Legend } from '../charts/chartUtils.jsx';
import { CalendarButtons, StatusBadge } from './DividendWidgets.jsx';

const EVENT_LABELS = ['Raport kwartalny', 'Raport roczny', 'Walne Zgromadzenie (WZA)', 'Dzień dywidendy', 'Wypłata dywidendy', 'Inne'];

// Ogłoszone dywidendy: dodawanie, statusy, księgowanie wypłat do rejestru przychodów
export function ScheduleCard() {
  const { state, actions } = useApp();
  const [form, setForm] = useState(null);
  const today = todayISO();
  const rows = useMemo(
    () =>
      state.dividendSchedule
        .map((item) => ({ item, ev: evaluateScheduleItem(state, item, today) }))
        .sort((a, b) => (a.item.estimated === b.item.estimated ? ((a.item.exDate || '') < (b.item.exDate || '') ? 1 : -1) : a.item.estimated ? 1 : -1)),
    [state, today],
  );
  const held = state.instruments;
  const autoBook = state.settings.dividendPrefs?.autoBook !== false;

  const book = (item) => {
    const entries = bookingEntries(state, item);
    if (entries.length === 0) {
      actions.notify('Brak akcji na koncie w Dniu Dywidendy – nic do zaksięgowania', 'warn');
      return;
    }
    actions.addMany('income', entries);
    actions.upsert('dividendSchedule', { ...item, bookedAt: new Date().toISOString(), incomeIds: entries.map((e) => e.id) });
    actions.notify(`Zaksięgowano dywidendę ${formatPLN(entries.reduce((s, e) => s + e.gross, 0))} brutto`, 'success');
  };

  const save = () => {
    const item = {
      ...form,
      estimated: false,
      source: form.source || 'MANUAL',
      dps: Number(String(form.dps).replace(',', '.')) || 0,
      withholdingPct: Number(form.withholdingPct) || 0,
    };
    actions.upsert('dividendSchedule', item);
    setForm(null);
  };

  const newItem = () => {
    const inst = held[0];
    setForm({ instrumentId: inst?.id || '', dps: '', currency: inst?.currency || 'PLN', exDate: today, payDate: today, withholdingPct: 0, note: '' });
  };

  return (
    <Card
      title="Harmonogram dywidend"
      subtitle="Uzupełniany automatycznie (Yahoo / historia wypłat) · ręczne wpisy opcjonalne · księgowanie do rejestru"
      icon={Megaphone}
      actions={
        <Button variant="primary" size="sm" icon={Plus} onClick={newItem} disabled={held.length === 0}>
          Dodaj
        </Button>
      }
      bodyClassName="p-0 sm:p-0"
    >
      {rows.length === 0 ? (
        <EmptyState icon={Megaphone} title="Brak ogłoszonych dywidend" />
      ) : (
        <ul className="divide-y divide-stone-100 dark:divide-white/5">
          {rows.map(({ item, ev }) => (
            <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1 basis-48">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{ev.instrument?.ticker || '—'}</span>
                  <StatusBadge status={ev.status} />
                  <Badge tone={item.source === 'YAHOO' ? 'blue' : item.source === 'HISTORY' ? 'violet' : 'neutral'}>
                    {item.source === 'YAHOO' ? 'Yahoo' : item.source === 'HISTORY' ? 'z historii' : 'ręcznie'}
                  </Badge>
                </div>
                <div className="text-xs text-stone-500 tabular dark:text-stone-400">
                  {formatNumber(Number(item.dps), 4)} {item.currency} / akcję · Ex {formatDate(item.exDate)} · wypłata {formatDate(item.payDate)}
                </div>
                {item.note && <div className="truncate text-[11px] text-stone-500">{item.note}</div>}
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold tabular">{formatPLN(ev.net)}</div>
                <div className="text-[11px] text-stone-500 tabular">
                  {formatNumber(ev.shares, 4)} szt. · brutto {formatPLN(ev.gross)}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {ev.paired && <Badge tone="green">sparowana z rejestrem</Badge>}
                {item.autoBooked && !ev.paired && <Badge tone="green">zaksięgowana auto</Badge>}
                {ev.status === 'PENDING' && autoBook && <Badge>księgowanie auto po {formatDate(item.payDate)}</Badge>}
                {ev.status === 'PENDING' && !autoBook && (
                  <Button size="sm" icon={BookCheck} onClick={() => book(item)} title="Dodaj wypłatę do rejestru przychodów">
                    Zaksięguj
                  </Button>
                )}
                <IconButton icon={Pencil} label="Edytuj" onClick={() => setForm({ ...item })} />
                <IconButton icon={Trash2} label="Usuń" onClick={() => actions.remove('dividendSchedule', item.id)} className="hover:text-red-600" />
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="px-4 py-2.5 text-[11px] text-stone-500 sm:px-5 dark:text-stone-500">
        Liczba akcji na każdym koncie liczona na sesję przed Dniem Dywidendy (stan historyczny – akcje sprzedane wcześniej nie dostają dywidendy). Wypłaty z importu XTB są parowane automatycznie, a pozostałe księgowane same po dniu wypłaty; podatek Belki (lub 0% na IKE/IKZE) i podatek u źródła liczą się automatycznie.
      </p>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? 'Edytuj dywidendę' : 'Nowa ogłoszona dywidenda'}
        footer={
          <>
            <Button onClick={() => setForm(null)}>Anuluj</Button>
            <Button variant="primary" onClick={save} disabled={!form?.instrumentId || !(Number(String(form?.dps).replace(',', '.')) > 0) || !form?.exDate}>
              Zapisz
            </Button>
          </>
        }
      >
        {form && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Spółka / ETF" className="col-span-2">
              <Select
                value={form.instrumentId}
                onChange={(e) => {
                  const inst = held.find((i) => i.id === e.target.value);
                  setForm({ ...form, instrumentId: e.target.value, currency: inst?.currency || form.currency });
                }}
              >
                {held.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.ticker} – {i.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Dywidenda na akcję (DPS)">
              <Input type="number" step="0.0001" min="0" inputMode="decimal" value={form.dps} onChange={(e) => setForm({ ...form, dps: e.target.value })} autoFocus />
            </Field>
            <Field label="Waluta">
              <Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Dzień dywidendy (Ex-Date)">
              <Input type="date" value={form.exDate} onChange={(e) => setForm({ ...form, exDate: e.target.value })} />
            </Field>
            <Field label="Dzień wypłaty">
              <Input type="date" value={form.payDate} onChange={(e) => setForm({ ...form, payDate: e.target.value })} />
            </Field>
            <Field label="Podatek u źródła (%)" hint="np. 15% dla spółek z USA (W-8BEN)">
              <Input type="number" step="1" min="0" max="50" value={form.withholdingPct} onChange={(e) => setForm({ ...form, withholdingPct: e.target.value })} />
            </Field>
            <Field label="Notatka">
              <Input value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>
    </Card>
  );
}

// Prognoza dywidend: DPS × sztuki, suwak DGR, DRIP, wykres 5–10 lat
export function ForecastCard() {
  const { state, actions, isDark } = useApp();
  const prefs = state.settings.dividendPrefs;
  const setPrefs = (patch) => actions.updateSettings({ dividendPrefs: { ...prefs, ...patch } });
  const chrome = chartChrome(isDark);
  const positions = useMemo(() => dividendPositions(state), [state]);
  const payers = positions.filter((p) => p.dpsPLN > 0 || p.instrument.kind === 'STOCK');
  const projection = useMemo(() => projectDividends(positions, { years: prefs.years, dgr: prefs.dgr / 100, drip: prefs.drip }), [positions, prefs]);
  const first = projection[0];
  const last = projection[projection.length - 1];

  // Agregacja pozycji per instrument do tabeli
  const byInstrument = useMemo(() => {
    const map = new Map();
    for (const p of payers) {
      const row = map.get(p.instrumentId) || { instrument: p.instrument, quantity: 0, value: 0, gross: 0, net: 0, dps: p.dps, dpsPLN: p.dpsPLN, source: p.dpsSource };
      row.quantity += p.quantity;
      row.value += p.value;
      row.gross += p.annualGross;
      row.net += p.annualNet;
      map.set(p.instrumentId, row);
    }
    return [...map.values()].sort((a, b) => b.net - a.net);
  }, [payers]);

  const setDps = (inst, value) => {
    const dividend = { ...(inst.dividend || {}) };
    if (value === '') delete dividend.dps;
    else dividend.dps = Number(value);
    actions.upsert('instruments', { ...inst, dividend });
  };

  const sel = seriesColor(4, isDark);
  const alt = seriesColor(0, isDark);

  return (
    <Card title="Prognoza dywidend" subtitle="Ostatni roczny DPS × liczba akcji, wzrost dywidendy (DGR) i reinwestycja (DRIP)" icon={TrendingUp}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Slider label="Wzrost dywidendy (DGR)" value={prefs.dgr} onChange={(v) => setPrefs({ dgr: v })} min={0} max={15} step={0.5} format={(v) => `${formatNumber(v, 1)}% / rok`} accent={sel} />
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-stone-600 dark:text-stone-400">Horyzont</div>
            <Segmented
              value={String(prefs.years)}
              onChange={(v) => setPrefs({ years: Number(v) })}
              ariaLabel="Horyzont prognozy"
              options={[
                { value: '5', label: '5 lat' },
                { value: '10', label: '10 lat' },
              ]}
            />
          </div>
          <Toggle checked={!!prefs.drip} onChange={(v) => setPrefs({ drip: v })} label="Reinwestycja dywidend (DRIP)" description="Dywidenda netto kupuje kolejne akcje tej samej spółki" />
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-stone-50 px-3 py-2 dark:bg-white/[0.03]">
              <div className="text-[11px] text-stone-500">Rok {first?.year}</div>
              <div className="text-sm font-semibold tabular">{formatPLN(first?.selected)}</div>
              <div className="text-[11px] text-stone-500 tabular">{formatPLN(first?.monthly)}/mies.</div>
            </div>
            <div className="rounded-lg bg-stone-50 px-3 py-2 dark:bg-white/[0.03]">
              <div className="text-[11px] text-stone-500">Rok {last?.year}</div>
              <div className="text-sm font-semibold tabular text-emerald-700 dark:text-emerald-400">{formatPLN(last?.selected)}</div>
              <div className="text-[11px] text-stone-500 tabular">{formatPLN(last?.monthly)}/mies.</div>
            </div>
          </div>
          {last && first && first.selected > 0 && (
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Wzrost dochodu ×{formatNumber(last.selected / first.selected, 2)} w {prefs.years} lat. {prefs.drip ? `DRIP dodaje ${formatPLN(last.drip - last.noDrip)} w ostatnim roku.` : `Z DRIP byłoby ${formatPLN(last.drip)}.`}
            </p>
          )}
        </div>
        <div className="min-w-0">
          <Legend
            items={[
              { key: 's', label: prefs.drip ? 'Dywidendy netto z DRIP' : 'Dywidendy netto bez DRIP', color: sel, bar: true },
              { key: 'a', label: prefs.drip ? 'Bez DRIP' : 'Z DRIP', color: alt },
            ]}
          />
          <div className="mt-2 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={projection} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={chrome.grid} vertical={false} />
                <XAxis dataKey="year" tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: chrome.axis }} />
                <YAxis tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={60} tickFormatter={formatAxisPLN} />
                <Tooltip content={<ChartTooltip formatter={(v) => formatPLN(v)} />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="selected" name={prefs.drip ? 'Z DRIP' : 'Bez DRIP'} fill={sel} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
                <Line type="monotone" dataKey="alternative" name={prefs.drip ? 'Bez DRIP' : 'Z DRIP'} stroke={alt} strokeWidth={2} dot={{ r: 3, fill: alt, stroke: chrome.surface, strokeWidth: 2 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto rounded-xl border border-stone-100 dark:border-white/5">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-stone-100 text-left text-xs text-stone-500 dark:border-white/5 dark:text-stone-400">
              <th className="px-3 py-2 font-medium">Spółka / ETF</th>
              <th className="px-3 py-2 text-right font-medium">Sztuk</th>
              <th className="px-3 py-2 text-right font-medium">Roczny DPS</th>
              <th className="px-3 py-2 text-right font-medium">Stopa</th>
              <th className="px-3 py-2 text-right font-medium">Rocznie netto</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {byInstrument.map((r) => (
              <tr key={r.instrument.id} className="border-b border-stone-100 last:border-0 dark:border-white/5">
                <td className="px-3 py-2">
                  <div className="font-medium">{r.instrument.ticker}</div>
                  <div className="text-[11px] text-stone-500">{r.source}</div>
                </td>
                <td className="px-3 py-2 text-right">{formatNumber(r.quantity, 4)}</td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    aria-label={`Roczny DPS ${r.instrument.ticker} (${r.instrument.currency})`}
                    value={r.instrument.dividend?.dps ?? ''}
                    placeholder={formatNumber(r.dps, 2)}
                    onChange={(e) => setDps(r.instrument, e.target.value)}
                    className="h-8 w-20 rounded-md border border-stone-200 bg-white px-2 text-right text-sm outline-none focus:border-blue-500 dark:border-white/10 dark:bg-neutral-800"
                  />
                  <span className="ml-1 text-[11px] text-stone-500">{r.instrument.currency}</span>
                </td>
                <td className="px-3 py-2 text-right">{formatPercent(r.value > 0 ? r.gross / r.value : 0)}</td>
                <td className="px-3 py-2 text-right font-semibold">{formatPLN(r.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-stone-500 dark:text-stone-500">
        DPS liczony z wypłat z ostatnich 12 miesięcy (rejestr przychodów); wpisz własną wartość, aby nadpisać (puste pole = automatycznie). ETF-y akumulujące mają DPS 0.
      </p>
    </Card>
  );
}

// Daty raportów / WZA per spółka z eksportem do kalendarza
export function CompanyEventsCard() {
  const { state, actions } = useApp();
  const positions = useMemo(() => dividendPositions(state), [state]);
  const heldIds = new Set(positions.map((p) => p.instrumentId));
  const instruments = state.instruments.filter((i) => heldIds.has(i.id));
  const setEvent = (inst, patch) => {
    const nextEvent = { label: 'Raport kwartalny', ...(inst.dividend?.nextEvent || {}), ...patch };
    actions.upsert('instruments', { ...inst, dividend: { ...(inst.dividend || {}), nextEvent } });
  };

  return (
    <Card title="Najbliższe raporty i walne zgromadzenia" subtitle="Ustaw datę i dodaj wydarzenie do Kalendarza Google lub Apple" icon={CalendarClock} bodyClassName="p-0 sm:p-0">
      {instruments.length === 0 ? (
        <EmptyState icon={CalendarClock} title="Brak posiadanych spółek" />
      ) : (
        <ul className="divide-y divide-stone-100 dark:divide-white/5">
          {instruments.map((inst) => {
            const ev = inst.dividend?.nextEvent || {};
            const event = ev.date ? { uid: `${inst.id}-${ev.date}`, date: ev.date, title: `${inst.ticker}: ${ev.label || 'Raport kwartalny'}`, details: `${inst.name} (${inst.yahooSymbol || inst.ticker})` } : null;
            return (
              <li key={inst.id} className="grid grid-cols-2 items-end gap-2 px-4 py-3 sm:grid-cols-[8rem_minmax(0,1fr)_10rem_auto] sm:items-center sm:px-5">
                <div className="col-span-2 min-w-0 sm:col-span-1">
                  <div className="font-semibold">{inst.ticker}</div>
                  <div className="truncate text-[11px] text-stone-500">{inst.name}</div>
                </div>
                <Select value={ev.label || 'Raport kwartalny'} onChange={(e) => setEvent(inst, { label: e.target.value })} aria-label={`Rodzaj wydarzenia ${inst.ticker}`}>
                  {EVENT_LABELS.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </Select>
                <Input type="date" value={ev.date || ''} onChange={(e) => setEvent(inst, { date: e.target.value })} aria-label={`Data wydarzenia ${inst.ticker}`} />
                <div className="col-span-2 flex justify-end sm:col-span-1">
                  {event ? <CalendarButtons event={event} /> : <span className="text-xs text-stone-400">ustaw datę</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
