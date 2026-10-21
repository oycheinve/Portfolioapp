import { DividendCalendar, DividendKpis, RemindersCard } from '../components/dividends/DividendWidgets.jsx';
import { ForecastCard, ScheduleCard } from '../components/dividends/DividendManagement.jsx';
import DividendSyncCard from '../components/dividends/DividendSyncCard.jsx';

export default function DividendsView() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <DividendSyncCard />
      <DividendKpis />
      <div className="grid items-start gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <DividendCalendar />
        <RemindersCard />
      </div>
      <ScheduleCard />
      <ForecastCard />
    </div>
  );
}
