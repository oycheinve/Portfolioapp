import { useMemo } from 'react';
import { BarChart3, CalendarClock, CalendarDays, CloudDownload, ListChecks, TrendingUp } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { DividendCalendar, DividendKpis } from '../components/dividends/DividendWidgets.jsx';
import { ForecastCard, ScheduleCard } from '../components/dividends/DividendManagement.jsx';
import DividendSyncCard, { useDividendAutoSync } from '../components/dividends/DividendSyncCard.jsx';
import { upcomingReminders } from '../lib/dividends.js';
import { formatDate } from '../lib/format.js';
import { Accordion, Badge, Card } from '../components/ui.jsx';

// Najbliższe daty dywidendowe (odcięcie i wypłata) – zwięzła lista pod kalendarzem
function UpcomingList() {
  const { state } = useApp();
  const list = useMemo(() => upcomingReminders(state, 60).filter((r) => r.kind === 'EX' || r.kind === 'PAY'), [state]);
  return (
    <Card title="Nadchodzące daty (60 dni)" subtitle="Dni odcięcia (Ex-Date) i wypłaty dla posiadanych spółek" icon={CalendarClock} bodyClassName="p-0 sm:p-0">
      {list.length === 0 ? (
        <p className="px-4 py-4 text-sm text-stone-500 sm:px-5">Brak dat dywidendowych w najbliższych 60 dniach.</p>
      ) : (
        <ul className="divide-y divide-stone-100 dark:divide-white/5">
          {list.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <span className="w-20 shrink-0 text-xs text-stone-500 tabular">{formatDate(r.date)}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{r.title}</div>
                <div className="truncate text-xs text-stone-500 dark:text-stone-400">{r.detail}</div>
              </div>
              <Badge tone={r.kind === 'PAY' ? 'green' : 'blue'}>{r.inDays === 0 ? 'dziś' : `za ${r.inDays} dni`}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// Dywidendy: zwijana lista – rozwinięta jest jedna wybrana sekcja, strona pozostaje krótka
const ITEMS = [
  { id: 'summary', title: 'Podsumowanie', subtitle: 'Dywidendy roczne, stopa dywidendy, prognoza 12 mies.', icon: BarChart3, render: () => <DividendKpis /> },
  {
    id: 'calendar',
    title: 'Kalendarz i przypomnienia',
    subtitle: '12 miesięcy wypłat oraz najbliższe dni odcięcia i wypłaty',
    icon: CalendarDays,
    render: () => (
      <>
        <DividendCalendar />
        <UpcomingList />
      </>
    ),
  },
  { id: 'register', title: 'Rejestr wypłat', subtitle: 'Harmonogram dywidend, statusy i księgowanie wypłat', icon: ListChecks, render: () => <ScheduleCard /> },
  { id: 'forecast', title: 'Prognoza DGR', subtitle: 'Wzrost dywidend i reinwestycja (DRIP)', icon: TrendingUp, render: () => <ForecastCard /> },
  { id: 'sync', title: 'Automatyczne dane dywidend', subtitle: 'Synchronizacja dat i kwot z Yahoo / historii wypłat', icon: CloudDownload, render: () => <DividendSyncCard /> },
];

export default function DividendsView() {
  useDividendAutoSync();
  return <Accordion items={ITEMS} storageKey="wealth-app-dividends-open-v2" defaultOpen={['summary']} exclusive />;
}
