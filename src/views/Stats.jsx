import { CalendarDays, CalendarRange, Sigma } from 'lucide-react';
import PortfolioStatsCard from '../components/dashboard/PortfolioStatsCard.jsx';
import Summaries from '../components/reports/Summaries.jsx';
import { Accordion } from '../components/ui.jsx';

// Statystyki: zwijana lista – użytkownik rozwija tylko tę statystykę, którą chce zobaczyć
const ITEMS = [
  { id: 'true-return', title: 'Prawdziwy Zysk i wskaźniki', subtitle: 'Zysk całkowity, TWR, CAGR, TER, wykorzystanie limitów', icon: Sigma, render: () => <PortfolioStatsCard /> },
  { id: 'year', title: 'Podsumowanie roku i miesiące', subtitle: 'Wynik roku kalendarzowego, najlepszy i najsłabszy miesiąc, tabela miesięcy', icon: CalendarDays, render: () => <Summaries parts={['year', 'months']} /> },
  { id: 'years', title: 'Lata kalendarzowe', subtitle: '1 stycznia – 31 grudnia każdego roku', icon: CalendarRange, render: () => <Summaries parts={['years']} /> },
];

export default function StatsView() {
  return <Accordion items={ITEMS} storageKey="wealth-app-stats-open" defaultOpen={['true-return']} />;
}
