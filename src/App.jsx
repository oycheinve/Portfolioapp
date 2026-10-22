import { useEffect, useState } from 'react';
import { AppProvider } from './state/AppContext.jsx';
import AuthGate from './components/auth/AuthGate.jsx';
import { Layout, NAV_ITEMS, Toast } from './components/Layout.jsx';
import Dashboard from './views/Dashboard.jsx';
import CashRegister from './views/CashRegister.jsx';
import AllocationView from './views/Allocation.jsx';
import ChartsBondsView from './views/ChartsBonds.jsx';
import PortfolioView from './views/Portfolio.jsx';
import StatsView from './views/Stats.jsx';
import SafeCapitalView from './views/SafeCapital.jsx';
import DividendsView from './views/Dividends.jsx';
import ReportsView from './views/Reports.jsx';
import SimulationsView from './views/Simulations.jsx';
import GoalsView from './views/Goals.jsx';
import GoalsRolloverHost from './components/goals/GoalsRolloverHost.jsx';
import SettingsView from './views/Settings.jsx';
import FireGoalView from './views/FireGoal.jsx';
import BudgetView from './views/Budget.jsx';

const VIEWS = {
  dashboard: Dashboard,
  portfolio: PortfolioView,
  stats: StatsView,
  safe: SafeCapitalView,
  allocation: AllocationView,
  charts: ChartsBondsView,
  dividends: DividendsView,
  simulations: SimulationsView,
  reports: ReportsView,
  goals: GoalsView,
  cash: CashRegister,
  settings: SettingsView,
  fire: FireGoalView,
  budget: BudgetView,
};

// Stare adresy (sprzed przebudowy) prowadzą do nowych miejsc
const ALIASES = { stress: 'simulations/stress', quotes: 'charts/quotes' };

function readHash() {
  let h = window.location.hash.replace('#/', '').replace('#', '');
  if (ALIASES[h]) h = ALIASES[h];
  const [id, param = null] = h.split('/');
  return NAV_ITEMS.some((n) => n.id === id) ? { id, param } : { id: 'dashboard', param: null };
}

export default function App() {
  const [route, setRoute] = useState(readHash);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (target) => {
    const resolved = ALIASES[target] || target;
    window.location.hash = `#/${resolved}`;
    const [id, param = null] = resolved.split('/');
    setRoute({ id, param });
    window.scrollTo({ top: 0 });
  };
  const view = route.id;

  const View = VIEWS[view] || Dashboard;

  return (
    <AuthGate>
      {(cloud) => (
        <AppProvider key={cloud?.user.id || 'local'} cloud={cloud}>
          <Layout view={view} onNavigate={navigate}>
            <View key={view} onNavigate={navigate} param={route.param} />
          </Layout>
          <GoalsRolloverHost onNavigate={navigate} />
          <Toast />
        </AppProvider>
      )}
    </AuthGate>
  );
}
