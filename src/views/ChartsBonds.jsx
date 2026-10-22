import ChartsCenter from '../components/charts/ChartsCenter.jsx';

// Wykresy: wybór z listy (portfel, dywidendy, rynek, podsumowania roku i lat kalendarzowych), aktywa i benchmarki
export default function ChartsView({ param }) {
  return <ChartsCenter param={param} />;
}
