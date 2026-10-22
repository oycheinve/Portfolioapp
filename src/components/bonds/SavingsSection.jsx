import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { HandCoins, Pencil, PiggyBank, Plus, Table2, Trash2 } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { CAPITALIZATION } from '../../lib/constants.js';
import { getCpiTable } from '../../lib/bonds.js';
import { passiveIncomeByMonth, savingsProjection } from '../../lib/savings.js';
import { chartChrome, seriesColor } from '../../lib/colors.js';
import { formatAxisPLN, formatDate, formatPLN, formatPercent, todayISO } from '../../lib/format.js';
import { Badge, Button, Card, ChartTooltip, EmptyState, Field, IconButton, Input, Select, Toggle } from '../ui.jsx';
import { AccountFormModal, DeleteAccountModal, SAVINGS_NAME } from '../settings/AccountForm.jsx';
import { Legend } from '../charts/chartUtils.jsx';

const emptySavings = () => ({ name: SAVINGS_NAME, type: 'SAVINGS', institution: '', currency: 'PLN', openedAt: todayISO(), interestRate: 0, capitalization: 'MONTHLY' });

// Konta oszczędnościowe – wbudowany instrument poduszki finansowej (dodawanie, edycja i usuwanie w tej zakładce)
export function SavingsCards() {
  const { state } = useApp();
  const [form, setForm] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const accounts = state.accounts.filter((a) => a.type === 'SAVINGS');
  const modals = (
    <>
      <AccountFormModal form={form} setForm={setForm} types={['SAVINGS']} />
      <DeleteAccountModal account={toDelete} onClose={() => setToDelete(null)} />
    </>
  );
  if (accounts.length === 0) {
    return (
      <Card title="Konta oszczędnościowe" icon={PiggyBank}>
        <EmptyState
          icon={PiggyBank}
          title="Brak kont oszczędnościowych"
          description="Dodaj konto oszczędnościowe – saldo, oprocentowanie i kapitalizacja odsetek."
          action={
            <Button variant="primary" icon={Plus} onClick={() => setForm(emptySavings())}>
              Dodaj konto oszczędnościowe
            </Button>
          }
        />
        {modals}
      </Card>
    );
  }
  return (
    <>
      {accounts.map((a, i) => (
        <SavingsCard key={a.id} account={a} onEdit={() => setForm({ ...a })} onDelete={() => setToDelete(a)} onAdd={i === 0 ? () => setForm(emptySavings()) : null} />
      ))}
      {modals}
    </>
  );
}

