import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Pencil, Plus, Receipt, Search, Trash2 } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { ACCOUNT_TYPES, CASHFLOW_TYPES } from '../lib/constants.js';
import { isoDay, limitDeposits, tradeAmounts } from '../lib/engine.js';
import { limitForAccount } from '../lib/tax.js';
import { formatAxisPLN, formatDate, formatMoney, formatNumber, formatPLN } from '../lib/format.js';
import { chartChrome, seriesColor } from '../lib/colors.js';
import { Badge, Button, Card, ChartTooltip, EmptyState, IconButton, Input, Modal, Segmented, Select } from '../components/ui.jsx';
import OperationFormModal, { emptyOperation, operationFromCashflow, operationFromTrade } from '../components/cash/OperationFormModal.jsx';
import XtbImportCard from '../components/cash/XtbImportCard.jsx';
import ClearHistoryButton from '../components/settings/ClearHistoryButton.jsx';

const MONTHS = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];

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
      // Do limitu IKE/IKZE: bez rotacji wewnątrz konta i bez wpłat technicznych
      const yearDep = limitDeposits(state, a.id, new Date().getFullYear());
      return { account: a, dep, wd, net: dep - wd, yearDep, lastDate: list.reduce((m, c) => (c.date > m ? c.date : m), ''), today };
    });
  }, [state]);

  const openNew = () => setForm(emptyOperation(accountFilter !== 'ALL' ? accountFilter : state.accounts[0]?.id));
  const openEdit = (c) => setForm(operationFromCashflow(c));
  const instById = useMemo(() => Object.fromEntries(state.instruments.map((i) => [i.id, i])), [state.instruments]);

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
        title="Rejestr wpłat i wypłat"
        subtitle="Wpłaty i wypłaty własne – podstawa wyliczenia wkładu netto i Zysku Total · kupno/sprzedaż i saldo oszczędności w „Dodaj operację”"
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
                        <td className="max-w-[16rem] truncate px-3 py-2 text-stone-500 dark:text-stone-400">
                          {c.instrumentId && instById[c.instrumentId] && <Badge tone="blue">{instById[c.instrumentId].ticker}</Badge>} {c.note}
                        </td>
                        <td className="px-5 py-1 text-right whitespace-nowrap">
                          {(c.source === 'AUTO_BOND' || c.source === 'AUTO_FUND') ? (
                            <span title="Wpłata dodana automatycznie, gdy zakup przekroczył gotówkę na koncie – przelicza się sama, znika po ręcznej wpłacie">
                              <Badge>auto · uzupełnienie</Badge>
                            </span>
                          ) : (
                            <>
                              <IconButton icon={Pencil} label="Edytuj" onClick={() => openEdit(c)} />
                              <IconButton icon={Trash2} label="Usuń" onClick={() => setConfirmDelete(c)} className="hover:text-red-600" />
                            </>
                          )}
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
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => !(c.source === 'AUTO_BOND' || c.source === 'AUTO_FUND') && openEdit(c)}>
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
                    {(c.source === 'AUTO_BOND' || c.source === 'AUTO_FUND') ? <Badge>auto</Badge> : <IconButton icon={Trash2} label="Usuń" onClick={() => setConfirmDelete(c)} />}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      <TradesCard accountFilter={accountFilter} yearFilter={yearFilter} onEdit={(t) => setForm(operationFromTrade(t))} />

      <XtbImportCard />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50/50 px-4 py-3 sm:px-5 dark:border-red-500/20 dark:bg-red-500/5">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Zarządzanie danymi</div>
          <div className="text-xs text-stone-600 dark:text-stone-400">Wyczyść całą historię operacji (np. przed ponownym importem z XTB). Konta i ustawienia zostają.</div>
        </div>
        <ClearHistoryButton />
      </div>

      <OperationFormModal
        form={form}
        setForm={setForm}
        onSave={({ writes, instruments }) => {
          if (instruments.length) actions.addMany('instruments', instruments);
          for (const w of writes) actions.upsert(w.collection, w.item);
          actions.notify(form?.id ? 'Zapisano operację' : 'Dodano operację', 'success');
          setForm(null);
        }}
      />

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

