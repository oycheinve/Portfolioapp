import ChartsCenter from '../components/charts/ChartsCenter.jsx';

// Wykresy: wybór wykresu z listy (portfel, dywidendy, mapa cieplna, notowania), aktywa i benchmarki
export default function ChartsView({ param }) {
  return <ChartsCenter param={param} />;
}
