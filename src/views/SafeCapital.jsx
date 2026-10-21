import { useMemo } from 'react';
import { Landmark, PiggyBank, Shield, Wallet } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { ACCOUNT_TYPES } from '../lib/constants.js';
import { getCpiTable, valueBond } from '../lib/bonds.js';
import { isoDay, livePriceLookup, otherAssetsValue, valuePortfolio } from '../lib/engine.js';
import { savingsProjection } from '../lib/savings.js';
import { belkaRateForAccount } from '../lib/tax.js';
import { seriesColor } from '../lib/colors.js';
import { formatPLN, formatPercent } from '../lib/format.js';
import { Card } from '../components/ui.jsx';
import BondsSection from '../components/bonds/BondsSection.jsx';
import { CpiCard, SavingsCards } from '../components/bonds/SavingsSection.jsx';

// Kapitał bezpieczny: obligacje skarbowe, konta oszczędnościowe i gotówka na rachunkach maklerskich w jednym miejscu
export default function SafeCapitalView({ onNavigate }) {
  const { state, isDark } = useApp();
  const today = isoDay(new Date());
  const data = useMemo(() => {
    const v = valuePortfolio(state, { asOf: today, accountIds: null, priceLookup: livePriceLookup(state) });
    const cpi = getCpiTable(state.settings);
    let bondsIncome = 0;
    for (const b of v.bonds) {
      const belka = belkaRateForAccount(b.account, state.settings);
      const val = valueBond(b, today, belka, cpi);
      if (!val.matured) bondsIncome += val.nominal * val.currentRate * (1 - belka);
    }
    const savingsAccounts = state.accounts.filter((a) => a.type === 'SAVINGS');
    const savingsIncome = savingsAccounts.reduce((s, a) => s + savingsProjection(state, a, today).yearlyNet, 0);
    const brokerCash = state.accounts
      .filter((a) => a.type !== 'SAVINGS')
      .map((a) => ({ account: a, cash: v.byAccount[a.id]?.cash || 0 }))
      .filter((x) => Math.abs(x.cash) >= 0.5);
    const netWorth = v.totals.total + otherAssetsValue(state).includedValue;
    const parts = [
      { key: 'bonds', label: 'Obligacje skarbowe', value: v.totals.bonds, icon: Landmark, slot: 2 },
      { key: 'savings', label: 'Konta oszczędnościowe', value: v.totals.savingsCash, icon: PiggyBank, slot: 3 },
      { key: 'broker', label: 'Gotówka na rachunkach', value: v.totals.brokerCash, icon: Wallet, slot: 0 },
    ];
    const safe = parts.reduce((s, p) => s + p.value, 0);
    return { parts, safe, share: netWorth > 0 ? safe / netWorth : 0, shareInvest: v.totals.total > 0 ? safe / v.totals.total : 0, income: bondsIncome + savingsIncome, brokerCash };
  }, [state, today]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6 dark:border-white/10 dark:bg-neutral-900">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
              <Shield size={16} /> Kapitał bezpieczny
            </div>
            <div className="mt-1 text-3xl font-semibold tracking-tight tabular">{formatPLN(data.safe)}</div>
            <div className="text-xs text-stone-500 dark:text-stone-400">
              {formatPercent(data.share, { digits: 1 })} majątku całkowitego · {formatPercent(data.shareInvest, { digits: 1 })} portfela inwestycyjnego
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-stone-500">Roczny dochód netto (obligacje + oszczędności)</div>
            <div className="text-xl font-semibold tabular text-emerald-700 dark:text-emerald-400">{formatPLN(data.income)}</div>
            <div className="text-xs text-stone-500 tabular">{formatPLN(data.income / 12)} / mies.</div>
          </div>
        </div>
        <div className="mt-4 flex h-3 w-full gap-[2px] overflow-hidden rounded-full" aria-label="Struktura kapitału bezpiecznego">
          {data.parts
            .filter((p) => p.value > 0)
            .map((p) => (
              <div key={p.key} className="h-full" style={{ width: `${(p.value / (data.safe || 1)) * 100}%`, background: seriesColor(p.slot, isDark) }} />
            ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {data.parts.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.key} className="rounded-xl bg-stone-50 px-3 py-2.5 dark:bg-white/[0.03]">
                <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
                  <span className="h-2 w-2 rounded-full" style={{ background: seriesColor(p.slot, isDark) }} />
                  <Icon size={13} /> {p.label}
                  <span className="ml-auto tabular">{formatPercent(data.safe > 0 ? p.value / data.safe : 0, { digits: 0 })}</span>
                </div>
                <div className="mt-0.5 font-semibold tabular">{formatPLN(p.value)}</div>
              </div>
            );
          })}
        </div>
      </section>

      <BondsSection />

      <div className="grid items-start gap-4 sm:gap-6 xl:grid-cols-2">
        <SavingsCards onNavigate={onNavigate} />
        <Card title="Gotówka na rachunkach maklerskich" subtitle="Wolne środki czekające na inwestycję" icon={Wallet} bodyClassName="p-0 sm:p-0">
          {data.brokerCash.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-stone-500">Brak wolnej gotówki na rachunkach.</p>
          ) : (
            <ul className="divide-y divide-stone-100 dark:divide-white/5">
              {data.brokerCash.map((x) => (
                <li key={x.account.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: ACCOUNT_TYPES[x.account.type]?.color }} />
                  <span className="min-w-0 flex-1 truncate text-sm">{x.account.name}</span>
                  <span className="text-sm font-semibold tabular">{formatPLN(x.cash)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <CpiCard />
    </div>
  );
}
