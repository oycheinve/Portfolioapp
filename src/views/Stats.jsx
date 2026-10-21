import PortfolioStatsCard from '../components/dashboard/PortfolioStatsCard.jsx';
import Summaries from '../components/reports/Summaries.jsx';

// Statystyki: Prawdziwy Zysk i wskaźniki (TWR, CAGR, TER, limity) + podsumowania miesięczne i roczne
export default function StatsView() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <PortfolioStatsCard />
      <Summaries />
    </div>
  );
}
