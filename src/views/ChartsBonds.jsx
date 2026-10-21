import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { Segmented } from '../components/ui.jsx';
import ChartsCenter from '../components/charts/ChartsCenter.jsx';
import BondsSection from '../components/bonds/BondsSection.jsx';
import { CpiCard, PassiveIncomeCard, SavingsCards } from '../components/bonds/SavingsSection.jsx';

const TAB_KEY = 'wealth-app-charts-tab';

function readTab() {
  try {
    return localStorage.getItem(TAB_KEY) || 'charts';
  } catch {
    return 'charts';
  }
}

export default function ChartsBondsView({ onNavigate }) {
  const { state } = useApp();
  const [tab, setTab] = useState(readTab);
  const change = (t) => {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      // brak dostępu do localStorage – zakładka nie zostanie zapamiętana
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <Segmented
        value={tab}
        onChange={change}
        ariaLabel="Sekcja"
        options={[
          { value: 'charts', label: 'Centrum wykresów' },
          { value: 'bonds', label: `Obligacje i oszczędności (${state.bonds.length})` },
        ]}
      />
      {tab === 'charts' ? (
        <ChartsCenter />
      ) : (
        <>
          <BondsSection />
          <div className="grid items-start gap-4 sm:gap-6 xl:grid-cols-2">
            <SavingsCards onNavigate={onNavigate} />
            <PassiveIncomeCard />
          </div>
          <CpiCard />
        </>
      )}
    </div>
  );
}
