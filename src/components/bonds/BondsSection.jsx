import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Landmark, Pencil, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { BOND_TYPES, BUILTIN_BONDS_ID, builtinBondsAccount } from '../../lib/constants.js';
import { bondSchedule, getCpiTable, valueBond } from '../../lib/bonds.js';
import { bondBelkaRate } from '../../lib/tax.js';
import { formatDate, formatPLN, formatPercent, todayISO, uid } from '../../lib/format.js';
import { Badge, Button, Card, EmptyState, IconButton, Modal, Toggle } from '../ui.jsx';
import BondForm, { emptyBond } from './BondForm.jsx';

function daysUntil(iso) {
  return Math.round((new Date(iso) - new Date(todayISO())) / 86400000);
}

export default function BondsSection() {
  const { state, actions } = useApp();
  const [form, setForm] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const today = todayISO();
  const cpi = useMemo(() => getCpiTable(state.settings), [state.settings]);
  const accountsById = Object.fromEntries(state.accounts.map((a) => [a.id, a]));

  const rows = useMemo(
    () =>
      state.bonds
        .map((b) => {
          const acc = accountsById[b.accountId];
          const belka = bondBelkaRate(b, acc);
          const v = valueBond(b, today, belka, cpi);
          const couponsGross = v.coupons.reduce((s, c) => s + c.gross, 0);
          return { bond: b, account: acc, belka, v, couponsGross, couponsNet: couponsGross * (1 - belka) };
        })
        .sort((a, b) => (a.v.maturityDate < b.v.maturityDate ? -1 : 1)),
    [state.bonds, state.settings, cpi, today], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const active = rows.filter((r) => !r.v.matured);
  const totals = {
    nominal: active.reduce((s, r) => s + r.v.nominal, 0),
    accruedNet: active.reduce((s, r) => s + r.v.accruedNet, 0),
    value: active.reduce((s, r) => s + r.v.netValue, 0),
    couponsNet: rows.reduce((s, r) => s + r.couponsNet, 0),
    yearlyIncome: active.reduce((s, r) => s + r.v.nominal * r.v.currentRate * (1 - r.belka), 0),
  };
  const nextMaturity = active[0];

  // Wbudowany rejestr obligacji – tworzony przy pierwszej transzy
  const registry = state.accounts.find((a) => a.type === 'BONDS');
  const save = (f) => {
    // Zakup transzy to wpływ kapitału do rejestru – bez osobnej wpłaty (rejestr obligacji nie ma gotówki)
    const { addDeposit, linkedCashflowId, ...bond } = f; // eslint-disable-line no-unused-vars
    let accountId = registry?.id;
    if (!accountId) accountId = actions.upsert('accounts', builtinBondsAccount(bond.purchaseDate)).id;
    const item = {
      ...bond,
      accountId,
      id: bond.id || uid('bond'),
      firstYearRate: Number(bond.firstYearRate) || 0,
      margin: Number(bond.margin) || 0,
      inflation: Number(bond.inflation) || 0,
    };
    actions.upsert('bonds', item);
    actions.notify(bond.id ? 'Zapisano transzę' : 'Dodano transzę obligacji', 'success');
    setForm(null);
  };

  return (
    <Card
      title="Obligacje Skarbowe"
      subtitle="Wbudowany rejestr poduszki finansowej (osobna kategoria, poza IKE/IKZE) · transze EDO / COI / TOS / ROR, odsetki narosłe, kupony i wykup"
      icon={Landmark}
      actions={
        <Button variant="primary" icon={Plus} onClick={() => setForm(emptyBond(registry?.id || BUILTIN_BONDS_ID))}>
          Dodaj transzę
        </Button>
      }
      bodyClassName="p-0 sm:p-0"
    >
      {registry && (
        <div className="border-b border-stone-100 px-4 py-3 sm:px-5 dark:border-white/5">
          <Toggle
            checked={registry.belkaEnabled !== false}
            onChange={(v) => actions.upsert('accounts', { ...registry, belkaEnabled: v })}
            label="Wliczaj podatek Belki (19%) od odsetek obligacji"
            description="Wyłącz, aby pokazywać odsetki brutto (np. przy samodzielnym rozliczeniu)."
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 border-b border-stone-100 px-4 py-4 sm:grid-cols-5 sm:px-5 dark:border-white/5">
        <Kpi label="Nominał aktywnych" value={formatPLN(totals.nominal)} />
        <Kpi label="Narosłe odsetki netto" value={formatPLN(totals.accruedNet)} tone="text-emerald-700 dark:text-emerald-400" />
        <Kpi label="Wartość netto dziś" value={formatPLN(totals.value)} />
        <Kpi label="Wypłacone kupony netto" value={formatPLN(totals.couponsNet)} />
        <Kpi
          label="Najbliższy wykup"
          value={nextMaturity ? formatDate(nextMaturity.v.maturityDate) : '—'}
          sub={nextMaturity ? `${nextMaturity.bond.series} · za ${daysUntil(nextMaturity.v.maturityDate)} dni` : null}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Landmark} title="Brak obligacji" description="Dodaj pierwszą transzę – wycena i odsetki policzą się automatycznie." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-stone-100 text-left text-xs text-stone-500 dark:border-white/5 dark:text-stone-400">
                <th className="w-8 px-2 py-2" />
                <th className="px-2 py-2 font-medium">Seria</th>
                <th className="px-3 py-2 font-medium">Podatek</th>
                <th className="px-3 py-2 font-medium">Zakup</th>
                <th className="px-3 py-2 text-right font-medium">Sztuk</th>
                <th className="px-3 py-2 text-right font-medium">Oprocent.</th>
                <th className="px-3 py-2 text-right font-medium">Odsetki narosłe (brutto / netto)</th>
                <th className="px-3 py-2 text-right font-medium">Wartość netto</th>
                <th className="px-3 py-2 font-medium">Wykup</th>
                <th className="px-4 py-2 text-right font-medium">Akcje</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {rows.map((r) => {
                const open = expanded === r.bond.id;
                const days = daysUntil(r.v.maturityDate);
                return (
                  <Fragment key={r.bond.id}>
                    <tr className="border-b border-stone-100 dark:border-white/5">
                      <td className="px-2 py-2">
                        <IconButton icon={open ? ChevronDown : ChevronRight} label="Harmonogram" onClick={() => setExpanded(open ? null : r.bond.id)} className="h-7 w-7" />
                      </td>
                      <td className="px-2 py-2">
                        <div className="font-semibold">{r.bond.series}</div>
                        <div className="text-xs text-stone-500 dark:text-stone-400">{BOND_TYPES[r.bond.type]?.label.split(' – ')[1]}</div>
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={r.belka === 0 ? 'green' : 'amber'}>Belka {r.belka === 0 ? '0%' : `${Math.round(r.belka * 100)}%`}</Badge>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.bond.purchaseDate)}</td>
                      <td className="px-3 py-2 text-right">
                        <div>{r.bond.quantity}</div>
                        <div className="text-xs text-stone-500">{formatPLN(r.v.nominal)}</div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="font-medium">{formatPercent(r.v.currentRate)}</div>
                        <div className="text-[11px] text-stone-500">{r.v.currentRateSource}</div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div>{formatPLN(r.v.accruedGross)}</div>
                        <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{formatPLN(r.v.accruedNet)}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{formatPLN(r.v.netValue)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div>{formatDate(r.v.maturityDate)}</div>
                        <div className="text-xs text-stone-500">{r.v.matured ? <Badge tone="blue">Wykupiona</Badge> : `za ${days} dni`}</div>
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <IconButton icon={Pencil} label="Edytuj" onClick={() => setForm({ ...r.bond })} />
                        <IconButton icon={Trash2} label="Usuń" onClick={() => setToDelete(r.bond)} className="hover:text-red-600" />
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-stone-100 bg-stone-50/70 dark:border-white/5 dark:bg-white/[0.02]">
                        <td />
                        <td colSpan={9} className="px-2 py-3">
                          <Schedule row={r} cpi={cpi} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="px-4 py-2.5 text-[11px] text-stone-500 sm:px-5 dark:text-stone-500">
        Wartość netto = nominał + narosłe odsetki po podatku (bez opłaty za przedterminowy wykup). Inflacja dla COI/EDO z tabeli CPI (miesiąc o 2 wcześniejszy niż początek okresu) lub z ręcznego odczytu transzy.
        Szacowany roczny dochód netto z aktywnych obligacji: <strong className="tabular">{formatPLN(totals.yearlyIncome)}</strong>.
      </p>

      <BondForm form={form} setForm={setForm} onSave={save} />

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title={`Usunąć transzę ${toDelete?.series}?`}
        footer={
          <>
            <Button onClick={() => setToDelete(null)}>Anuluj</Button>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={() => {
                actions.remove('bonds', toDelete.id);
                actions.notify('Usunięto transzę', 'info');
                setToDelete(null);
              }}
            >
              Usuń
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-stone-600 dark:text-stone-300">
          <p>Transza zniknie z rejestru obligacji i z wyceny majątku (razem z jej historią w statystykach).</p>
        </div>
      </Modal>
    </Card>
  );
}

function Schedule({ row, cpi }) {
  const schedule = bondSchedule(row.bond, cpi);
  const type = BOND_TYPES[row.bond.type];
  const today = todayISO();
  const list = type.periodMonths === 1 ? schedule.filter((p) => p.start <= today).slice(-6) : schedule;
  let capital = 100;
  return (
    <div>
      <div className="mb-2 text-xs font-semibold">
        Harmonogram {type.periodMonths === 1 ? '(ostatnie miesiące)' : 'okresów odsetkowych'} · {type.interestMode === 'CAPITALIZE' ? 'kapitalizacja roczna' : 'wypłata odsetek'}
      </div>
      <table className="w-full max-w-3xl text-xs">
        <thead>
          <tr className="text-left text-stone-500">
            <th className="py-1 pr-3 font-medium">Okres</th>
            <th className="py-1 pr-3 font-medium">Od – do</th>
            <th className="py-1 pr-3 text-right font-medium">Oprocentowanie</th>
            <th className="py-1 pr-3 font-medium">Źródło</th>
            <th className="py-1 pr-3 text-right font-medium">Odsetki brutto (transza)</th>
            <th className="py-1 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {list.map((p) => {
            const fraction = type.periodMonths / 12;
            const base = type.interestMode === 'CAPITALIZE' ? capital : 100;
            const interest = base * p.rate * fraction * row.bond.quantity;
            if (type.interestMode === 'CAPITALIZE') capital *= 1 + p.rate * fraction;
            const status = p.end <= today ? 'zakończony' : p.start <= today ? 'w trakcie' : 'przyszły';
            return (
              <tr key={p.index} className={status === 'w trakcie' ? 'font-semibold' : ''}>
                <td className="py-0.5 pr-3">{type.periodMonths === 1 ? `Mies. ${p.index + 1}` : `Rok ${p.index + 1}`}</td>
                <td className="py-0.5 pr-3 whitespace-nowrap">
                  {formatDate(p.start)} – {formatDate(p.end)}
                </td>
                <td className="py-0.5 pr-3 text-right">{(p.rate * 100).toFixed(2)}%</td>
                <td className={`py-0.5 pr-3 ${p.estimate ? 'text-amber-700 dark:text-amber-400' : 'text-stone-500'}`}>{p.source}</td>
                <td className="py-0.5 pr-3 text-right">{formatPLN(interest)}</td>
                <td className="py-0.5 text-stone-500">{status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({ label, value, sub, tone = '' }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">{label}</div>
      <div className={`truncate text-base font-semibold tabular ${tone}`}>{value}</div>
      {sub && <div className="truncate text-[11px] text-stone-500">{sub}</div>}
    </div>
  );
}
