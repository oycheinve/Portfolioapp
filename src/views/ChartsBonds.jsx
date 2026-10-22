import ChartsCenter from '../components/charts/ChartsCenter.jsx';
import StatsSummaries from './Stats.jsx';

// Wykresy: wybór wykresu z listy (portfel, dywidendy, mapa cieplna, notowania), aktywa i benchmarki,
// a pod nimi podsumowania (rok i miesiące, lata kalendarzowe, Prawdziwy Zysk – dawna zakładka Statystyki)
export default function ChartsView({ param }) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <ChartsCenter param={param} />
      <StatsSummaries />
    </div>
  );
}
