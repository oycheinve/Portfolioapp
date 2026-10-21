import { useState } from 'react';
import { Calculator, Flame, FlaskConical, Zap } from 'lucide-react';
import FireView from './Fire.jsx';
import StressTestView from './StressTest.jsx';
import InvestmentCalculator from '../components/simulations/InvestmentCalculator.jsx';

export const SIMULATIONS = [
  { id: 'fire', label: 'Symulacja FIRE', description: 'Niezależność finansowa – ścieżka majątku i dochodu pasywnego', icon: Flame },
  { id: 'stress', label: 'Stress test / Co jeśli', description: 'Korekta rynków i zmiana kursów walut', icon: Zap },
  { id: 'calculator', label: 'Kalkulator inwestycyjny', description: 'Procent składany, TER i podatki wg konta', icon: Calculator },
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
      {type === 'calculator' && <InvestmentCalculator />}
    </div>
  );
}
