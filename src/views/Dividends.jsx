import { DividendCalendar, DividendKpis, RemindersCard } from '../components/dividends/DividendWidgets.jsx';
import { CompanyEventsCard, ForecastCard, ScheduleCard } from '../components/dividends/DividendManagement.jsx';

export default function DividendsView() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <DividendKpis />
      <div className="grid items-start gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <DividendCalendar />
        <RemindersCard />
      </div>
      <ForecastCard />
      <ScheduleCard />
      <CompanyEventsCard />
    </div>
  );
}
