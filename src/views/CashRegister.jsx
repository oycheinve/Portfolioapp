import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Pencil, Plus, Receipt, Search, Trash2 } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { ACCOUNT_TYPES, CASHFLOW_TYPES } from '../lib/constants.js';
import { computeCashBalances, incomeEventsWithTax, bondIncomeEvents, isoDay } from '../lib/engine.js';
import { limitForAccount } from '../lib/tax.js';
import { formatAxisPLN, formatDate, formatPLN, todayISO } from '../lib/format.js';
import { chartChrome, seriesColor } from '../lib/colors.js';
import { Badge, Button, Card, ChartTooltip, EmptyState, Field, IconButton, Input, Modal, Segmented, Select, Stat } from '../components/ui.jsx';

const MONTHS = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];

const emptyForm = (accountId) => ({ id: null, date: todayISO(), accountId: accountId || '', type: 'DEPOSIT', amount: '', note: '' });

export default function CashRegister() {
  const { state, actions, isDark } = useApp();
  const chrome = chartChrome(isDark);
  const [accountFilter, setAccountFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [yearFilter, setYearFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const accountsById = useMemo(() => Object.fromEntries(state.accounts.map((a) => [a.id, a])), [state.accounts]);
  const years = useMemo(() => {
    const set = new Set(state.cashflows.map((c) => c.date.slice(0, 4)));
    set.add(String(new Date().getFullYear()));
    return [...set].sort().reverse();
  }, [state.cashflows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.cashflows
      .filter((c) => accountFilter === 'ALL' || c.accountId === accountFilter)
      .filter((c) => typeFilter === 'ALL' || c.type === typeFilter)
      .filter((c) => yearFilter === 'ALL' || c.date.startsWith(yearFilter))
      .filter((c) => !q || (c.note || '').toLowerCase().includes(q) || (accountsById[c.accountId]?.name || '').toLowerCase().includes(q))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [state.cashflows, accountFilter, typeFilter, yearFilter, query, accountsById]);

  const totals = useMemo(() => {
    const deposits = filtered.filter((c) => c.type === 'DEPOSIT').reduce((s, c) => s + Number(c.amount), 0);
    const withdrawals = filtered.filter((c) => c.type === 'WITHDRAWAL').reduce((s, c) => s + Number(c.amount), 0);
    return { deposits, withdrawals, net: deposits - withdrawals, count: filtered.length };
  }, [filtered]);

  const chartYear = yearFilter === 'ALL' ? String(new Date().getFullYear()) : yearFilter;
  const monthly = useMemo(() => {
    const arr = MONTHS.map((m, i) => ({ month: m, idx: i, net: 0 }));
    state.cashflows
      .filter((c) => c.date.startsWith(chartYear))
      .filter((c) => accountFilter === 'ALL' || c.accountId === accountFilter)
      .forEach((c) => {
        const m = Number(c.date.slice(5, 7)) - 1;
        arr[m].net += (c.type === 'DEPOSIT' ? 1 : -1) * Number(c.amount);
      });
    return arr;
  }, [state.cashflows, chartYear, accountFilter]);

  const perAccount = useMemo(() => {
    const today = isoDay(new Date());
    return state.accounts.map((a) => {
      const list = state.cashflows.filter((c) => c.accountId === a.id);
      const dep = list.filter((c) => c.type === 'DEPOSIT').reduce((s, c) => s + Number(c.amount), 0);
      const wd = list.filter((c) => c.type === 'WITHDRAWAL').reduce((s, c) => s + Number(c.amount), 0);
      const yearDep = list.filter((c) => c.type === 'DEPOSIT' && c.date.startsWith(String(new Date().getFullYear()))).reduce((s, c) => s + Number(c.amount), 0);
      return { account: a, dep, wd, net: dep - wd, yearDep, lastDate: list.reduce((m, c) => (c.date > m ? c.date : m), ''), today };
    });
  }, [state.accounts, state.cashflows]);

  const openNew = () => setForm(emptyForm(accountFilter !== 'ALL' ? accountFilter : state.accounts[0]?.id));
  const openEdit = (c) => setForm({ ...c, amount: String(c.amount) });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="Wpłaty" value={formatPLN(totals.deposits)} icon={ArrowDownLeft} tone="text-emerald-700 dark:text-emerald-400" />
        <SummaryTile label="Wypłaty" value={formatPLN(totals.withdrawals)} icon={ArrowUpRight} tone="text-red-600 dark:text-red-400" />
        <SummaryTile label="Wkład netto" value={formatPLN(totals.net)} icon={Receipt} />
        <SummaryTile label="Operacji" value={String(totals.count)} icon={Search} />
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card title={`Wpłaty netto miesięcznie – ${chartYear}`} subtitle={accountFilter === 'ALL' ? 'Wszystkie konta' : accountsById[accountFilter]?.name}>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={chrome.grid} vertical={false} />
                <XAxis dataKey="month" tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: chrome.axis }} />
                <YAxis tick={{ fill: chrome.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={64} tickFormatter={formatAxisPLN} />
                <Tooltip content={<ChartTooltip formatter={(v) => formatPLN(v, { sign: true })} />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="net" name="Wpłaty netto" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}>
                  {monthly.map((m) => (
                    <Cell key={m.idx} fill={m.net >= 0 ? seriesColor(0, isDark) : seriesColor(7, isDark)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Saldo wkładów per konto" subtitle="Suma wpłat − wypłat od początku" bodyClassName="p-0 sm:p-0">
          <ul className="divide-y divide-stone-100 dark:divide-white/5">
            {perAccount.map((p) => {
              const limit = limitForAccount(p.account, state.settings, new Date().getFullYear());
              return (
                <li key={p.account.id} className="px-4 py-2.5 sm:px-5">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: ACCOUNT_TYPES[p.account.type]?.color }} />
                    <span className="truncate font-medium">{p.account.name}</span>
                    <span className="ml-auto font-semibold tabular">{formatPLN(p.net)}</span>
                  </div>
                  <div className="mt-0.5 flex justify-between pl-4.5 text-[11px] text-stone-500 dark:text-stone-400">
                    <span>
                      +{formatPLN(p.dep, { compact: true })} / −{formatPLN(p.wd, { compact: true })}
                    </span>
                    {limit > 0 && (
                      <span className={p.yearDep > limit ? 'text-red-600 dark:text-red-400' : ''}>
                        {new Date().getFullYear()}: {formatPLN(p.yearDep, { compact: true })} z {formatPLN(limit, { compact: true })}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card
        title="Rejestr transakcji gotówkowych"
        subtitle="Wpłaty i wypłaty własne – podstawa wyliczenia wkładu netto i Zysku Total"
        icon={Receipt}
        actions={
          <Button variant="primary" icon={Plus} onClick={openNew} disabled={state.accounts.length === 0}>
            Dodaj operację
          </Button>
        }
        bodyClassName="p-0 sm:p-0"
      >
        <div className="flex flex-wrap items-end gap-2 border-b border-stone-100 px-4 py-3 sm:px-5 dark:border-white/5">
          <Select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className="w-auto min-w-[10rem]" aria-label="Konto">
            <option value="ALL">Wszystkie konta</option>
            {state.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="w-auto" aria-label="Rok">
            <option value="ALL">Wszystkie lata</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
          <Segmented
            options={[
              { value: 'ALL', label: 'Wszystkie' },
              { value: 'DEPOSIT', label: 'Wpłaty' },
              { value: 'WITHDRAWAL', label: 'Wypłaty' },
            ]}
            value={typeFilter}
            onChange={setTypeFilter}
            size="sm"
            ariaLabel="Typ operacji"
          />
          <div className="relative ml-auto w-full sm:w-56">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Szukaj w opisie…" className="pl-8" />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={Receipt} title="Brak operacji" description="Zmień filtry lub dodaj pierwszą wpłatę." />
        ) : (
          <>
            {/* Tabela – desktop */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 text-left text-xs text-stone-500 dark:border-white/5 dark:text-stone-400">
                    <th className="px-5 py-2 font-medium">Data</th>
                    <th className="px-3 py-2 font-medium">Konto</th>
                    <th className="px-3 py-2 font-medium">Typ</th>
                    <th className="px-3 py-2 text-right font-medium">Kwota</th>
                    <th className="px-3 py-2 font-medium">Opis</th>
                    <th className="px-5 py-2 text-right font-medium">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const acc = accountsById[c.accountId];
                    const isDep = c.type === 'DEPOSIT';
                    return (
                      <tr key={c.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50 dark:border-white/5 dark:hover:bg-white/[0.02]">
                        <td className="px-5 py-2 tabular whitespace-nowrap">{formatDate(c.date)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ background: ACCOUNT_TYPES[acc?.type]?.color }} />
                            <span className="truncate">{acc?.name || 'Usunięte konto'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone={isDep ? 'green' : 'red'}>{CASHFLOW_TYPES[c.type].label}</Badge>
                        </td>
                        <td className={`px-3 py-2 text-right font-medium tabular whitespace-nowrap ${isDep ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {isDep ? '+' : '−'}
                          {formatPLN(Number(c.amount))}
                        </td>
                        <td className="max-w-[16rem] truncate px-3 py-2 text-stone-500 dark:text-stone-400">{c.note}</td>
                        <td className="px-5 py-1 text-right whitespace-nowrap">
                          <IconButton icon={Pencil} label="Edytuj" onClick={() => openEdit(c)} />
                          <IconButton icon={Trash2} label="Usuń" onClick={() => setConfirmDelete(c)} className="hover:text-red-600" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Lista – mobile */}
            <ul className="divide-y divide-stone-100 md:hidden dark:divide-white/5">
              {filtered.map((c) => {
                const acc = accountsById[c.accountId];
                const isDep = c.type === 'DEPOSIT';
                return (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isDep ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'}`}>
                      {isDep ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                    </span>
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openEdit(c)}>
                      <div className="truncate text-sm font-medium">{acc?.name || 'Usunięte konto'}</div>
                      <div className="truncate text-xs text-stone-500 dark:text-stone-400">
                        {formatDate(c.date)}
                        {c.note ? ` · ${c.note}` : ''}
                      </div>
                    </button>
                    <div className={`text-sm font-semibold tabular ${isDep ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {isDep ? '+' : '−'}
                      {formatPLN(Number(c.amount))}
                    </div>
                    <IconButton icon={Trash2} label="Usuń" onClick={() => setConfirmDelete(c)} />
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      <CashflowFormModal form={form} setForm={setForm} onSave={(item) => { actions.upsert('cashflows', item); actions.notify(item.id ? 'Zapisano operację' : 'Dodano operację', 'success'); setForm(null); }} />

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Usunąć operację?"
        footer={
          <>
            <Button onClick={() => setConfirmDelete(null)}>Anuluj</Button>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={() => {
                actions.remove('cashflows', confirmDelete.id);
                actions.notify('Usunięto operację', 'info');
                setConfirmDelete(null);
              }}
            >
              Usuń
            </Button>
          </>
        }
      >
        {confirmDelete && (
          <p className="text-sm text-stone-600 dark:text-stone-300">
            {CASHFLOW_TYPES[confirmDelete.type].label} {formatPLN(Number(confirmDelete.amount))} z dnia {formatDate(confirmDelete.date)} na koncie „
            {accountsById[confirmDelete.accountId]?.name}”. Zmieni to wkład netto i statystyki zysku.
          </p>
        )}
      </Modal>
    </div>
  );
}

function SummaryTile({ label, value, icon: Icon, tone = '' }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
        <Icon size={14} /> {label}
      </div>
      <div className={`mt-1 truncate text-lg font-semibold tabular ${tone}`}>{value}</div>
    </div>
  );
}

function CashflowFormModal({ form, setForm, onSave }) {
  const { state } = useApp();
  const open = !!form;
  const f = form || emptyForm();
  const account = state.accounts.find((a) => a.id === f.accountId);
  const amount = Number(String(f.amount).replace(',', '.')) || 0;
  const year = Number((f.date || todayISO()).slice(0, 4));

  // Limit roczny dla IKE/IKZE/OKI (z pominięciem edytowanej operacji)
  const limit = account ? limitForAccount(account, state.settings, year) : 0;
  const yearDeposits = state.cashflows
    .filter((c) => c.accountId === f.accountId && c.type === 'DEPOSIT' && c.date.startsWith(String(year)) && c.id !== f.id)
    .reduce((s, c) => s + Number(c.amount), 0);
  const remaining = Math.max(0, limit - yearDeposits);

  // Dostępna gotówka na koncie na dzień operacji (dla wypłat)
  const available = useMemo(() => {
    if (!account || !open) return 0;
    const others = { ...state, cashflows: state.cashflows.filter((c) => c.id !== f.id) };
    const income = [...incomeEventsWithTax(others), ...bondIncomeEvents(others, f.date || todayISO())];
    return computeCashBalances(others, f.date || todayISO(), [account.id], income)[account.id] || 0;
  }, [state, account, f.id, f.date, open]);

  const errors = [];
  if (!f.accountId) errors.push('Wybierz konto.');
  if (!(amount > 0)) errors.push('Kwota musi być większa od zera.');
  if (!f.date) errors.push('Podaj datę.');
  const warnings = [];
  if (f.type === 'DEPOSIT' && limit > 0 && amount > remaining) {
    warnings.push(`Wpłata przekracza roczny limit ${ACCOUNT_TYPES[account.type].label} ${year} o ${formatPLN(amount - remaining)} (pozostało ${formatPLN(remaining)}).`);
  }
  if (f.type === 'WITHDRAWAL' && amount > available + 0.005) {
    warnings.push(`Wypłata przekracza dostępną gotówkę na koncie (${formatPLN(available)}). Najpierw zarejestruj sprzedaż aktywów.`);
  }
  if (f.type === 'WITHDRAWAL' && account && (account.type === 'IKE' || account.type === 'IKZE')) {
    warnings.push(`Wypłata z ${ACCOUNT_TYPES[account.type].label} przed osiągnięciem wieku emerytalnego oznacza zwrot – utratę preferencji podatkowych.`);
  }

  const set = (patch) => setForm({ ...f, ...patch });

  return (
    <Modal
      open={open}
      onClose={() => setForm(null)}
      title={f.id ? 'Edytuj operację' : 'Nowa wpłata / wypłata'}
      footer={
        <>
          <Button onClick={() => setForm(null)}>Anuluj</Button>
          <Button
            variant="primary"
            disabled={errors.length > 0}
            onClick={() =>
              onSave({
                ...(f.id ? { id: f.id } : {}),
                date: f.date,
                accountId: f.accountId,
                type: f.type,
                amount: Math.round(amount * 100) / 100,
                note: f.note.trim(),
              })
            }
          >
            Zapisz
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented
          options={[
            { value: 'DEPOSIT', label: 'Wpłata' },
            { value: 'WITHDRAWAL', label: 'Wypłata' },
          ]}
          value={f.type}
          onChange={(type) => set({ type })}
          ariaLabel="Typ operacji"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Konto">
            <Select value={f.accountId} onChange={(e) => set({ accountId: e.target.value })}>
              <option value="" disabled>
                Wybierz konto…
              </option>
              {state.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({ACCOUNT_TYPES[a.type].label})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Data">
            <Input type="date" value={f.date} max={todayISO()} onChange={(e) => set({ date: e.target.value })} />
          </Field>
          <Field label="Kwota (PLN)" hint={f.type === 'DEPOSIT' && limit > 0 ? `Pozostały limit ${year}: ${formatPLN(remaining)}` : f.type === 'WITHDRAWAL' && account ? `Dostępna gotówka: ${formatPLN(available)}` : undefined}>
            <Input type="number" min="0" step="0.01" inputMode="decimal" value={f.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="0,00" autoFocus />
          </Field>
          <Field label="Opis (opcjonalnie)">
            <Input value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="np. Wpłata miesięczna" />
          </Field>
        </div>
        {warnings.length > 0 && (
          <ul className="space-y-1.5">
            {warnings.map((w) => (
              <li key={w} className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-300">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {w}
              </li>
            ))}
          </ul>
        )}
        {account?.type === 'IKZE' && f.type === 'DEPOSIT' && amount > 0 && (
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Wpłata obniży podstawę opodatkowania w PIT za {year}. Szacunek zwrotu zobaczysz na Pulpicie w karcie limitów.
          </p>
        )}
      </div>
    </Modal>
  );
}
