import { useEffect, useState } from 'react';
import { AppProvider } from './state/AppContext.jsx';
import { Layout, NAV_ITEMS, Toast } from './components/Layout.jsx';
import Dashboard from './views/Dashboard.jsx';
import CashRegister from './views/CashRegister.jsx';
import AllocationView from './views/Allocation.jsx';
import ChartsBondsView from './views/ChartsBonds.jsx';
import PortfolioView from './views/Portfolio.jsx';
import StatsView from './views/Stats.jsx';
import SafeCapitalView from './views/SafeCapital.jsx';
import QuotesView from './views/Quotes.jsx';
import DividendsView from './views/Dividends.jsx';
import FireView from './views/Fire.jsx';
import ReportsView from './views/Reports.jsx';
import GoalsView from './views/Goals.jsx';
import JournalView from './views/Journal.jsx';
import StressTestView from './views/StressTest.jsx';
import GoalsRolloverHost from './components/goals/GoalsRolloverHost.jsx';
import SettingsView from './views/Settings.jsx';

const VIEWS = {
  dashboard: Dashboard,
  portfolio: PortfolioView,
  stats: StatsView,
  safe: SafeCapitalView,
  quotes: QuotesView,
  allocation: AllocationView,
  charts: ChartsBondsView,
  dividends: DividendsView,
  fire: FireView,
  reports: ReportsView,
  goals: GoalsView,
  journal: JournalView,
  stress: StressTestView,
  cash: CashRegister,
  settings: SettingsView,
};

function readHash() {
  const h = window.location.hash.replace('#/', '').replace('#', '');
  return NAV_ITEMS.some((n) => n.id === h) ? h : 'dashboard';
}

export default function App() {
  const [view, setView] = useState(readHash);

  useEffect(() => {
    const onHash = () => setView(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (id) => {
    window.location.hash = `#/${id}`;
    setView(id);
    window.scrollTo({ top: 0 });
  };

  const View = VIEWS[view] || Dashboard;

  return (
    <AppProvider>
      <Layout view={view} onNavigate={navigate}>
        <View onNavigate={navigate} />
      </Layout>
      <GoalsRolloverHost onNavigate={navigate} />
      <Toast />
    </AppProvider>
  );
}
