import { useMemo, useState } from 'react';
import { CalendarDays, CalendarPlus, CheckCircle2, Clock, Download, Megaphone, Sparkles, Wallet } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { STATUS_META, buildCalendar, dividendKpis } from '../../lib/dividends.js';
import { downloadIcs, googleCalendarUrl } from '../../lib/calendarExport.js';
import { formatDate, formatPLN, formatPercent } from '../../lib/format.js';
import { Badge, Card, Select } from '../ui.jsx';

const MONTH_NAMES = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

export const STATUS_ICON = { PAID: CheckCircle2, PENDING: Clock, ANNOUNCED: Megaphone, FORECAST: Sparkles };

const STATUS_CHIP = {
  PAID: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
  PENDING: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
  ANNOUNCED: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
  FORECAST: 'border-dashed border-stone-300 bg-transparent text-stone-600 dark:border-white/15 dark:text-stone-300',
};

export function DividendKpis() {
  const { state } = useApp();
  const k = useMemo(() => dividendKpis(state), [state]);
  const year = new Date().getFullYear();
  const tiles = [
    { label: `Dywidendy ${year} (netto)`, value: formatPLN(k.ytdNet), sub: `brutto ${formatPLN(k.ytdGross)}`, icon: Wallet, tone: 'text-emerald-700 dark:text-emerald-400' },
    { label: 'Średnia miesięczna', value: formatPLN(k.monthlyAvg), sub: 'suma roczna / 12', icon: CalendarDays },
    { label: 'W drodze', value: formatPLN(k.pendingNet), sub: k.pendingCount ? `${k.pendingCount} po Dniu Dywidendy, przed wypłatą` : 'brak ogłoszonych po Ex-Date', icon: Clock, tone: k.pendingNet > 0 ? 'text-amber-700 dark:text-amber-400' : '' },
    { label: 'Stopa dywidendy portfela', value: formatPercent(k.yield), sub: `YoC ${formatPercent(k.yieldOnCost)} · ${formatPLN(k.forwardNet)}/rok netto`, icon: Sparkles },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => {
        const Icon = t.icon;
        return (
          <div key={t.label} className="min-w-0 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm sm:p-4 dark:border-white/10 dark:bg-neutral-900">
            <div className="flex items-center gap-1.5 text-[11px] text-stone-500 sm:text-xs dark:text-stone-400">
              <Icon size={14} className="shrink-0" />
              <span className="truncate">{t.label}</span>
            </div>
            <div className={`mt-1 truncate text-lg font-semibold tabular sm:text-xl ${t.tone || ''}`}>{t.value}</div>
            <div className="truncate text-[11px] text-stone-500 dark:text-stone-500">{t.sub}</div>
          </div>
        );
      })}
    </div>
  );
}

export function StatusBadge({ status }) {
  const Icon = STATUS_ICON[status];
  return (
    <Badge tone={STATUS_META[status].tone}>
      <Icon size={11} /> {STATUS_META[status].label}
    </Badge>
  );
}

export function DividendCalendar() {
  const { state } = useApp();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const months = useMemo(() => buildCalendar(state, year), [state, year]);
  const total = months.reduce((s, m) => s + m.totalNet, 0);
  const years = useMemo(() => {
    const set = new Set([currentYear, currentYear + 1]);
    for (const i of state.income) if (i.type === 'DIVIDEND') set.add(Number(i.date.slice(0, 4)));
    return [...set].sort((a, b) => b - a);
  }, [state.income, currentYear]);
  const thisMonth = new Date().getMonth();

  return (
    <Card
      title="Kalendarz dywidend"
      subtitle={`Rok ${year} · razem ${formatPLN(total)} netto (wypłacone + w drodze + ogłoszone + prognoza)`}
      icon={CalendarDays}
      actions={
        <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-auto" aria-label="Rok kalendarza">
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {Object.keys(STATUS_META).map((s) => (
          <StatusBadge key={s} status={s} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 2xl:grid-cols-6">
        {months.map((m) => {
          const isNow = year === currentYear && m.month === thisMonth;
          return (
            <div
              key={m.month}
              className={`flex min-h-[7.5rem] flex-col rounded-xl border p-2.5 ${
                isNow ? 'border-blue-400 ring-1 ring-blue-400/40 dark:border-blue-400/60' : 'border-stone-200 dark:border-white/10'
              } ${m.items.length === 0 ? 'bg-stone-50/60 dark:bg-white/[0.015]' : 'bg-white dark:bg-neutral-900'}`}
            >
              <div className="flex items-baseline justify-between gap-1">
                <span className={`text-xs font-semibold ${isNow ? 'text-blue-700 dark:text-blue-300' : ''}`}>{MONTH_NAMES[m.month]}</span>
                <span className="text-[11px] font-medium tabular text-stone-500 dark:text-stone-400">{m.totalNet > 0 ? formatPLN(m.totalNet, { compact: m.totalNet >= 10000 }) : '—'}</span>
              </div>
              <ul className="mt-2 flex flex-1 flex-col gap-1">
                {m.items.map((it) => {
                  const Icon = STATUS_ICON[it.status];
                  return (
                    <li
                      key={`${it.instrumentId}-${it.date}-${it.status}`}
                      className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] ${STATUS_CHIP[it.status]}`}
                      title={`${it.ticker} · ${STATUS_META[it.status].label} · ${formatDate(it.date)}${it.exDate ? ` · Ex-Date ${formatDate(it.exDate)}` : ''} · netto ${formatPLN(it.net)}`}
                    >
                      <Icon size={11} className="shrink-0" />
                      <span className="truncate font-semibold">{it.ticker}</span>
                      <span className="ml-auto shrink-0 tabular">{Math.round(it.net)} zł</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function CalendarButtons({ event, compact = true }) {
  if (!event?.date) return null;
  return (
    <div className="flex shrink-0 items-center gap-1">
      <a
        href={googleCalendarUrl(event)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-8 items-center gap-1 rounded-lg border border-stone-200 px-2 text-xs font-medium hover:bg-stone-50 dark:border-white/10 dark:hover:bg-white/5"
        title="Dodaj do Kalendarza Google"
      >
        <CalendarPlus size={14} /> {compact ? 'Google' : 'Kalendarz Google'}
      </a>
      <button
        type="button"
        onClick={() => downloadIcs([event], `${event.title.replace(/[^\w-]+/g, '_').slice(0, 40)}.ics`)}
        className="inline-flex h-8 items-center gap-1 rounded-lg border border-stone-200 px-2 text-xs font-medium hover:bg-stone-50 dark:border-white/10 dark:hover:bg-white/5"
        title="Pobierz plik .ics (Apple / Outlook)"
      >
        <Download size={14} /> {compact ? 'Apple' : 'Apple / .ics'}
      </button>
    </div>
  );
}