function SavingsCard({ account, onEdit, onDelete, onAdd }) {
  const { state, actions } = useApp();
  const p = useMemo(() => savingsProjection(state, account), [state, account]);
  const update = (patch) => actions.upsert('accounts', { ...account, ...patch });

  return (
    <Card
      title={account.name}
      subtitle={`Poduszka finansowa · ${String(account.interestRate || 0).replace('.', ',')}% w skali roku`}
      icon={PiggyBank}
      actions={
        <div className="flex items-center gap-1">
          {onAdd && (
            <Button size="sm" icon={Plus} onClick={onAdd}>
              Dodaj konto
            </Button>
          )}
          <IconButton icon={Pencil} label="Edytuj konto oszczędnościowe" onClick={onEdit} />
          <IconButton icon={Trash2} label="Usuń konto oszczędnościowe" onClick={onDelete} className="hover:text-red-600" />
        </div>
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs text-stone-500 dark:text-stone-400">Saldo</div>
          <div className="text-3xl font-semibold tracking-tight tabular">{formatPLN(p.balance)}</div>
        </div>
        <Badge tone={p.deferred ? 'violet' : p.belka === 0 ? 'green' : 'amber'}>
          {p.deferred ? 'Belka odroczona (PIT)' : account.belkaEnabled === false ? 'bez Belki (brutto)' : `Belka ${Math.round(p.belka * 100)}%`}
        </Badge>
      </div>

      <div className="mt-4 space-y-3">
        <Toggle
          checked={account.belkaEnabled !== false}
          onChange={(v) => update({ belkaEnabled: v })}
          label="Wliczaj podatek Belki (19%)"
          description={account.belkaEnabled === false ? 'Odsetki pokazywane brutto.' : 'Odsetki i prognozy pokazywane po podatku.'}
        />
        {p.deferred && (
          <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 text-xs text-violet-900 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200">
            <div className="font-semibold">Podatek Belki odroczony (rozliczenie samodzielne w PIT)</div>
            <div className="mt-1">
              Bank wypłaca odsetki brutto – 19% wykażesz w zeznaniu rocznym (PIT-38). Do rozliczenia za {todayISO().slice(0, 4)} r. (dotychczas):{' '}
              <span className="font-semibold tabular">{formatPLN(p.pitDueYtd)}</span> · prognoza na 12 mies.: <span className="tabular">{formatPLN(p.pitDueYearly)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Oprocentowanie nominalne (%)">
          <Input type="number" step="0.05" min="0" value={account.interestRate ?? 0} onChange={(e) => update({ interestRate: Number(e.target.value) || 0 })} />
        </Field>
        <Field label="Kapitalizacja">
          <Select value={account.capitalization || 'MONTHLY'} onChange={(e) => update({ capitalization: e.target.value })}>
            {Object.values(CAPITALIZATION).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Mini label="Odsetki netto / mies." value={formatPLN(p.monthlyNet)} sub={`brutto ${formatPLN(p.monthlyGross)}`} tone="text-emerald-700 dark:text-emerald-400" />
        <Mini label="Odsetki netto / rok" value={formatPLN(p.yearlyNet)} sub={`efektywnie ${formatPercent(p.earNet, { digits: 2 })} netto`} />
        <Mini label="Efektywnie brutto (EAR)" value={formatPercent(p.ear, { digits: 2 })} sub={CAPITALIZATION[p.capitalization]?.label.toLowerCase() + ' kapitalizacja'} />
        <Mini label="Naliczone w bieżącym okresie" value={formatPLN(p.accruedNet)} sub={`od ${formatDate(p.periodStart)} (netto)`} />
        <Mini label="Najbliższa kapitalizacja" value={formatDate(p.nextCapitalization)} />
        <Mini label="Otrzymane – 12 mies." value={formatPLN(p.last12Net)} sub={`brutto ${formatPLN(p.last12Gross)}`} />
      </div>

      <div className="mt-4 border-t border-stone-100 pt-4 dark:border-white/5">
        <Toggle
          checked={!!account.autoInterest}
          onChange={(v) => update({ autoInterest: v, autoInterestFrom: v ? account.autoInterestFrom || p.periodStart : account.autoInterestFrom })}
          label="Automatycznie księguj odsetki co okres kapitalizacji"
          description={
            account.autoInterest
              ? `Aktywne od ${formatDate(account.autoInterestFrom)} – odsetki netto trafią do dochodu pasywnego i statystyk (ostatni wpis: ${formatDate(p.lastPosted)}).`
              : 'Po włączeniu aplikacja dopisze odsetki (brutto, Belka liczona automatycznie) za każdy zakończony okres.'
          }
        />
        {account.autoInterest && (
          <Field label="Księguj od dnia" className="mt-3 max-w-[12rem]" hint="Wcześniejsza data dopisze zaległe okresy – unikaj okresów, które masz już wpisane ręcznie">
            <Input type="date" value={account.autoInterestFrom || ''} max={todayISO()} onChange={(e) => update({ autoInterestFrom: e.target.value })} />
          </Field>
        )}
      </div>
    </Card>
  );
}

export function PassiveIncomeCard() {
  const { state, isDark } = useApp();
  const chrome = chartChrome(isDark);
  const rows = useMemo(() => passiveIncomeByMonth(state, 12), [state]);
  const total = rows.reduce((s, r) => s + r.total, 0);
  const savings = state.accounts.filter((a) => a.type === 'SAVINGS').map((a) => savingsProjection(state, a));
  const forecastSavings = savings.reduce((s, p) => s + p.monthlyNet, 0);
  const c = { dividends: seriesColor(4, isDark), bonds: seriesColor(2, isDark), interest: seriesColor(3, isDark) };

  return (
    <Card title="Dochód pasywny netto" subtitle="Ostatnie 12 miesięcy: dywidendy, kupony obligacji, odsetki" icon={HandCoins}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Mini label="Suma 12 mies." value={formatPLN(total)} />
        <Mini label="Średnio / mies." value={formatPLN(total / 12)} tone="text-emerald-700 dark:text-emerald-400" />
        <Mini label="W tym bieżący miesiąc" value={formatPLN(rows[rows.length - 1].total)} />
        <Mini label="Odsetki z oszczędności / mies." value={formatPLN(forecastSavings)} sub="prognoza przy obecnym saldzie" />
      </div>
      <div className="mt-4">
        <Legend
          items={[
            { key: 'd', label: 'Dywidendy', color: c.dividends, bar: true },
            { key: 'b', label: 'Kupony obligacji', color: c.bonds, bar: true },
            { key: 'i', label: 'Odsetki (oszczędności)', color: c.interest, bar: true },
          ]}
        />
      </div>
      <div className="mt-2 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={chrome.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: chrome.axis }} interval="preserveStartEnd" />
            <YAxis tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={56} tickFormatter={formatAxisPLN} />
            <Tooltip content={<ChartTooltip formatter={(v) => formatPLN(v)} />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} />
            <Bar dataKey="interest" name="Odsetki" stackId="p" fill={c.interest} stroke={chrome.surface} strokeWidth={1} maxBarSize={28} isAnimationActive={false} />
            <Bar dataKey="bonds" name="Kupony" stackId="p" fill={c.bonds} stroke={chrome.surface} strokeWidth={1} maxBarSize={28} isAnimationActive={false} />
            <Bar dataKey="dividends" name="Dywidendy" stackId="p" fill={c.dividends} stroke={chrome.surface} strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export function CpiCard() {
  const { state, actions } = useApp();
  const table = useMemo(() => getCpiTable(state.settings), [state.settings]);
  const years = [...new Set(Object.keys(table).map((k) => k.slice(0, 4)))].sort().reverse();
  const [year, setYear] = useState(years[0]);
  const overrides = state.settings.cpiOverrides || {};
  const setReading = (key, value) => {
    const next = { ...overrides };
    if (value === '') delete next[key];
    else next[key] = Number(value);
    actions.updateSettings({ cpiOverrides: next });
  };
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

  return (
    <Card
      title="Odczyty inflacji CPI (r/r)"
      subtitle="Podstawa oprocentowania COI/EDO od 2. roku i benchmarku inflacji"
      icon={Table2}
      actions={
        <Select value={year} onChange={(e) => setYear(e.target.value)} className="w-auto" aria-label="Rok">
          {[...new Set([String(new Date().getFullYear()), ...years])].sort().reverse().map((y) => (
            <option key={y}>{y}</option>
          ))}
        </Select>
      }
    >
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {months.map((k) => {
          const r = table[k];
          return (
            <Field key={k} label={new Date(`${k}-01`).toLocaleDateString('pl-PL', { month: 'short' })}>
              <Input
                type="number"
                step="0.1"
                value={overrides[k] ?? ''}
                placeholder={r ? String(r.value) : '—'}
                onChange={(e) => setReading(k, e.target.value)}
                className={r?.estimate && overrides[k] === undefined ? 'border-amber-300 dark:border-amber-500/40' : ''}
                title={r?.estimate ? 'Wartość szacunkowa – wpisz odczyt GUS' : r?.manual ? 'Odczyt wpisany ręcznie' : 'Odczyt GUS'}
              />
            </Field>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-stone-500 dark:text-stone-500">
        Szare podpowiedzi to wbudowane odczyty GUS; pola z pomarańczową ramką to szacunki – wpisz właściwą wartość, aby nadpisać. Puste pole = wartość domyślna.
      </p>
    </Card>
  );
}

function Mini({ label, value, sub, tone = '' }) {
  return (
    <div className="min-w-0 rounded-lg bg-stone-50 px-3 py-2 dark:bg-white/[0.03]">
      <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">{label}</div>
      <div className={`truncate text-sm font-semibold tabular ${tone}`}>{value}</div>
      {sub && <div className="truncate text-[11px] text-stone-500 dark:text-stone-500">{sub}</div>}
    </div>
  );
}
