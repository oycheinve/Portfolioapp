import { useMemo } from 'react';
import { useApp } from '../../state/AppContext.jsx';
import { BOND_TYPES } from '../../lib/constants.js';
import { belkaRateForAccount } from '../../lib/tax.js';
import { bondSchedule, getCpiTable } from '../../lib/bonds.js';
import { formatDate, formatPLN, todayISO } from '../../lib/format.js';
import { Badge, Button, Field, Input, Modal, Select, Toggle } from '../ui.jsx';

// Typowe parametry emisji (do szybkiego uzupełnienia – zawsze do weryfikacji z listem emisyjnym)
const TYPE_DEFAULTS = {
  ROR: { firstYearRate: 4.25, margin: 0, inflation: 4.0 },
  TOS: { firstYearRate: 4.65, margin: 0, inflation: 0 },
  COI: { firstYearRate: 5.0, margin: 1.5, inflation: 3.0 },
  EDO: { firstYearRate: 5.6, margin: 2.0, inflation: 3.0 },
};

export function suggestSeries(type, purchaseDate) {
  const t = BOND_TYPES[type];
  if (!t || !purchaseDate) return type;
  const [y, m] = purchaseDate.split('-').map(Number);
  const end = new Date(y, m - 1 + t.years * 12, 1);
  return `${type}${String(end.getMonth() + 1).padStart(2, '0')}${String(end.getFullYear()).slice(2)}`;
}

export function emptyBond(accountId) {
  const date = todayISO();
  return { id: null, type: 'EDO', series: suggestSeries('EDO', date), accountId, purchaseDate: date, quantity: 10, ...TYPE_DEFAULTS.EDO, inflationByYear: {}, addDeposit: true };
}

