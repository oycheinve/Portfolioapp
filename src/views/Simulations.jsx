import { useMemo, useState } from 'react';
import { Briefcase, Calculator, Droplets, Flame, Landmark, PiggyBank, Scale, Zap } from 'lucide-react';
import EtfCostCalculator from '../components/simulations/EtfCostCalculator.jsx';
import { useApp } from '../state/AppContext.jsx';
import { computeAllocation } from '../lib/allocation.js';
import ContributionCalculator from '../components/allocation/ContributionCalculator.jsx';
import FireView from './Fire.jsx';
import StressTestView from './StressTest.jsx';
import InvestmentCalculator from '../components/simulations/InvestmentCalculator.jsx';
import BondCalculator from '../components/simulations/BondCalculator.jsx';
import IkzeCalculator from '../components/simulations/IkzeCalculator.jsx';
import PpkCalculator from '../components/simulations/PpkCalculator.jsx';

export const SIMULATIONS = [
  { id: 'fire', short: 'FIRE', label: 'Symulacja FIRE', description: 'Niezależność finansowa – ścieżka majątku i dochodu pasywnego', icon: Flame },
  { id: 'stress', short: 'Stress test', label: 'Stress test / Co jeśli', description: 'Korekta rynków i zmiana kursów walut', icon: Zap },
  { id: 'topup', short: 'Dopłata', label: 'Kalkulator Inteligentnej Dopłaty', description: 'Plan zakupów wyrównujący wagi docelowe (z przewalutowaniem XTB 0,05%)', icon: Droplets },
  { id: 'etf', short: 'Koszt ETF', label: 'Kalkulator opłacalności ETF', description: 'TER, przewalutowanie XTB 0,05% i podatek – długoterminowy wpływ kosztów', icon: Scale },
  { id: 'calculator', short: 'Procent składany', label: 'Kalkulator inwestycyjny', description: 'Procent składany, TER i podatki wg konta', icon: Calculator },
  { id: 'ikze', short: 'IKZE', label: 'Kalkulator IKZE', description: 'Zwrot podatku wg zarobków i formy opodatkowania oraz wzrost kapitału w czasie', icon: PiggyBank },
  { id: 'ppk', short: 'PPK', label: 'Kalkulator PPK', description: 'Pracownicze Plany Kapitałowe – wpłaty Twoje i pracodawcy, dopłaty państwa (250 zł + 240 zł rocznie) i wzrost kapitału', icon: Briefcase },
  { id: 'bonds', short: 'Obligacje', label: 'Kalkulator obligacyjny', description: 'OTS / ROR / DOR / TOS / COI / EDO – przedterminowy wykup, horyzont w miesiącach, inflacja miesięczna', icon: Landmark },
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
    <div className="space-y-3 sm:space-y-5">
      {/* Wybór kalkulatora: kafelki z ikonami (4 w rzędzie) + opis wybranego */}
      <section className="rounded-2xl border border-stone-200 bg-white p-2 shadow-sm sm:p-3 dark:border-white/10 dark:bg-neutral-900" aria-label="Wybór symulacji">
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8" role="tablist" aria-label="Rodzaj symulacji – kafelki">
          {SIMULATIONS.map((s) => {
            const Icon = s.icon;
            const on = s.id === type;
            return (
              <button key={s.id} type="button" role="tab" aria-selected={on} onClick={() => setType(s.id)} title={s.label} className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-center transition-colors ${on ? 'bg-blue-600 text-white shadow-sm dark:bg-blue-500 dark:text-neutral-950' : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-white/5'}`}>
                <Icon size={18} />
                <span className="w-full truncate text-[10.5px] leading-tight font-semibold">{s.short}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-2 px-1">
          <span className="min-w-0 flex-1 truncate text-xs text-stone-500 dark:text-stone-400">
            <strong className="font-semibold text-stone-800 dark:text-stone-100">{current?.label}</strong> · {current?.description}
          </span>
          {/* Zgodność: lista wyboru (dostępność / dotychczasowe skróty) */}
          <select value={type} onChange={(e) => setType(e.target.value)} className="sr-only" aria-label="Rodzaj symulacji">
            {SIMULATIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </section>
      {type === 'fire' && <FireView onNavigate={onNavigate} />}
      {type === 'stress' && <StressTestView onNavigate={onNavigate} />}
      {type === 'topup' && <TopUpSimulation onNavigate={onNavigate} />}
      {type === 'etf' && <EtfCostCalculator />}
      {type === 'calculator' && <InvestmentCalculator />}
      {type === 'bonds' && <BondCalculator />}
      {type === 'ikze' && <IkzeCalculator />}
      {type === 'ppk' && <PpkCalculator />}
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
