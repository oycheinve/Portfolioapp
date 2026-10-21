import { useMemo } from 'react';
import { BarChart3, Briefcase, ChevronRight, Coins, Flame, LineChart, PiggyBank, Radio, Shield, Table2, TrendingUp, Wallet } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { computeLimitUsage, computePeriodStats, isoDay, livePriceLookup, netFlows, valuePortfolio } from '../lib/engine.js';
import { dividendKpis } from '../lib/dividends.js';
import { ACCOUNT_TYPES } from '../lib/constants.js';
import { formatPLN, formatPercent, signClass } from '../lib/format.js';
import { Badge, Button, Card, EmptyState } from '../components/ui.jsx';
import NetWorthPanel from '../components/dashboard/NetWorthPanel.jsx';

// Pulpit (minimalistyczny): majątek całkowity + struktura, najważniejsze wskaźniki, konta i szybki dostęp
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
      <NetWorthPanel valuation={valuation} compact />
      <KeyIndicators onNavigate={onNavigate} />
      <AccountsSummary valuation={valuation} onNavigate={onNavigate} />
      <QuickLinks onNavigate={onNavigate} />
    </div>
  );
}

function KeyIndicators({ onNavigate }) {
  const { state } = useApp();
  const all = useMemo(() => computePeriodStats(state, { period: 'ALL' }), [state]);
  const ytd = useMemo(() => computePeriodStats(state, { period: 'YTD' }), [state]);
  const div = useMemo(() => dividendKpis(state), [state]);
  const ike = useMemo(() => computeLimitUsage(state).find((u) => u.account.type === 'IKE' && u.limit > 0), [state]);
  const profitPct = all.contributionsAll > 0 ? all.totalReturn / all.contributionsAll : 0;

  const tiles = [
    { label: 'Zysk Total', value: formatPLN(all.totalReturn, { sign: true }), sub: `${formatPercent(profitPct, { sign: true })} od wkładu ${formatPLN(all.contributionsAll, { compact: true })}`, tone: signClass(all.totalReturn), to: 'stats', icon: TrendingUp },
    { label: `Wynik ${new Date().getFullYear()} (YTD)`, value: formatPLN(ytd.totalReturn, { sign: true }), sub: `TWR ${formatPercent(ytd.twr, { sign: true })}`, tone: signClass(ytd.totalReturn), to: 'stats', icon: BarChart3 },
    { label: 'CAGR', value: formatPercent(all.cagr, { sign: true }), sub: `TWR całkowity ${formatPercent(all.twr, { sign: true })}`, tone: signClass(all.cagr), to: 'stats', icon: LineChart },
    { label: 'Dywidendy YTD (netto)', value: formatPLN(div.ytdNet), sub: `stopa portfela ${formatPercent(div.yield)}`, to: 'dividends', icon: Coins },
    {
      label: ike ? `Limit IKE ${ike.year}` : 'Ważony TER',
      value: ike ? formatPercent(ike.usage, { digits: 0 }) : formatPercent(all.terWeighted, { digits: 3 }),
      sub: ike ? `zostało ${formatPLN(ike.remaining)}` : `${formatPLN(all.terAnnualCost)} / rok`,
      to: ike ? 'settings' : 'allocation',
      icon: PiggyBank,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {tiles.map((t) => {
        const Icon = t.icon;
        return (
          <button
            key={t.label}
            type="button"
            onClick={() => onNavigate(t.to)}
            className="group min-w-0 rounded-2xl border border-stone-200 bg-white p-3 text-left shadow-sm transition hover:border-blue-300 sm:p-4 dark:border-white/10 dark:bg-neutral-900 dark:hover:border-blue-500/40"
          >
            <div className="flex items-center gap-1.5 text-[11px] text-stone-500 sm:text-xs dark:text-stone-400">
              <Icon size={14} className="shrink-0" />
              <span className="truncate">{t.label}</span>
              <ChevronRight size={14} className="ml-auto shrink-0 opacity-0 transition group-hover:opacity-100" />
            </div>
            <div className={`mt-1 truncate text-lg font-semibold tabular ${t.tone || ''}`}>{t.value}</div>
            <div className="truncate text-[11px] text-stone-500 dark:text-stone-500">{t.sub}</div>
          </button>
        );
      })}
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

const LINKS = [
  { to: 'portfolio', label: 'Portfel', icon: Table2 },
  { to: 'stats', label: 'Statystyki', icon: BarChart3 },
  { to: 'charts', label: 'Wykresy', icon: LineChart },
  { to: 'safe', label: 'Kapitał bezpieczny', icon: Shield },
  { to: 'quotes', label: 'Notowania', icon: Radio },
  { to: 'fire', label: 'FIRE', icon: Flame },
];

function QuickLinks({ onNavigate }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {LINKS.map((l) => {
        const Icon = l.icon;
        return (
          <button
            key={l.to}
            type="button"
            onClick={() => onNavigate(l.to)}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-2 py-3 text-xs font-medium text-stone-700 transition hover:border-blue-300 hover:text-blue-700 dark:border-white/10 dark:bg-neutral-900 dark:text-stone-300 dark:hover:text-blue-300"
          >
            <Icon size={18} />
            <span className="text-center leading-tight">{l.label}</span>
          </button>
        );
      })}
    </div>
  );
}
