import ChartsCenter from '../components/charts/ChartsCenter.jsx';
import StatsSummaries from './Stats.jsx';

// Wykresy: wybór wykresu (portfel, dywidendy, mapa cieplna, notowania), aktywa i benchmarki; pod wykresem jedna
// pionowa lista – rodzaje wykresów oraz podsumowania (rok i miesiące, lata kalendarzowe)
export default function ChartsView({ param }) {
  return (
    <ChartsCenter param={param}>
      <StatsSummaries />
    </ChartsCenter>
  );
}
