import { CalendarDays, ListChecks, TrendingUp } from 'lucide-react';
import { DividendCalendar, DividendKpis, RemindersCard } from '../components/dividends/DividendWidgets.jsx';
import { ForecastCard, ScheduleCard } from '../components/dividends/DividendManagement.jsx';
import DividendSyncCard from '../components/dividends/DividendSyncCard.jsx';
import { Accordion } from '../components/ui.jsx';

// Dywidendy: synchronizacja (działa przy otwarciu) i kafelki na górze, reszta w zwijanych sekcjach (krótka strona)
const ITEMS = [
  {
    id: 'calendar',
    title: 'Kalendarz i przypomnienia',
    subtitle: '12 miesięcy wypłat oraz najbliższe daty odcięcia',
    icon: CalendarDays,
    render: () => (
      <div className="grid items-start gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <DividendCalendar />
        <RemindersCard />
      </div>
    ),
  },
  { id: 'register', title: 'Rejestr wypłat', subtitle: 'Harmonogram dywidend, statusy i księgowanie wypłat', icon: ListChecks, render: () => <ScheduleCard /> },
  { id: 'forecast', title: 'Prognoza DGR', subtitle: 'Wzrost dywidend i reinwestycja (DRIP)', icon: TrendingUp, render: () => <ForecastCard /> },
];

export default function DividendsView() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <DividendSyncCard />
      <DividendKpis />
      <Accordion items={ITEMS} storageKey="wealth-app-dividends-open" defaultOpen={['calendar']} />
    </div>
  );
}
