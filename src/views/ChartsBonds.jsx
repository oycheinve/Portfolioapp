import { useMemo } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { isoDay, livePriceLookup, valuePortfolio } from '../lib/engine.js';
import ChartsCenter from '../components/charts/ChartsCenter.jsx';
import HeatmapCard from '../components/dashboard/HeatmapCard.jsx';

// Wykresy: zaawansowane wykresy historyczne z benchmarkami oraz mapa cieplna dnia
export default function ChartsView() {
  const { state } = useApp();
  const valuation = useMemo(() => valuePortfolio(state, { asOf: isoDay(new Date()), accountIds: null, priceLookup: livePriceLookup(state) }), [state]);
  return (
    <div className="space-y-4 sm:space-y-6">
      <ChartsCenter />
      <HeatmapCard valuation={valuation} />
    </div>
  );
}