// Transakcje kupna/sprzedaży (ręczne i zaimportowane z XTB)
function TradesCard({ accountFilter, yearFilter, onEdit }) {
  const { state, actions } = useApp();
  const [toDelete, setToDelete] = useState(null);
  const [limit, setLimit] = useState(15);
  const accountsById = Object.fromEntries(state.accounts.map((a) => [a.id, a]));
  const instById = Object.fromEntries(state.instruments.map((i) => [i.id, i]));
  const list = state.trades
    .filter((t) => accountFilter === 'ALL' || t.accountId === accountFilter)
    .filter((t) => yearFilter === 'ALL' || t.date.startsWith(yearFilter))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return (
    <Card title="Transakcje kupna i sprzedaży" subtitle={`${list.length} transakcji · koszt zawiera prowizje i przewalutowanie`} icon={ArrowLeftRight} bodyClassName="p-0 sm:p-0">
      {list.length === 0 ? (
        <EmptyState icon={ArrowLeftRight} title="Brak transakcji" description="Dodaj kupno przez „Dodaj operację” albo zaimportuj historię z XTB." />
      ) : (
        <>
          <ul className="divide-y divide-stone-100 dark:divide-white/5">
            {list.slice(0, limit).map((t) => {
              const inst = instById[t.instrumentId];
              const acc = accountsById[t.accountId];
              const amt = tradeAmounts(t, acc, inst);
              const buy = t.side === 'BUY';
              return (
                <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                  <Badge tone={buy ? 'blue' : 'amber'}>{buy ? 'Kupno' : 'Sprzedaż'}</Badge>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onEdit(t)}>
                    <div className="truncate text-sm font-medium">
                      {inst?.ticker || '?'} <span className="font-normal text-stone-500">· {formatNumber(Number(t.quantity), 4)} × {formatMoney(Number(t.price), t.currency || inst?.currency || 'PLN')}</span>
                    </div>
                    <div className="truncate text-xs text-stone-500 dark:text-stone-400">
                      {formatDate(t.date)} · {acc?.name || 'Usunięte konto'}
                      {t.source === 'XTB' ? ' · import XTB' : ''}
                      {amt.fxFee > 0 ? ` · FX ${formatPLN(amt.fxFee)}` : ''}
                    </div>
                  </button>
                  <div className={`text-sm font-semibold tabular ${buy ? '' : 'text-emerald-700 dark:text-emerald-400'}`}>{formatPLN(buy ? -amt.buyCost : amt.sellProceeds, { sign: true })}</div>
                  <IconButton icon={Pencil} label="Edytuj transakcję" onClick={() => onEdit(t)} />
                  <IconButton icon={Trash2} label="Usuń transakcję" onClick={() => setToDelete(t)} className="hover:text-red-600" />
                </li>
              );
            })}
          </ul>
          {list.length > limit && (
            <button type="button" onClick={() => setLimit((l) => l + 30)} className="w-full border-t border-stone-100 py-2.5 text-sm font-medium text-blue-600 hover:bg-stone-50 dark:border-white/5 dark:text-blue-400 dark:hover:bg-white/[0.03]">
              Pokaż więcej ({list.length - limit})
            </button>
          )}
        </>
      )}
      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Usunąć transakcję?"
        footer={
          <>
            <Button onClick={() => setToDelete(null)}>Anuluj</Button>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={() => {
                actions.remove('trades', toDelete.id);
                actions.notify('Usunięto transakcję', 'info');
                setToDelete(null);
              }}
            >
              Usuń
            </Button>
          </>
        }
      >
        {toDelete && <p className="text-sm text-stone-600 dark:text-stone-300">Transakcja zostanie usunięta – zmieni to pozycje, gotówkę i statystyki portfela.</p>}
      </Modal>
    </Card>
  );
}
