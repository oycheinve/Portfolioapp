import { useMemo, useState } from 'react';
import { Calculator, Droplets, Flame, FlaskConical, Landmark, Scale, Zap } from 'lucide-react';
import EtfCostCalculator from '../components/simulations/EtfCostCalculator.jsx';
import { useApp } from '../state/AppContext.jsx';
import { computeAllocation } from '../lib/allocation.js';
import ContributionCalculator from '../components/allocation/ContributionCalculator.jsx';
import FireView from './Fire.jsx';
import StressTestView from './StressTest.jsx';
import InvestmentCalculator from '../components/simulations/InvestmentCalculator.jsx';
import BondCalculator from '../components/simulations/BondCalculator.jsx';

export const SIMULATIONS = [
  { id: 'fire', label: 'Symulacja FIRE', description: 'Niezależność finansowa – ścieżka majątku i dochodu pasywnego', icon: Flame },
  { id: 'stress', label: 'Stress test / Co jeśli', description: 'Korekta rynków i zmiana kursów walut', icon: Zap },
  { id: 'topup', label: 'Kalkulator Inteligentnej Dopłaty', description: 'Plan zakupów wyrównujący wagi docelowe (z przewalutowaniem XTB 0,05%)', icon: Droplets },
  { id: 'etf', label: 'Kalkulator opłacalności ETF', description: 'TER, przewalutowanie XTB 0,05% i podatek – długoterminowy wpływ kosztów', icon: Scale },
  { id: 'calculator', label: 'Kalkulator inwestycyjny', description: 'Procent składany, TER i podatki wg konta', icon: Calculator },
  { id: 'bonds', label: 'Kalkulator obligacyjny', description: 'OTS / ROR / DOR / TOS / COI / EDO – przedterminowy wykup, horyzont w miesiącach, inflacja miesięczna', icon: Landmark },
];

const KEY = 'wealth-app-simulation';

function initial(param) {
  if (SIMULATIONS.some((s) => s.id === param)) return param;
  try {
    const v = localStorage.getItem(KEY);
    return SIMULATIONS.some((s) => s.id === v) ? v : 'fire';
  } catch {
    return 'fire';
  }
}

// Symulacje: wybór rodzaju z listy; każda ma układ dane wejściowe → wykres → wyniki
export default function SimulationsView({ param, onNavigate }) {
  const [type, setTypeState] = useState(() => initial(param));
  const setType = (id) => {
    setTypeState(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // brak localStorage – wybór nie zostanie zapamiętany
    }
    window.history.replaceState(null, '', `#/simulations/${id}`);
  };
  const current = SIMULATIONS.find((s) => s.id === type);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm sm:p-4 dark:border-white/10 dark:bg-neutral-900">
        <label className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <FlaskConical size={18} className="text-blue-600 dark:text-blue-400" /> Rodzaj symulacji
          </span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-10 min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 sm:max-w-xs dark:border-white/10 dark:bg-neutral-800"
            aria-label="Rodzaj symulacji"
          >
            {SIMULATIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <span className="w-full text-xs text-stone-500 sm:w-auto dark:text-stone-400">{current?.description}</span>
        </label>
      </div>
      {type === 'fire' && <FireView onNavigate={onNavigate} />}
      {type === 'stress' && <StressTestView onNavigate={onNavigate} />}
      {type === 'topup' && <TopUpSimulation onNavigate={onNavigate} />}
      {type === 'etf' && <EtfCostCalculator />}
      {type === 'calculator' && <InvestmentCalculator />}
      {type === 'bonds' && <BondCalculator />}
    </div>
  );
}

// Kalkulator dopłat korzysta z wag docelowych ustawionych w zakładce Alokacja
function TopUpSimulation({ onNavigate }) {
  const { state } = useApp();
  const analysis = useMemo(() => computeAllocation(state), [state]);
  return (
    <div className="space-y-3">
      <ContributionCalculator analysis={analysis} />
      <p className="text-xs text-stone-500 dark:text-stone-400">
        Wagi docelowe instrumentów ustawisz w zakładce{' '}
        <button type="button" className="font-medium text-blue-600 hover:underline dark:text-blue-400" onClick={() => onNavigate?.('allocation')}>
          Alokacja i Dopłaty
        </button>
        .
      </p>
    </div>
  );
}
