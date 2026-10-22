import { useMemo } from 'react';
import { Landmark, PiggyBank, Shield, Wallet } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { ACCOUNT_TYPES } from '../lib/constants.js';
import { getCpiTable, valueBond } from '../lib/bonds.js';
import { isSafeAccount, isoDay, livePriceLookup, otherAssetsValue, valuePortfolio } from '../lib/engine.js';
import { savingsProjection } from '../lib/savings.js';
import { bondBelkaRate } from '../lib/tax.js';
import { seriesColor } from '../lib/colors.js';
import { formatPLN, formatPercent } from '../lib/format.js';
import { Card } from '../components/ui.jsx';
import BondsSection from '../components/bonds/BondsSection.jsx';
import { CpiCard, SavingsCards } from '../components/bonds/SavingsSection.jsx';

// Poduszka finansowa = konta oszczędnościowe i konta obligacji skarbowych (obligacje + gotówka na nich).
// Oba instrumenty są wbudowane (nie konta tworzone w ustawieniach); gotówka na kontach inwestycyjnych pokazana osobno.
export default function SafeCapitalView() {
  const { state, isDark } = useApp();
  const today = isoDay(new Date());
  const data = useMemo(() => {
    const v = valuePortfolio(state, { asOf: today, accountIds: null, priceLookup: livePriceLookup(state) });
    const cpi = getCpiTable(state.settings);
    let bondsIncome = 0;
    for (const b of v.bonds) {
      const belka = bondBelkaRate(b, b.account);
      const val = valueBond(b, today, belka, cpi);
      if (!val.matured) bondsIncome += val.nominal * val.currentRate * (1 - belka);
    }
    const savingsAccounts = state.accounts.filter((a) => a.type === 'SAVINGS');
    const savingsIncome = savingsAccounts.reduce((s, a) => s + savingsProjection(state, a, today).yearlyNet, 0);
    // Podkategorie poduszki: obligacje skarbowe (transze + gotówka rejestru z wykupów/kuponów) i konta oszczędnościowe
    const bondAccounts = state.accounts.filter((a) => a.type === 'BONDS');
    const bondItems = v.bonds
      .filter((b) => b.account?.type === 'BONDS' && b.value > 0.005)
      .sort((a, b) => b.value - a.value)
      .map((b) => ({ key: b.id, label: `${b.series || b.type} · ${b.quantity} szt.`, value: b.value }));
    const bondCash = bondAccounts.reduce((sum, a) => sum + (v.byAccount[a.id]?.cash || 0), 0);
    if (Math.abs(bondCash) >= 0.5) bondItems.push({ key: 'bondcash', label: 'Gotówka z wykupów i kuponów', value: bondCash });
    const savingsItems = savingsAccounts
      .map((a) => ({ key: a.id, label: a.name, value: v.byAccount[a.id]?.cash || 0 }))
      .sort((a, b) => b.value - a.value);
    const groups = [
      { key: 'bonds', label: 'Obligacje skarbowe', icon: Landmark, slot: 2, items: bondItems },
      { key: 'savings', label: 'Konta oszczędnościowe', icon: PiggyBank, slot: 3, items: savingsItems },
    ].map((g) => ({ ...g, value: g.items.reduce((sum, it) => sum + it.value, 0) }));
    const safeIds = new Set(state.accounts.filter(isSafeAccount).map((a) => a.id));
    // Poza poduszką: wolna gotówka na kontach inwestycyjnych
    const brokerCash = state.accounts
      .filter((a) => !isSafeAccount(a))
      .map((a) => ({ account: a, cash: v.byAccount[a.id]?.cash || 0 }))
      .filter((x) => Math.abs(x.cash) >= 0.5);
    const investValue = Object.entries(v.byAccount)
      .filter(([id]) => !safeIds.has(id))
      .reduce((sum, [, x]) => sum + (x.total || 0), 0);
    const netWorth = v.totals.total + otherAssetsValue(state).includedValue;
    const safe = groups.reduce((sum, g) => sum + g.value, 0);
    return { groups, safe, share: netWorth > 0 ? safe / netWorth : 0, investValue, income: bondsIncome + savingsIncome, brokerCash };
  }, [state, today]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6 dark:border-white/10 dark:bg-neutral-900">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
              <Shield size={16} /> Poduszka finansowa
            </div>
            <div className="mt-1 text-3xl font-semibold tracking-tight tabular">{formatPLN(data.safe)}</div>
            <div className="text-xs text-stone-500 dark:text-stone-400">
              {formatPercent(data.share, { digits: 1 })} majątku całkowitego · osobno od portfela inwestycyjnego ({formatPLN(data.investValue)})
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-stone-500">Roczny dochód netto (obligacje + oszczędności)</div>
            <div className="text-xl font-semibold tabular text-emerald-700 dark:text-emerald-400">{formatPLN(data.income)}</div>
            <div className="text-xs text-stone-500 tabular">{formatPLN(data.income / 12)} / mies.</div>
          </div>
        </div>
        <div className="mt-4 flex h-3 w-full gap-[2px] overflow-hidden rounded-full" aria-label="Struktura poduszki finansowej">
          {data.groups
            .filter((g) => g.value > 0)
            .map((g) => (
              <div key={g.key} className="h-full" style={{ width: `${(g.value / (data.safe || 1)) * 100}%`, background: seriesColor(g.slot, isDark) }} />
            ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {data.groups.map((g) => {
            const Icon = g.icon;
            return (
              <div key={g.key} className="rounded-xl bg-stone-50 px-3 py-2.5 dark:bg-white/[0.03]">
                <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
                  <span className="h-2 w-2 rounded-full" style={{ background: seriesColor(g.slot, isDark) }} />
                  <Icon size={13} /> {g.label}
                  <span className="ml-auto tabular">{formatPercent(data.safe > 0 ? g.value / data.safe : 0, { digits: 0 })}</span>
                </div>
                <div className="mt-0.5 text-lg font-semibold tabular">{formatPLN(g.value)}</div>
                {g.items.length > 0 ? (
                  <ul className="mt-1.5 space-y-0.5 border-t border-stone-200/70 pt-1.5 text-xs dark:border-white/5">
                    {g.items.map((it) => (
                      <li key={it.key} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-stone-600 dark:text-stone-300">{it.label}</span>
                        <span className="tabular">{formatPLN(it.value)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-1 text-xs text-stone-500">Brak – dodaj poniżej</div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-end gap-x-2 text-xs text-stone-500 tabular dark:text-stone-400">
          {data.groups.map((g, i) => (
            <span key={g.key}>
              {i > 0 && '+ '}
              {g.label} {formatPLN(g.value)}
            </span>
          ))}
          <span className="font-semibold text-stone-800 dark:text-stone-100">= {formatPLN(data.safe)}</span>
        </div>
      </section>

      <BondsSection />

      <div className="grid items-start gap-4 sm:gap-6 xl:grid-cols-2">
        <SavingsCards />
        <Card
          title="Gotówka na kontach inwestycyjnych"
          subtitle="Wolne środki czekające na inwestycję – część portfela inwestycyjnego, nie poduszki"
          icon={Wallet}
          bodyClassName="p-0 sm:p-0"
        >
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
