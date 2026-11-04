import { useMemo, useState } from 'react';
import { BookCheck, CalendarClock, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { bookingEntries, canAutoBook, canBookNow, dividendPositions, evaluateScheduleItem } from '../../lib/dividends.js';
import { formatDate, formatNumber, formatPLN, todayISO } from '../../lib/format.js';
import { SUPPORTED_CURRENCIES } from '../../lib/constants.js';
import { Badge, Button, Card, EmptyState, Field, IconButton, Input, Modal, Select } from '../ui.jsx';
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
    if (!canBookNow(item, today)) {
      actions.notify(`Dywidenda jeszcze nie wypłacona (dzień wypłaty ${formatDate(item.payDate)}) – zaksięgujesz ją po otrzymaniu środków`, 'warn');
      return;
    }
    const entries = bookingEntries(state, item, today);
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
                {ev.status === 'PENDING' && autoBook && !item.payDateEstimated && !canAutoBook(item, today) && <Badge>księgowanie auto po {formatDate(item.payDate)}</Badge>}
                {ev.status === 'PENDING' && !(autoBook && !item.payDateEstimated) && !canBookNow(item, today) && <Badge>wypłata {formatDate(item.payDate)}</Badge>}
                {ev.status === 'PENDING' && !(autoBook && !item.payDateEstimated) && canBookNow(item, today) && (
                  <Button size="sm" icon={BookCheck} onClick={() => book(item)} title={item.payDateEstimated ? 'Dzień wypłaty szacowany – zaksięguj po faktycznym otrzymaniu środków' : 'Dodaj wypłatę do rejestru przychodów'}>
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
