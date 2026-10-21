import { useEffect, useState } from 'react';
import { AppProvider } from './state/AppContext.jsx';
import { Layout, NAV_ITEMS, Toast } from './components/Layout.jsx';
import Dashboard from './views/Dashboard.jsx';
import CashRegister from './views/CashRegister.jsx';
import AllocationView from './views/Allocation.jsx';
import ChartsBondsView from './views/ChartsBonds.jsx';
import SettingsView from './views/Settings.jsx';

const VIEWS = {
  dashboard: Dashboard,
  allocation: AllocationView,
  charts: ChartsBondsView,
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
      <Toast />
    </AppProvider>
  );
}
