import { useMemo, useState } from 'react';
import { BarChart3, Calculator, Info, PiggyBank } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { computeLimitUsage, computePeriodStats } from '../../lib/engine.js';
import { computeIkzeRefund } from '../../lib/tax.js';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LIST, TAX_BRACKETS } from '../../lib/constants.js';
import { formatDate, formatPLN, formatPercent, signClass } from '../../lib/format.js';
import { seriesColor } from '../../lib/colors.js';
import { Badge, Card, Field, Input, ProgressBar, Segmented, Select } from '../ui.jsx';

const PERIODS = [
  { value: 'ALL', label: 'Całość' },
  { value: 'YTD', label: 'YTD' },
  { value: '1M', label: '1M' },
];

export function AccountFilterSelect({ value, onChange, className = '' }) {
  const { state } = useApp();
  const typesPresent = ACCOUNT_TYPE_LIST.filter((t) => state.accounts.some((a) => a.type === t.id));
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={`w-auto min-w-[11rem] ${className}`} aria-label="Filtr konta">
      <option value="ALL">Wszystkie konta</option>
      <optgroup label="Typ konta">
        {typesPresent.map((t) => (
          <option key={t.id} value={`TYPE:${t.id}`}>
            Wszystkie {t.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Konto">
        {state.accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </optgroup>
    </Select>
  );
}

export default function PortfolioStatsCard() {
  const { state, isDark } = useApp();
  const [period, setPeriod] = useState('ALL');
  const [filter, setFilter] = useState('ALL');

  const stats = useMemo(() => computePeriodStats(state, { period, filter }), [state, period, filter]);

  const breakdown = [
    { key: 'price', label: 'Zysk kursowy', hint: 'Zmiana wyceny akcji/ETF (zrealizowana i niezrealizowana), różnice kursowe, prowizje', value: stats.priceGain },
    { key: 'div', label: 'Dywidendy netto', hint: `Po podatku: ${formatPLN(stats.dividendsTax)}`, value: stats.dividendsNet },
    { key: 'int', label: 'Odsetki netto', hint: `Wypłacone: ${formatPLN(stats.interestCashNet)} · naliczone w obligacjach: ${formatPLN(stats.bondAccrualDelta)} · podatek: ${formatPLN(stats.interestTax)}`, value: stats.interestNet },
  ];
  const maxAbs = Math.max(1, ...breakdown.map((b) => Math.abs(b.value)));

  const periodLabel =
    period === 'ALL' ? 'od początku' : period === 'YTD' ? `od ${formatDate(stats.startDate)}` : `od ${formatDate(stats.startDate)}`;

  return (
    <Card
      title="Statystyki Portfela i Prawdziwy Zysk"
      subtitle={`Zysk Total = Wartość − Wkład własny netto · ${periodLabel}`}
      icon={BarChart3}
      actions={
        <>
          <Segmented options={PERIODS} value={period} onChange={setPeriod} ariaLabel="Okres" />
          <AccountFilterSelect value={filter} onChange={setFilter} />
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <BigStat label="Wartość portfela" value={formatPLN(stats.endValue)} sub={stats.startDate ? `Na start: ${formatPLN(stats.startValue)}` : 'Bieżąca wycena'} />
            <BigStat
              label={period === 'ALL' ? 'Wkład własny netto' : 'Wpłaty netto w okresie'}
              value={formatPLN(period === 'ALL' ? stats.contributionsAll : stats.flowsInPeriod)}
              sub={`Wpłaty ${formatPLN(stats.depositsInPeriod, { compact: true })} · wypłaty ${formatPLN(stats.withdrawalsInPeriod, { compact: true })}`}
            />
            <BigStat
              label="Zysk Total"
              value={formatPLN(stats.totalReturn, { sign: true })}
              valueClassName={signClass(stats.totalReturn)}
              sub={
                <span className={signClass(stats.totalReturnPct)}>
                  {formatPercent(stats.totalReturnPct, { sign: true })} <span className="text-stone-500">(ważony przepływami)</span>
                </span>
              }
              className="col-span-2 sm:col-span-1"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
              <span>Rozbicie Zysku Total</span>
              <span className="tabular">{formatPLN(stats.totalReturn, { sign: true })}</span>
            </div>
            <ul className="space-y-2.5">
              {breakdown.map((b, i) => (
                <li key={b.key} title={b.hint}>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: seriesColor(i === 0 ? 0 : i === 1 ? 4 : 2, isDark) }} />
                    <span className="text-stone-700 dark:text-stone-300">{b.label}</span>
                    <Info size={12} className="text-stone-400" />
                    <span className={`ml-auto font-medium tabular ${signClass(b.value)}`}>{formatPLN(b.value, { sign: true })}</span>
                  </div>
                  <div className="mt-1 flex h-1.5 items-center">
                    <div className="relative h-full w-full rounded-full bg-stone-100 dark:bg-white/5">
                      <div
                        className="absolute top-0 h-full rounded-full"
                        style={{
                          left: b.value >= 0 ? '50%' : `${50 - (Math.abs(b.value) / maxAbs) * 50}%`,
                          width: `${(Math.abs(b.value) / maxAbs) * 50}%`,
                          background: b.value >= 0 ? '#0ca30c' : '#d03b3b',
                        }}
                      />
                      <div className="absolute top-[-2px] left-1/2 h-[10px] w-px bg-stone-300 dark:bg-white/20" />
                    </div>
                  </div>
                  <div className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-500">{b.hint}</div>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-stone-100 pt-4 sm:grid-cols-4 dark:border-white/5">
            <SmallStat label="Stopa TWR" value={formatPercent(stats.twr, { sign: true })} valueClassName={signClass(stats.twr)} hint="Time-Weighted Return – eliminuje wpływ terminów wpłat" />
            <SmallStat
              label="CAGR (od początku)"
              value={formatPercent(stats.cagr, { sign: true })}
              valueClassName={signClass(stats.cagr)}
              sub={stats.cagrYears < 1 ? 'mniej niż rok – nieannualizowany' : `${stats.cagrYears.toFixed(1)} lat`}
            />
            <SmallStat label="Ważony TER" value={formatPercent(stats.terWeighted, { digits: 3 })} sub={`ETF: ${formatPercent(stats.terEtfOnly, { digits: 3 })}`} hint="Średni koszt TER ważony wartością akcji i ETF (akcje = 0%)" />
            <SmallStat label="Roczny koszt TER" value={formatPLN(stats.terAnnualCost)} sub="przy obecnej wycenie" />
          </div>
          {stats.startValueSource === 'contributions' && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              Brak migawki z początku okresu – wartość startową przyjęto jako wkład netto na ten dzień.
            </p>
          )}
        </div>

        <LimitsPanel />
      </div>
    </Card>
  );
}

function BigStat({ label, value, sub, valueClassName = '', className = '' }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-xs text-stone-500 dark:text-stone-400">{label}</div>
      <div className={`truncate text-xl font-semibold tabular ${valueClassName}`}>{value}</div>
      {sub && <div className="truncate text-xs text-stone-500 dark:text-stone-400">{sub}</div>}
    </div>
  );
}

function SmallStat({ label, value, sub, valueClassName = '', hint }) {
  return (
    <div className="min-w-0" title={hint}>
      <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">{label}</div>
      <div className={`truncate text-base font-semibold tabular ${valueClassName}`}>{value}</div>
      {sub && <div className="truncate text-[11px] text-stone-500 dark:text-stone-500">{sub}</div>}
    </div>
  );
}

function LimitsPanel() {
  const { state, actions } = useApp();
  const year = new Date().getFullYear();
  const usage = useMemo(() => computeLimitUsage(state, year), [state, year]);
  const ikzeDeposited = usage.filter((u) => u.account.type === 'IKZE').reduce((s, u) => s + Math.min(u.deposited, u.limit || u.deposited), 0);
  const [override, setOverride] = useState('');
  const amount = override === '' ? ikzeDeposited : Number(override) || 0;
  const refund = computeIkzeRefund({ amount, bracket: state.settings.taxBracket, annualIncome: state.settings.annualIncome });

  return (
    <div className="space-y-5 rounded-xl border border-stone-100 bg-stone-50/60 p-4 dark:border-white/5 dark:bg-white/[0.02]">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <PiggyBank size={16} /> Limity wpłat {year}
      </div>
      {usage.length === 0 && <p className="text-xs text-stone-500">Brak kont IKE/IKZE.</p>}
      <ul className="space-y-4">
        {usage.map((u) => (
          <li key={u.account.id}>
            <div className="flex items-center gap-2 text-sm">
              <Badge tone={u.account.type === 'IKE' ? 'blue' : u.account.type === 'IKZE' ? 'violet' : 'green'}>{ACCOUNT_TYPES[u.account.type].label}</Badge>
              <span className="truncate text-stone-700 dark:text-stone-300">{u.account.name}</span>
            </div>
            {u.limit > 0 ? (
              <>
                <div className="mt-1.5">
                  <ProgressBar value={u.usage} color={ACCOUNT_TYPES[u.account.type].color} label={`Wykorzystanie limitu ${u.account.name}`} />
                </div>
                <div className="mt-1 flex justify-between text-[11px] tabular text-stone-500 dark:text-stone-400">
                  <span>
                    {formatPLN(u.deposited)} / {formatPLN(u.limit)} ({formatPercent(u.usage, { digits: 0 })})
                  </span>
                  <span className={u.exceeded ? 'font-medium text-red-600 dark:text-red-400' : ''}>
                    {u.exceeded ? `Przekroczono o ${formatPLN(u.deposited - u.limit)}` : `Zostało ${formatPLN(u.remaining)}`}
                  </span>
                </div>
              </>
            ) : (
              <p className="mt-1 text-[11px] text-stone-500">Limit nieustalony – uzupełnij parametry w ustawieniach.</p>
            )}
          </li>
        ))}
      </ul>

      <div className="space-y-3 border-t border-stone-200 pt-4 dark:border-white/10">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Calculator size={16} /> Zwrot podatku z IKZE (PIT {year})
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Próg podatkowy">
            <Select value={state.settings.taxBracket} onChange={(e) => actions.updateSettings({ taxBracket: e.target.value })}>
              {Object.values(TAX_BRACKETS).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Wpłata na IKZE (PLN)" hint={override === '' ? 'Z rejestru wpłat w bieżącym roku' : 'Wartość ręczna'}>
            <Input type="number" min="0" step="100" placeholder={ikzeDeposited.toFixed(2)} value={override} onChange={(e) => setOverride(e.target.value)} />
          </Field>
          {state.settings.taxBracket === 'SCALE_AUTO' && (
            <Field label="Roczny dochód do opodatkowania" className="sm:col-span-2">
              <Input
                type="number"
                min="0"
                step="1000"
                value={state.settings.annualIncome || ''}
                onChange={(e) => actions.updateSettings({ annualIncome: Number(e.target.value) || 0 })}
              />
            </Field>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-white p-3 dark:bg-neutral-900">
            <div className="text-[11px] text-stone-500">Zwrot w PIT</div>
            <div className="text-lg font-semibold tabular text-emerald-700 dark:text-emerald-400">{formatPLN(refund.refund)}</div>
            <div className="text-[11px] text-stone-500">efektywnie {formatPercent(refund.effectiveRate, { digits: 1 })}</div>
          </div>
          <div className="rounded-lg bg-white p-3 dark:bg-neutral-900">
            <div className="text-[11px] text-stone-500">Realna ulga netto</div>
            <div className={`text-lg font-semibold tabular ${signClass(refund.netBenefit)}`}>{formatPLN(refund.netBenefit, { sign: true })}</div>
            <div className="text-[11px] text-stone-500">po 10% ryczałcie przy wypłacie ({formatPLN(refund.futurePayoutTax)})</div>
          </div>
        </div>
        {refund.breakdown.length > 1 && (
          <ul className="text-[11px] text-stone-500">
            {refund.breakdown.map((b) => (
              <li key={b.label}>
                {b.label}: {formatPLN(b.base)} × {formatPercent(b.rate, { digits: 0 })} = {formatPLN(b.value)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
