import { useMemo } from 'react';
import { Briefcase, ChevronRight, Wallet } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { isoDay, livePriceLookup, netFlows, valuePortfolio } from '../lib/engine.js';
import { ACCOUNT_TYPES } from '../lib/constants.js';
import { formatPLN, formatPercent, signClass } from '../lib/format.js';
import { Badge, Button, Card, EmptyState } from '../components/ui.jsx';
import NetWorthPanel from '../components/dashboard/NetWorthPanel.jsx';
import QuickStatsPanel from '../components/dashboard/QuickStatsPanel.jsx';

// Pulpit (minimalistyczny): majątek całkowity ze strukturą oraz podsumowanie kont
export default function Dashboard({ onNavigate }) {
  const { state, actions } = useApp();
  const valuation = useMemo(
    () => valuePortfolio(state, { asOf: isoDay(new Date()), accountIds: null, priceLookup: livePriceLookup(state) }),
    [state],
  );

  if (state.accounts.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Wallet}
          title="Zacznij od dodania konta"
          description="Utwórz konta IKE, IKZE, maklerskie lub oszczędnościowe w ustawieniach albo wczytaj dane demonstracyjne."
          action={
            <div className="mt-3 flex gap-2">
              <Button variant="primary" onClick={() => onNavigate('settings')}>
                Dodaj konto
              </Button>
              <Button onClick={actions.loadDemo}>Wczytaj demo</Button>
            </div>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <QuickStatsPanel />
      <NetWorthPanel valuation={valuation} compact />
      <AccountsSummary valuation={valuation} onNavigate={onNavigate} />
    </div>
  );
}

function AccountsSummary({ valuation, onNavigate }) {
  const { state } = useApp();
  const today = isoDay(new Date());
  const rows = state.accounts.map((a) => {
    const v = valuation.byAccount[a.id] || { total: 0, cash: 0, stocks: 0, etf: 0, bonds: 0 };
    const contrib = netFlows(state, [a.id], null, today);
    const gain = v.total - contrib;
    return { account: a, v, contrib, gain, pct: contrib > 0 ? gain / contrib : 0 };
  });
  const total = rows.reduce((s, r) => s + r.v.total, 0);
  return (
    <Card
      title="Konta"
      subtitle="Wartość, wkład netto i zysk prosty na koncie"
      icon={Briefcase}
      actions={
        <Button size="sm" variant="ghost" onClick={() => onNavigate('portfolio')}>
          Szczegóły portfela <ChevronRight size={14} />
        </Button>
      }
      bodyClassName="p-0 sm:p-0"
    >
      <ul className="divide-y divide-stone-100 dark:divide-white/5">
        {rows.map((r) => (
          <li key={r.account.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: ACCOUNT_TYPES[r.account.type]?.color }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{r.account.name}</span>
                <Badge>{ACCOUNT_TYPES[r.account.type]?.label}</Badge>
              </div>
              <div className="truncate text-xs text-stone-500 dark:text-stone-400">
                Wkład {formatPLN(r.contrib)} · gotówka {formatPLN(r.v.cash)}
                {r.v.bonds > 0 && ` · obligacje ${formatPLN(r.v.bonds)}`}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold tabular">{formatPLN(r.v.total)}</div>
              <div className={`text-xs tabular ${signClass(r.gain)}`}>
                {formatPLN(r.gain, { sign: true })} ({formatPercent(r.pct, { sign: true, digits: 1 })})
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex justify-between border-t border-stone-100 px-4 py-3 text-sm sm:px-5 dark:border-white/5">
        <span className="text-stone-500">Razem</span>
        <span className="font-semibold tabular">{formatPLN(total)}</span>
      </div>
    </Card>
  );
}
