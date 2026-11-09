import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Plane, Plus, Trash2, X } from 'lucide-react';
import { formatDate, formatPLN, todayISO } from '../../lib/format.js';
import { makeTrip, readTrips, tripId, tripTotals, writeTrips } from '../../lib/trips.js';
import { BetaBadge } from '../ui.jsx';

const inputCls = 'h-9 min-w-0 rounded-lg border border-stone-200 bg-white px-2.5 text-sm outline-none focus:border-blue-500 dark:border-white/10 dark:bg-neutral-800';
const btnPrimary = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:text-neutral-950';
const btnGhost = 'inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-white/5';
const tone = (v) => (v < -0.005 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400');
const range = (t) => (t.from || t.to ? `${t.from ? formatDate(t.from) : '…'} – ${t.to ? formatDate(t.to) : '…'}` : 'bez dat');

function Bar({ value }) {
  const v = Math.max(0, value || 0);
  return (
    <div className="h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-white/[0.07]">
      <div className={`h-full rounded-full ${v > 1 ? 'bg-red-500' : 'bg-gradient-to-r from-blue-600 to-sky-400'}`} style={{ width: `${Math.min(1, v) * 100}%` }} />
    </div>
  );
}

// Budżet Wakacyjny (BETA): lista wyjazdów → szczegóły wyjazdu (kategorie z planem, wydatki)
export default function TripsBudget() {
  const [trips, setTrips] = useState(readTrips);
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState(null);
  useEffect(() => writeTrips(trips), [trips]);
  const update = (id, fn) => setTrips((list) => list.map((t) => (t.id === id ? fn(t) : t)));
  const open = trips.find((t) => t.id === openId);

  if (open) {
    return (
      <TripDetail
        trip={open}
        onBack={() => setOpenId(null)}
        onChange={(fn) => update(open.id, fn)}
        onDelete={() => {
          if (!window.confirm(`Usunąć wyjazd „${open.name}” razem z wydatkami?`)) return;
          setTrips((list) => list.filter((t) => t.id !== open.id));
          setOpenId(null);
        }}
      />
    );
  }

  const sorted = [...trips].sort((a, b) => String(b.from || b.createdAt).localeCompare(String(a.from || a.createdAt)));
  const add = (e) => {
    e.preventDefault();
    if (!String(form.name).trim()) return;
    const t = makeTrip(form);
    setTrips((list) => [t, ...list]);
    setForm(null);
    setOpenId(t.id);
  };
  return (
    <div className="space-y-3" aria-label="Budżet wakacyjny">
      {form ? (
        <form onSubmit={add} className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-500/25 dark:bg-blue-500/10" aria-label="Nowy wyjazd">
          <div className="text-sm font-semibold">Nowe wakacje / wyjazd</div>
          <input className={`${inputCls} w-full`} placeholder="Nazwa, np. Lizbona 2027" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Nazwa wyjazdu" autoFocus maxLength={60} />
          <div className="grid grid-cols-3 gap-2">
            <input className={inputCls} type="number" inputMode="decimal" min="0" step="100" placeholder="Budżet (zł)" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} aria-label="Budżet ogólny wyjazdu" />
            <input className={inputCls} type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} aria-label="Data wyjazdu" />
            <input className={inputCls} type="date" value={form.to} min={form.from || undefined} onChange={(e) => setForm({ ...form, to: e.target.value })} aria-label="Data powrotu" />
          </div>
          <p className="text-[11px] text-stone-500 dark:text-stone-400">Kategorie dodadzą się same: Loty, Mieszkanie, e-SIM, Pamiątki, Transport, Atrakcje, Jedzenie – możesz dopisać własne.</p>
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={() => setForm(null)}>
              <X size={15} /> Anuluj
            </button>
            <button type="submit" className={btnPrimary} disabled={!String(form.name).trim()}>
              <Check size={15} /> Utwórz wyjazd
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className={`${btnPrimary} w-full`} onClick={() => setForm({ name: '', budget: '', from: '', to: '' })}>
          <Plus size={16} /> Dodaj nowe wakacje / wyjazd
        </button>
      )}

      {!sorted.length && !form && <p className="rounded-xl bg-stone-50 px-3 py-6 text-center text-sm text-stone-500 dark:bg-white/[0.03] dark:text-stone-400">Brak wyjazdów – dodaj pierwszy, aby planować i śledzić wydatki wakacyjne.</p>}
      <ul className="space-y-2" aria-label="Lista wyjazdów">
        {sorted.map((t) => {
          const s = tripTotals(t);
          return (
            <li key={t.id}>
              <button type="button" onClick={() => setOpenId(t.id)} className="w-full rounded-xl border border-stone-200 bg-white p-3 text-left hover:bg-stone-50 dark:border-white/10 dark:bg-neutral-900 dark:hover:bg-white/[0.03]" aria-label={`Wyjazd ${t.name}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 truncate text-sm font-semibold">
                      <Plane size={15} className="shrink-0 text-blue-600 dark:text-blue-400" /> {t.name}
                    </div>
                    <div className="text-[11px] text-stone-500 dark:text-stone-400">
                      {range(t)} · {t.expenses.length} wydatków
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-sm tabular">
                    <div className="font-semibold">{formatPLN(s.spent)}</div>
                    <div className="text-[11px] text-stone-500 dark:text-stone-400">z {formatPLN(s.budget)}</div>
                  </div>
                </div>
                <div className="mt-2">
                  <Bar value={s.progress} />
                </div>
                <div className={`mt-1 text-[11px] font-medium tabular ${tone(s.left)}`}>{s.left >= 0 ? `Pozostało ${formatPLN(s.left)}` : `Przekroczono o ${formatPLN(-s.left)}`}</div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TripDetail({ trip, onBack, onChange, onDelete }) {
  const s = tripTotals(trip);
  const [exp, setExp] = useState({ catId: trip.categories[0]?.id || '', amount: '', note: '', date: todayISO() });
  const [newCat, setNewCat] = useState('');
  const addExpense = (e) => {
    e.preventDefault();
    const amount = Math.round(Number(exp.amount) * 100) / 100;
    if (!(amount > 0) || !exp.catId) return;
    onChange((t) => ({ ...t, expenses: [{ id: tripId('e'), catId: exp.catId, amount, note: String(exp.note).trim().slice(0, 80), date: exp.date || todayISO() }, ...t.expenses] }));
    setExp({ ...exp, amount: '', note: '' });
  };
  const addCategory = (e) => {
    e.preventDefault();
    const name = newCat.trim().slice(0, 40);
    if (!name || trip.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) return;
    onChange((t) => ({ ...t, categories: [...t.categories, { id: tripId('c'), name, planned: 0 }] }));
    setNewCat('');
  };
  const catName = (id) => trip.categories.find((c) => c.id === id)?.name || '—';
  return (
    <div className="space-y-3" aria-label={`Wyjazd ${trip.name}`}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" className={btnGhost} onClick={onBack} aria-label="Wróć do listy wyjazdów">
          <ArrowLeft size={16} /> Wyjazdy
        </button>
        <button type="button" className={`${btnGhost} text-red-600 dark:text-red-400`} onClick={onDelete}>
          <Trash2 size={15} /> Usuń wyjazd
        </button>
      </div>
      <div className="rounded-xl border border-stone-200 p-3 dark:border-white/10">
        <div className="flex items-center gap-1.5 text-base font-semibold">
          <Plane size={17} className="text-blue-600 dark:text-blue-400" /> {trip.name}
        </div>
        <div className="text-[11px] text-stone-500 dark:text-stone-400">{range(trip)}</div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-sm tabular">
          <label className="min-w-0">
            <span className="block text-[11px] text-stone-500 dark:text-stone-400">Budżet</span>
            <input className={`${inputCls} w-full text-center font-semibold`} type="number" inputMode="decimal" min="0" step="100" value={trip.budget || ''} onChange={(e) => onChange((t) => ({ ...t, budget: Number(e.target.value) || 0 }))} aria-label="Budżet wyjazdu" />
          </label>
          <div>
            <span className="block text-[11px] text-stone-500 dark:text-stone-400">Wydano</span>
            <span className="block py-1.5 font-semibold">{formatPLN(s.spent)}</span>
          </div>
          <div>
            <span className="block text-[11px] text-stone-500 dark:text-stone-400">Pozostało</span>
            <span className={`block py-1.5 font-semibold ${tone(s.left)}`}>{formatPLN(s.left)}</span>
          </div>
        </div>
        <div className="mt-2">
          <Bar value={s.progress} />
        </div>
        {s.unallocated > 0.005 && <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">Nieprzydzielone do kategorii: {formatPLN(s.unallocated)}</p>}
      </div>

      <form onSubmit={addExpense} className="space-y-2 rounded-xl border border-stone-200 p-3 dark:border-white/10" aria-label="Nowy wydatek wyjazdu">
        <div className="text-sm font-semibold">Dodaj wydatek</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select className={inputCls} value={exp.catId} onChange={(e) => setExp({ ...exp, catId: e.target.value })} aria-label="Kategoria wydatku">
            {trip.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input className={inputCls} type="number" inputMode="decimal" min="0" step="0.01" placeholder="Kwota (zł)" value={exp.amount} onChange={(e) => setExp({ ...exp, amount: e.target.value })} aria-label="Kwota wydatku" />
          <input className={inputCls} placeholder="Notatka" value={exp.note} onChange={(e) => setExp({ ...exp, note: e.target.value })} aria-label="Notatka wydatku" maxLength={80} />
          <input className={inputCls} type="date" value={exp.date} onChange={(e) => setExp({ ...exp, date: e.target.value })} aria-label="Data wydatku" />
        </div>
        <div className="flex justify-end">
          <button type="submit" className={btnPrimary} disabled={!(Number(exp.amount) > 0)}>
            <Plus size={15} /> Dodaj
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-white/10">
        <table className="w-full text-[13px] tabular sm:text-sm" aria-label="Kategorie wyjazdu">
          <thead>
            <tr className="bg-stone-50 text-left text-[11px] text-stone-500 dark:bg-white/[0.03] dark:text-stone-400">
              <th className="px-2 py-2 font-medium sm:px-2.5">Kategoria</th>
              <th className="px-1.5 py-2 text-right font-medium sm:px-2.5">Plan</th>
              <th className="px-1.5 py-2 text-right font-medium sm:px-2.5">Wydano</th>
              <th className="px-1.5 py-2 text-right font-medium sm:px-2.5">Zostało</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-white/5">
            {s.cats.map((c) => (
              <tr key={c.id}>
                <td className="px-2 py-1.5 break-words sm:px-2.5">{c.name}</td>
                <td className="px-1 py-1 text-right sm:px-2.5">
                  <input className="h-8 w-16 rounded-md sm:w-24 border border-stone-200 bg-white px-2 text-right text-sm dark:border-white/10 dark:bg-neutral-800" type="number" inputMode="decimal" min="0" step="10" value={c.planned || ''} placeholder="0" onChange={(e) => onChange((t) => ({ ...t, categories: t.categories.map((x) => (x.id === c.id ? { ...x, planned: Number(e.target.value) || 0 } : x)) }))} aria-label={`Plan – ${c.name}`} />
                </td>
                <td className="px-1.5 py-1.5 text-right whitespace-nowrap sm:px-2.5">{formatPLN(c.spent)}</td>
                <td className={`px-1.5 py-1.5 text-right whitespace-nowrap sm:px-2.5 ${c.planned ? tone(c.left) : 'text-stone-400'}`}>{c.planned ? formatPLN(c.left) : '—'}</td>
                <td className="pr-1 text-right">
                  {!c.builtin && !c.spent && (
                    <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-stone-400 hover:text-red-600" onClick={() => onChange((t) => ({ ...t, categories: t.categories.filter((x) => x.id !== c.id) }))} aria-label={`Usuń kategorię ${c.name}`}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={addCategory} className="flex gap-2 border-t border-stone-100 p-2 dark:border-white/5" aria-label="Nowa kategoria wyjazdu">
          <input className={`${inputCls} flex-1`} placeholder="Własna kategoria, np. Ubezpieczenie" value={newCat} onChange={(e) => setNewCat(e.target.value)} aria-label="Nazwa nowej kategorii" maxLength={40} />
          <button type="submit" className={btnGhost} disabled={!newCat.trim()}>
            <Plus size={15} /> Dodaj
          </button>
        </form>
      </div>

      {trip.expenses.length > 0 && (
        <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 dark:divide-white/5 dark:border-white/10" aria-label="Wydatki wyjazdu">
          {trip.expenses.map((e) => (
            <li key={e.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="w-20 shrink-0 text-[11px] text-stone-500 tabular dark:text-stone-400">{formatDate(e.date)}</span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{catName(e.catId)}</span>
                {e.note && <span className="text-stone-500 dark:text-stone-400"> · {e.note}</span>}
              </span>
              <span className="shrink-0 font-semibold tabular">{formatPLN(e.amount)}</span>
              <button type="button" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-stone-400 hover:text-red-600" onClick={() => onChange((t) => ({ ...t, expenses: t.expenses.filter((x) => x.id !== e.id) }))} aria-label={`Usuń wydatek ${catName(e.catId)} ${e.amount}`}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-center text-[11px] text-stone-400">
        Budżet wakacyjny <BetaBadge /> – zapis na Twoim koncie (urządzenie i chmura).
      </p>
    </div>
  );
}
