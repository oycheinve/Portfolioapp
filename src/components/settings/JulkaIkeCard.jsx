import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Check, Lock, Pencil, PiggyBank, RefreshCw, Trash2, X } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { JULKA_ETF, buildPurchase, calcPurchase, correctPurchase, currentQuote, julkaSummary, readJulka, runJulkaAuto, sortPurchases, writeJulka } from '../../lib/julkaIke.js';
import { formatDate, formatDateTime, formatPLN, todayISO } from '../../lib/format.js';
import { Card, Field, Input, Toggle } from '../ui.jsx';

const num4 = (v) => (Number(v) || 0).toLocaleString('pl-PL', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const eur = (v, d = 2) => `${(Number(v) || 0).toLocaleString('pl-PL', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
const pct = (v) => (v === null ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);
const tone = (v) => (v === null ? '' : v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400');

function Tile({ label, value, sub, className = '' }) {
  return (
    <div className="min-w-0 rounded-xl bg-stone-50 px-3 py-2.5 dark:bg-white/[0.03]">
      <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">{label}</div>
      <div className={`truncate text-base font-semibold tabular ${className}`}>{value}</div>
      {sub && <div className="truncate text-[11px] text-stone-500 dark:text-stone-500">{sub}</div>}
    </div>
  );
}

// Ustawienia → „IKE - Julka”: osobne konto (poza portfelem) – zakupy ETF IE00BK5BQT80 za stałą kwotę miesięcznie
const zakupy = (n) => `${n} ${n === 1 ? 'zakup' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'zakupy' : 'zakupów'}`;

export default function JulkaIkeCard() {
  const { actions } = useApp();
  const today = todayISO();
  const [data, setDataState] = useState(readJulka);
  const setData = (fn) =>
    setDataState((d) => {
      const next = typeof fn === 'function' ? fn(d) : fn;
      writeJulka(next);
      return next;
    });
  const [busy, setBusy] = useState('');
  const [date, setDate] = useState(today);
  const [manual, setManual] = useState(null); // { date, fx, price } – gdy notowań nie da się pobrać
  const [edit, setEdit] = useState(null);

  const purchases = useMemo(() => sortPurchases(data.purchases), [data.purchases]);
  const s = julkaSummary(data.purchases, data.lastQuote);

  const refreshQuote = async (silent = false) => {
    setBusy('quote');
    try {
      const q = await currentQuote();
      setData((d) => ({ ...d, lastQuote: q }));
    } catch (e) {
      if (!silent) actions.notify(`IKE - Julka: nie udało się pobrać notowań (${e.message})`, 'warn');
    } finally {
      setBusy('');
    }
  };

  // Po otwarciu: zaległe zakupy automatyczne i bieżące notowanie (wycena)
  useEffect(() => {
    (async () => {
      const r = await runJulkaAuto(today);
      if (r.added.length) {
        setDataState(r.data);
        actions.notify(`IKE - Julka: dopisano ${r.added.length} automatyczny zakup (${r.added.map((p) => formatDate(p.date)).join(', ')})`, 'success');
      }
      if (r.errors.length) actions.notify(`IKE - Julka: ${r.errors[0]}`, 'warn');
      const q = readJulka().lastQuote;
      if (!q || Date.now() - new Date(q.at).getTime() > 15 * 60000) refreshQuote(true);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addPurchase = async () => {
    if (!date || date > today) return actions.notify('Wybierz dzień zakupu (najpóźniej dziś)', 'warn');
    setBusy('add');
    try {
      const p = await buildPurchase(data, date, today);
      setData((d) => ({ ...d, purchases: [...d.purchases, p] }));
      actions.notify(`Dodano zakup ${formatDate(date)}: ${num4(p.units)} j. po ${eur(p.price)}`, 'success');
      setManual(null);
    } catch (e) {
      actions.notify(`Nie udało się pobrać kursów z ${formatDate(date)} – wpisz je ręcznie (${e.message})`, 'warn');
      setManual({ date, fx: '', price: '' });
    } finally {
      setBusy('');
    }
    return undefined;
  };
  const addManual = () => {
    const calc = calcPurchase({ amountPLN: data.amount, fxRate: manual.fx, price: manual.price, fxFeePct: data.fxFeePct });
    if (!(calc.units > 0)) return actions.notify('Podaj kurs EUR/PLN i cenę ETF', 'warn');
    setData((d) => ({ ...d, purchases: [...d.purchases, { id: `jk_${Date.now().toString(36)}`, date: manual.date, ...calc, currency: JULKA_ETF.currency, priceDate: manual.date, fxDate: manual.date, source: 'ręcznie', manual: true }] }));
    setManual(null);
    return undefined;
  };
  const remove = (p) => {
    if (!window.confirm(`Usunąć zakup z ${formatDate(p.date)} (${num4(p.units)} j.)?`)) return;
    setData((d) => ({ ...d, purchases: d.purchases.filter((x) => x.id !== p.id) }));
  };
  const saveEdit = () => {
    setData((d) => ({ ...d, purchases: d.purchases.map((x) => (x.id === edit.id ? correctPurchase(x, { date: edit.date, amountPLN: Number(edit.amountPLN), fxRate: Number(edit.fxRate), price: Number(edit.price), fxFeePct: Number(edit.fxFeePct), units: edit.unitsOverride ? edit.units : undefined }) : x)) }));
    setEdit(null);
  };
  const setOpt = (patch) => setData((d) => ({ ...d, ...patch }));
  const inputSm = 'h-8 w-full min-w-0 rounded-md border border-stone-200 bg-white px-1.5 text-xs dark:border-white/10 dark:bg-neutral-800';

  return (
    <div className="space-y-3">
      <Card title="IKE - Julka" subtitle={`${JULKA_ETF.name} · ${JULKA_ETF.isin} (${JULKA_ETF.symbol})`} icon={PiggyBank}>
        <p className="mb-3 flex items-start gap-1.5 rounded-lg bg-stone-50 px-2.5 py-2 text-[11px] text-stone-500 dark:bg-white/[0.03] dark:text-stone-400">
          <Lock size={12} className="mt-0.5 shrink-0" /> Konto odizolowane: nie wchodzi do Majątku, Portfela, Wykresów, statystyk, limitów Twojego IKE, kalkulatorów ani raportów. Zapis osobno (urządzenie + chmura).
        </p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Tile label="Łącznie wpłacono" value={formatPLN(s.deposited)} sub={`${zakupy(data.purchases.length)} · przewalutowanie ${formatPLN(s.fees)}`} />
          <Tile label={`Jednostki ${JULKA_ETF.isin}`} value={num4(s.units)} sub={s.avgPricePLN ? `średnio ${formatPLN(s.avgPricePLN)} / j.` : null} />
          <Tile label="Aktualna wartość" value={s.value === null ? '—' : formatPLN(s.value)} sub={data.lastQuote ? `${eur(data.lastQuote.price)} × ${(data.lastQuote.fx || 0).toLocaleString('pl-PL', { maximumFractionDigits: 4 })} zł` : 'brak notowania'} />
          <Tile label="Zysk / strata" value={s.pl === null ? '—' : formatPLN(s.pl, { sign: true })} sub={pct(s.plPct)} className={tone(s.pl)} />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-500 dark:text-stone-400">
          <span>{data.lastQuote ? `Notowanie: ${formatDateTime(data.lastQuote.at)} · ${data.lastQuote.source || ''}` : 'Wycena po pobraniu notowania'}</span>
          <button type="button" onClick={() => refreshQuote(false)} disabled={!!busy} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:text-blue-300 dark:hover:bg-blue-500/10">
            <RefreshCw size={13} className={busy === 'quote' ? 'animate-spin' : ''} /> Odśwież wycenę
          </button>
        </div>
      </Card>

      <Card title="Zakupy miesięczne" subtitle="Kwota, przewalutowanie i automatyczne dopisywanie" icon={CalendarPlus}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Kwota (zł)">
            <Input type="number" min="1" step="10" value={data.amount} onChange={(e) => setOpt({ amount: Math.max(0, Number(e.target.value) || 0) })} aria-label="Kwota zakupu" />
          </Field>
          <Field label="Przewalutowanie (%)" hint="jak na IKE w XTB">
            <Input type="number" min="0" step="0.01" value={data.fxFeePct} onChange={(e) => setOpt({ fxFeePct: Math.max(0, Number(e.target.value) || 0) })} aria-label="Prowizja za przewalutowanie" />
          </Field>
          <Field label="Data zakupu" className="col-span-2 sm:col-span-1">
            <Input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Data zakupu" />
          </Field>
          <div className="col-span-2 flex items-end sm:col-span-1">
            <button type="button" onClick={addPurchase} disabled={!!busy || !(data.amount > 0)} className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 dark:bg-blue-500 dark:text-neutral-950">
              {busy === 'add' ? <RefreshCw size={15} className="animate-spin" /> : <CalendarPlus size={15} />} Dodaj zakup miesięczny ({formatPLN(data.amount, { digits: 0 })})
            </button>
          </div>
        </div>
        {manual && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-500/25 dark:bg-amber-500/[0.08]" role="group" aria-label="Kursy ręcznie">
            <div className="text-xs font-semibold text-amber-900 dark:text-amber-200">Kursy z {formatDate(manual.date)} – wpisz ręcznie</div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Field label="Kurs EUR/PLN">
                <Input type="number" step="0.0001" value={manual.fx} onChange={(e) => setManual({ ...manual, fx: e.target.value })} aria-label="Kurs EUR/PLN ręcznie" />
              </Field>
              <Field label="Cena ETF (€)">
                <Input type="number" step="0.01" value={manual.price} onChange={(e) => setManual({ ...manual, price: e.target.value })} aria-label="Cena ETF ręcznie" />
              </Field>
              <div className="col-span-2 flex items-end gap-2">
                <button type="button" onClick={addManual} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 text-sm font-semibold text-neutral-950 hover:bg-amber-400">
                  <Check size={15} /> Dodaj ({num4(calcPurchase({ amountPLN: data.amount, fxRate: manual.fx, price: manual.price, fxFeePct: data.fxFeePct }).units)} j.)
                </button>
                <button type="button" onClick={() => setManual(null)} aria-label="Anuluj" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-stone-500 hover:bg-white/60 dark:hover:bg-white/5">
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="mt-4 border-t border-stone-100 pt-3 dark:border-white/5">
          <Toggle checked={!!data.autoEnabled} onChange={(v) => setOpt({ autoEnabled: v, autoFrom: v ? data.autoFrom || today.slice(0, 7) : data.autoFrom })} label="Automatycznie dopisuj zakup raz w miesiącu" description={data.autoEnabled ? `Wybranego dnia każdego miesiąca od ${data.autoFrom || today.slice(0, 7)} – przy otwarciu aplikacji, z kursami z tego dnia (pomija miesiące, w których jest już zakup).` : 'Po włączeniu aplikacja sama doda zakup za stałą kwotę w wybranym dniu miesiąca.'} />
          {data.autoEnabled && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:w-96">
              <Field label="Dzień miesiąca">
                <Input type="number" min="1" max="28" value={data.autoDay} onChange={(e) => setOpt({ autoDay: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })} aria-label="Dzień miesiąca zakupu" />
              </Field>
              <Field label="Od miesiąca">
                <Input type="month" value={data.autoFrom || ''} max={today.slice(0, 7)} onChange={(e) => setOpt({ autoFrom: e.target.value || today.slice(0, 7) })} aria-label="Pierwszy miesiąc automatycznych zakupów" />
              </Field>
            </div>
          )}
        </div>
      </Card>

      <Card title="Historia zakupów" subtitle="Kurs waluty, przewalutowanie, cena ETF i wyliczone jednostki" bodyClassName="p-0 sm:p-0">
        {!purchases.length ? (
          <p className="px-4 py-6 text-center text-sm text-stone-500 dark:text-stone-400">Brak zakupów – dodaj pierwszy przyciskiem „Dodaj zakup miesięczny”.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-xs tabular" aria-label="Historia zakupów IKE - Julka">
              <thead>
                <tr className="border-b border-stone-100 text-left text-[11px] text-stone-500 dark:border-white/5 dark:text-stone-400">
                  <th className="px-3 py-2 font-medium">Data</th>
                  <th className="px-2 py-2 text-right font-medium">Kwota</th>
                  <th className="px-2 py-2 text-right font-medium">EUR/PLN · przewal.</th>
                  <th className="px-2 py-2 text-right font-medium">Cena ETF</th>
                  <th className="px-2 py-2 text-right font-medium">Jednostki</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-white/5">
                {purchases.map((p) =>
                  edit?.id === p.id ? (
                    <tr key={p.id} className="bg-blue-50/40 dark:bg-blue-500/[0.05]">
                      <td className="px-2 py-1.5"><input type="date" className={inputSm} value={edit.date} max={today} onChange={(e) => setEdit({ ...edit, date: e.target.value })} aria-label="Data (korekta)" /></td>
                      <td className="px-1 py-1.5"><input type="number" className={inputSm} value={edit.amountPLN} onChange={(e) => setEdit({ ...edit, amountPLN: e.target.value })} aria-label="Kwota (korekta)" /></td>
                      <td className="px-1 py-1.5">
                        <input type="number" step="0.0001" className={inputSm} value={edit.fxRate} onChange={(e) => setEdit({ ...edit, fxRate: e.target.value })} aria-label="Kurs EUR/PLN (korekta)" />
                        <input type="number" step="0.01" className={`${inputSm} mt-1`} value={edit.fxFeePct} onChange={(e) => setEdit({ ...edit, fxFeePct: e.target.value })} aria-label="Przewalutowanie % (korekta)" title="Przewalutowanie %" />
                      </td>
                      <td className="px-1 py-1.5"><input type="number" step="0.01" className={inputSm} value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} aria-label="Cena ETF (korekta)" /></td>
                      <td className="px-1 py-1.5">
                        <input type="number" step="0.0001" className={inputSm} value={edit.unitsOverride ? edit.units : calcPurchase({ amountPLN: edit.amountPLN, fxRate: edit.fxRate, price: edit.price, fxFeePct: edit.fxFeePct }).units} onChange={(e) => setEdit({ ...edit, units: e.target.value, unitsOverride: true })} aria-label="Jednostki (korekta)" title="Puste przeliczenie – wpisz, aby podać liczbę z potwierdzenia brokera" />
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <button type="button" onClick={saveEdit} aria-label="Zapisz korektę" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"><Check size={15} /></button>
                        <button type="button" onClick={() => setEdit(null)} aria-label="Anuluj korektę" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 dark:hover:bg-white/5"><X size={15} /></button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={p.id}>
                      <td className="px-3 py-2">
                        {formatDate(p.date)}
                        <span className="block text-[10px] text-stone-400">{p.auto ? 'automatycznie' : p.manual ? 'korekta ręczna' : 'ręcznie'}{p.priceDate && p.priceDate !== p.date ? ` · notowanie ${formatDate(p.priceDate)}` : ''}</span>
                      </td>
                      <td className="px-2 py-2 text-right">{formatPLN(p.amountPLN)}</td>
                      <td className="px-2 py-2 text-right">
                        {(Number(p.fxRate) || 0).toLocaleString('pl-PL', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                        <span className="block text-[10px] text-stone-400">−{formatPLN(p.feePLN)} ({String(p.fxFeePct).replace('.', ',')}%) → {eur(p.amountCcy)}</span>
                      </td>
                      <td className="px-2 py-2 text-right">{eur(p.price)}</td>
                      <td className="px-2 py-2 text-right font-semibold">{num4(p.units)}</td>
                      <td className="px-2 py-2 whitespace-nowrap text-right">
                        <button type="button" onClick={() => setEdit({ id: p.id, date: p.date, amountPLN: p.amountPLN, fxRate: p.fxRate, price: p.price, fxFeePct: p.fxFeePct, units: p.units, unitsOverride: false })} aria-label={`Popraw zakup ${p.date}`} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-white/5"><Pencil size={13} /></button>
                        <button type="button" onClick={() => remove(p)} aria-label={`Usuń zakup ${p.date}`} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
