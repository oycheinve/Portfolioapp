import { useState } from 'react';
import { CalendarDays, CalendarRange, Filter, Sigma } from 'lucide-react';
import PortfolioStatsCard, { AccountFilterSelect } from '../components/dashboard/PortfolioStatsCard.jsx';
import Summaries from '../components/reports/Summaries.jsx';
import { Accordion } from '../components/ui.jsx';

const FILTER_KEY = 'wealth-app-stats-filter';

function readFilter() {
  try {
    return localStorage.getItem(FILTER_KEY) || 'INVEST';
  } catch {
    return 'INVEST';
  }
}

const FILTER_HINT = {
  ALL: 'cały majątek – z poduszką finansową',
  INVEST: 'portfel inwestycyjny – bez kont oszczędnościowych i obligacyjnych',
  SAFE: 'tylko poduszka finansowa',
};

// Statystyki: wspólny wybór konta / portfela dla wszystkich sekcji, zwijana lista statystyk
export default function StatsView() {
  const [filter, setFilterState] = useState(readFilter);
  const setFilter = (v) => {
    setFilterState(v);
    try {
      localStorage.setItem(FILTER_KEY, v);
    } catch {
      // brak localStorage – wybór nie zostanie zapamiętany
    }
  };
  const items = [
    { id: 'true-return', title: 'Prawdziwy Zysk i wskaźniki', subtitle: 'Zysk całkowity, TWR, CAGR, TER, wykorzystanie limitów', icon: Sigma, render: () => <PortfolioStatsCard filter={filter} onFilterChange={setFilter} /> },
    { id: 'year', title: 'Podsumowanie roku i miesiące', subtitle: 'Wynik roku kalendarzowego, najlepszy i najsłabszy miesiąc, tabela miesięcy', icon: CalendarDays, render: () => <Summaries parts={['year', 'months']} filter={filter} /> },
    { id: 'years', title: 'Lata kalendarzowe', subtitle: '1 stycznia – 31 grudnia każdego roku', icon: CalendarRange, render: () => <Summaries parts={['years']} filter={filter} /> },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-neutral-900">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Filter size={16} className="text-blue-600 dark:text-blue-400" /> Konto / portfel
        </span>
        <AccountFilterSelect value={filter} onChange={setFilter} />
        <span className="text-xs text-stone-500 dark:text-stone-400">{FILTER_HINT[filter] || 'wybrane konto – wszystkie sekcje liczone tylko dla niego'}</span>
      </div>
      <Accordion items={items} storageKey="wealth-app-stats-open" defaultOpen={['true-return']} />
    </div>
  );
}