export default function BondForm({ form, setForm, onSave }) {
  const { state } = useApp();
  const open = !!form;
  const f = form || emptyBond('');
  const type = BOND_TYPES[f.type];
  // Wbudowany rejestr obligacji (osobna kategoria poduszki, nigdy IKE/IKZE)
  const account = state.accounts.find((a) => a.id === f.accountId) || state.accounts.find((a) => a.type === 'BONDS');
  const accountBelka = account ? belkaRateForAccount(account) : 0.19;
  const belka = f.belkaEnabled === false ? 0 : accountBelka;
  const cpi = useMemo(() => getCpiTable(state.settings), [state.settings]);
  const schedule = useMemo(() => (open && f.purchaseDate ? bondSchedule({ ...f, quantity: Number(f.quantity) || 0 }, cpi) : []), [open, f, cpi]);
  const set = (patch) => setForm({ ...f, ...patch });

  const onTypeChange = (t) => {
    const autoSeries = !f.series || f.series === suggestSeries(f.type, f.purchaseDate);
    set({ type: t, ...TYPE_DEFAULTS[t], series: autoSeries ? suggestSeries(t, f.purchaseDate) : f.series, inflationByYear: {} });
  };
  const onDateChange = (d) => {
    const autoSeries = !f.series || f.series === suggestSeries(f.type, f.purchaseDate);
    set({ purchaseDate: d, series: autoSeries ? suggestSeries(f.type, d) : f.series });
  };

  const qty = Math.floor(Number(f.quantity) || 0);
  const errors = [];
  if (qty <= 0) errors.push('Liczba sztuk > 0');
  if (!f.purchaseDate) errors.push('Data zakupu');
  const cpiYears = type?.indexed === 'CPI' ? Array.from({ length: type.years - 1 }, (_, i) => i + 2) : [];

  return (
    <Modal
      open={open}
      onClose={() => setForm(null)}
      title={f.id ? `Edytuj transzę ${f.series}` : 'Nowa transza obligacji'}
      footer={
        <>
          <Button onClick={() => setForm(null)}>Anuluj</Button>
          <Button variant="primary" disabled={errors.length > 0} onClick={() => onSave({ ...f, quantity: qty })}>
            Zapisz
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Typ obligacji" className="col-span-2 sm:col-span-1">
            <Select value={f.type} onChange={(e) => onTypeChange(e.target.value)}>
              {Object.values(BOND_TYPES).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Seria" className="col-span-2 sm:col-span-1">
            <Input value={f.series} onChange={(e) => set({ series: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Data zakupu">
            <Input type="date" value={f.purchaseDate} max={todayISO()} onChange={(e) => onDateChange(e.target.value)} />
          </Field>
          <Field label="Liczba sztuk (×100 zł)" hint={`Nominał: ${formatPLN(qty * 100)}`}>
            <Input type="number" min="1" step="1" value={f.quantity} onChange={(e) => set({ quantity: e.target.value })} />
          </Field>
          <Field label={type?.indexed === 'NBP' ? 'Oprocentowanie 1. miesiąca (%)' : 'Oprocentowanie 1. roku (%)'}>
            <Input type="number" step="0.01" value={f.firstYearRate} onChange={(e) => set({ firstYearRate: e.target.value })} />
          </Field>
          {type?.indexed !== 'FIXED' && (
            <Field label="Marża (%)">
              <Input type="number" step="0.01" value={f.margin} onChange={(e) => set({ margin: e.target.value })} />
            </Field>
          )}
          {type?.indexed !== 'FIXED' && (
            <Field
              label={type?.indexed === 'NBP' ? 'Stopa referencyjna NBP (%)' : 'Założona inflacja przyszła (%)'}
              hint={type?.indexed === 'NBP' ? 'Oprocentowanie od 2. miesiąca = stopa NBP + marża' : 'Używana, gdy brak odczytu CPI dla danego roku'}
              className="col-span-2 sm:col-span-1"
            >
              <Input type="number" step="0.1" value={f.inflation} onChange={(e) => set({ inflation: e.target.value })} />
            </Field>
          )}
        </div>

        {accountBelka > 0 && (
          <Toggle
            checked={f.belkaEnabled !== false}
            onChange={(v) => set({ belkaEnabled: v })}
            label="Wliczaj podatek Belki (19%)"
            description="Wyłącz, aby pokazywać odsetki brutto (np. gdy rozliczasz podatek samodzielnie lub transza jest zwolniona)."
          />
        )}

        {cpiYears.length > 0 && (
          <div>
            <div className="mb-1.5 text-xs font-semibold text-stone-600 dark:text-stone-300">Odczyty inflacji dla kolejnych lat (opcjonalnie – nadpisują tabelę CPI)</div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {cpiYears.map((y) => {
                const auto = schedule[(y - 1) * (12 / type.periodMonths)];
                return (
                  <Field key={y} label={`Rok ${y}`}>
                    <Input
                      type="number"
                      step="0.1"
                      value={f.inflationByYear?.[y] ?? ''}
                      placeholder={auto?.inflation !== null && auto?.inflation !== undefined ? (auto.inflation * 100).toFixed(1) : ''}
                      onChange={(e) => {
                        const next = { ...(f.inflationByYear || {}) };
                        if (e.target.value === '') delete next[y];
                        else next[y] = Number(e.target.value);
                        set({ inflationByYear: next });
                      }}
                    />
                  </Field>
                );
              })}
            </div>
          </div>
        )}

        {schedule.length > 0 && (
          <div className="rounded-lg bg-stone-50 p-3 text-xs dark:bg-white/[0.03]">
            <div className="mb-1 flex justify-between font-medium">
              <span>Harmonogram</span>
              <span>Wykup: {formatDate(schedule[schedule.length - 1].end)}</span>
            </div>
            <div className="max-h-32 overflow-y-auto">
              {(type.periodMonths === 1 ? schedule.slice(0, 2) : schedule).map((p) => (
                <div key={p.index} className="flex justify-between tabular text-stone-600 dark:text-stone-300">
                  <span>
                    {type.periodMonths === 1 ? `Mies. ${p.index + 1}` : `Rok ${p.index + 1}`} ({formatDate(p.start)})
                  </span>
                  <span>
                    {(p.rate * 100).toFixed(2)}% <span className="text-stone-400">· {p.source}</span>
                  </span>
                </div>
              ))}
              {type.periodMonths === 1 && <div className="text-stone-500">… kolejne miesiące wg stopy NBP + marża</div>}
            </div>
          </div>
        )}

        {!f.id && (
          <Toggle
            checked={!!f.addDeposit}
            onChange={(v) => set({ addDeposit: v })}
            label="Zapisz wpłatę własną w wysokości nominału"
            description="Obligacje to osobny rejestr poduszki finansowej (poza IKE/IKZE) – wpłata pokrywa zakup. Bez niej brak środków uzupełni automatyczne „Uzupełnienie środków”."
          />
        )}
        <Badge tone={belka === 0 ? 'green' : 'amber'}>Belka {belka === 0 ? '0%' : `${Math.round(belka * 100)}%`} – rejestr „Obligacje skarbowe” (poduszka finansowa)</Badge>
      </div>
    </Modal>
  );
}
