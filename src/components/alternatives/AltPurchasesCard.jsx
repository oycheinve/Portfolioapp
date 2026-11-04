import { useState } from 'react';
import { Check, Gem, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { ALT_ASSETS, altSettings, purchaseStats, purchaseTotalPLN } from '../../lib/alternatives.js';
import { formatDate, formatPLN, todayISO } from '../../lib/format.js';
import { BetaBadge, Button, Card, Field, IconButton, Input, Segmented } from '../ui.jsx';

const qtyFmt = (v, digits) => (Number(v) || 0).toLocaleString('pl-PL', { maximumFractionDigits: digits });
const money = (v, ccy) => `${(Number(v) || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ccy === 'USD' ? '$' : 'zł'}`;
const newId = () => `altp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Rejestr zakupów surowców i krypto (BETA) – zakładka Wpłaty. Na jego podstawie moduł Surowce i Krypto liczy ilość
// i średnią cenę nabycia (średnia ważona: Σ kwot PLN / Σ jednostek), a z bieżącą ceną z Yahoo – zysk / stratę.
export default function AltPurchasesCard() {
  const { state, actions } = useApp();
  const alt = altSettings(state);
  const purchases = alt.purchases || [];
  const [asset, setAsset] = useState('gold');
  const [form, setForm] = useState(null); // { id?, date, qty, unit, unitPrice, currency, fx }
  const meta = ALT_ASSETS.find((a) => a.id === asset);
  const usdNow = Number(alt.quotes?.fx?.USD?.price) || 0;
  const save = (list) => actions.updateSettings({ alternatives: { ...altSettings(state), purchases: list } });
  const list = purchases.filter((p) => p.asset === asset).sort((a, b) => (a.date < b.date ? 1 : -1));
  const displayUnit = meta.metal ? alt.holdings?.[asset]?.unit || 'g' : 'szt.';
  const st = purchaseStats(state, asset, displayUnit);

  const startAdd = () => setForm({ date: todayISO(), qty: '', unit: meta.metal ? displayUnit : 'szt.', unitPrice: '', currency: meta.metal ? 'PLN' : 'USD', fx: usdNow ? usdNow.toFixed(4) : '' });
  const submit = () => {
    const entry = { id: form.id || newId(), asset, date: form.date, qty: Number(form.qty), unit: meta.metal ? form.unit : 'szt.', unitPrice: Number(form.unitPrice), currency: form.currency, fx: form.currency === 'USD' ? Number(form.fx) : null };
    if (!entry.date || !(entry.qty > 0) || !(entry.unitPrice > 0) || (entry.currency === 'USD' && !(entry.fx > 0))) return actions.notify('Uzupełnij datę, ilość, cenę jednostkową' + (form.currency === 'USD' ? ' i kurs USD/PLN' : ''), 'warn');
    save(form.id ? purchases.map((p) => (p.id === form.id ? entry : p)) : [...purchases, entry]);
    actions.notify(form.id ? 'Zapisano zmiany zakupu' : `Dodano zakup: ${meta.label}`, 'success');
    setForm(null);
    return undefined;
  };
  const remove = (p) => {
    if (!window.confirm(`Usunąć zakup z ${formatDate(p.date)} (${qtyFmt(p.qty, meta.digits)} ${p.unit})?`)) return;
    save(purchases.filter((x) => x.id !== p.id));
  };
  const preview = form ? purchaseTotalPLN({ ...form, qty: Number(form.qty), unitPrice: Number(form.unitPrice), fx: Number(form.fx) }) : 0;

  return (
    <Card
      collapsible
      defaultOpen
      storageKey="fintrack-alt-purchases-open"
      title={
        <>
          Zakupy surowców i krypto
          <BetaBadge />
        </>
      }
      summary={`${purchases.length} zakupów · średnie ceny nabycia w module Surowce i Krypto`}
      subtitle="Historia zakupów – na jej podstawie liczona jest ilość i średnia cena nabycia"
      icon={Gem}
    >
      <Segmented
        size="sm"
        value={asset}
        onChange={(v) => {
          setAsset(v);
          setForm(null);
        }}
        ariaLabel="Aktywo"
        options={ALT_ASSETS.map((a) => ({ value: a.id, label: `${a.label}${purchases.some((p) => p.asset === a.id) ? ` (${purchases.filter((p) => p.asset === a.id).length})` : ''}` }))}
      />

      <div className="mt-3 grid grid-cols-3 gap-2" aria-label={`Podsumowanie zakupów – ${meta.label}`}>
        <div className="min-w-0 rounded-xl bg-stone-50 px-3 py-2 dark:bg-white/[0.03]">
          <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">Kupiono</div>
          <div className="truncate text-sm font-semibold tabular">{st ? `${qtyFmt(st.qty, meta.digits)} ${st.unit}` : '—'}</div>
        </div>
        <div className="min-w-0 rounded-xl bg-stone-50 px-3 py-2 dark:bg-white/[0.03]">
          <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">Średnia cena nabycia</div>
          <div className="truncate text-sm font-semibold tabular">{st ? `${formatPLN(st.avgPricePLN)} / ${meta.metal ? displayUnit : 'szt.'}` : '—'}</div>
        </div>
        <div className="min-w-0 rounded-xl bg-stone-50 px-3 py-2 dark:bg-white/[0.03]">
          <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">Łącznie (PLN)</div>
          <div className="truncate text-sm font-semibold tabular">{st ? formatPLN(st.totalPLN) : '—'}</div>
        </div>
      </div>

      {form ? (
        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-500/25 dark:bg-blue-500/10">
          <div className="mb-2 text-sm font-semibold">{form.id ? 'Edycja zakupu' : 'Nowy zakup'} – {meta.label}</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Data">
              <Input type="date" value={form.date} max={todayISO()} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label="Data zakupu" />
            </Field>
            <Field label={`Ilość${meta.metal ? '' : ' (szt.)'}`}>
              <Input type="number" inputMode="decimal" min="0" step="any" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} aria-label="Kupiona ilość" />
            </Field>
            {meta.metal && (
              <Field label="Jednostka">
                <Segmented size="sm" value={form.unit} onChange={(u) => setForm({ ...form, unit: u })} ariaLabel="Jednostka zakupu" options={[{ value: 'g', label: 'g' }, { value: 'oz', label: 'oz' }]} />
              </Field>
            )}
            <Field label={`Cena za 1 ${meta.metal ? form.unit : 'szt.'}`}>
              <Input type="number" inputMode="decimal" min="0" step="any" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} aria-label="Cena jednostkowa" />
            </Field>
            <Field label="Waluta ceny">
              <Segmented size="sm" value={form.currency} onChange={(c) => setForm({ ...form, currency: c })} ariaLabel="Waluta ceny zakupu" options={[{ value: 'PLN', label: 'PLN' }, { value: 'USD', label: 'USD' }]} />
            </Field>
            {form.currency === 'USD' && (
              <Field label="Kurs USD/PLN">
                <Input type="number" inputMode="decimal" min="0" step="0.0001" value={form.fx} onChange={(e) => setForm({ ...form, fx: e.target.value })} aria-label="Kurs USD/PLN zakupu" />
              </Field>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm tabular">
              Łącznie: <strong>{formatPLN(preview)}</strong>
            </span>
            <div className="flex gap-2">
              <Button size="sm" icon={X} onClick={() => setForm(null)}>
                Anuluj
              </Button>
              <Button size="sm" variant="primary" icon={Check} onClick={submit}>
                {form.id ? 'Zapisz' : 'Dodaj zakup'}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <Button size="sm" icon={Plus} onClick={startAdd}>
            Dodaj zakup – {meta.label}
          </Button>
        </div>
      )}

      {list.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-sm tabular" aria-label={`Zakupy – ${meta.label}`}>
            <thead>
              <tr className="text-left text-[11px] text-stone-500 dark:text-stone-400">
                <th className="py-1.5 font-medium">Data</th>
                <th className="py-1.5 text-right font-medium">Ilość</th>
                <th className="py-1.5 text-right font-medium">Cena jedn.</th>
                <th className="py-1.5 text-right font-medium">Kwota PLN</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-white/5">
              {list.map((p) => (
                <tr key={p.id}>
                  <td className="py-1.5">{formatDate(p.date)}</td>
                  <td className="py-1.5 text-right">
                    {qtyFmt(p.qty, meta.digits)} {p.unit}
                  </td>
                  <td className="py-1.5 text-right">
                    {money(p.unitPrice, p.currency)}
                    {p.currency === 'USD' && <span className="block text-[10px] text-stone-400">kurs {Number(p.fx).toFixed(4)}</span>}
                  </td>
                  <td className="py-1.5 text-right font-semibold">{formatPLN(purchaseTotalPLN(p))}</td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    <IconButton icon={Pencil} label={`Edytuj zakup ${p.date}`} onClick={() => setForm({ ...p, qty: String(p.qty), unitPrice: String(p.unitPrice), fx: p.fx ? String(p.fx) : usdNow ? usdNow.toFixed(4) : '' })} />
                    <IconButton icon={Trash2} label={`Usuń zakup ${p.date}`} onClick={() => remove(p)} className="hover:text-red-600" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">Brak zakupów – {meta.label.toLowerCase()} liczone z ręcznie wpisanej ilości i ceny w module Surowce i Krypto.</p>
      )}
    </Card>
  );
}
