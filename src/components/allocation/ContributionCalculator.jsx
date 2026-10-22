import { useMemo, useState } from 'react';
import { AlertTriangle, Calculator, Check, ClipboardCopy, Droplets, Info } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { planContribution } from '../../lib/allocation.js';
import { accountFxPct, computeLimitUsage, fxConversionPct, isoDay, livePriceLookup, valuePortfolio } from '../../lib/engine.js';
import { ACCOUNT_TYPES } from '../../lib/constants.js';
import { formatDate, formatMoney, formatNumber, formatPLN, formatPercent, todayISO } from '../../lib/format.js';
import { Badge, Card, Field, Select, Toggle } from '../ui.jsx';
import { instrumentColorMap } from './AllocationDonut.jsx';

const QUICK_AMOUNTS = [500, 1000, 1500, 3000];
const MIN_ORDERS = [
  { value: 0, label: 'Brak' },
  { value: 100, label: '100 zł' },
  { value: 200, label: '200 zł' },
  { value: 500, label: '500 zł' },
];

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export function buildPlanText({ plan, account, instrumentsById, fractional }) {
  const lines = [];
  lines.push(`Plan zakupów – ${formatDate(todayISO())}`);
  if (account) lines.push(`Konto: ${account.name} (${ACCOUNT_TYPES[account.type]?.label})`);
  lines.push(`Kwota do zainwestowania: ${formatPLN(plan.amount)}`);
  lines.push('');
  if (plan.orders.length === 0) {
    lines.push('Brak zleceń do wykonania.');
  } else {
    plan.orders.forEach((o, idx) => {
      const inst = instrumentsById[o.id];
      const q = inst?.quote;
      const qtyText = fractional ? formatNumber(o.qty, 4) : formatNumber(o.qty, 0);
      const priceText = q && q.currency !== 'PLN' ? `${formatMoney(q.price, q.currency)} ≈ ${formatPLN(o.price)}` : formatPLN(o.price);
      lines.push(
        `${idx + 1}. ${inst?.ticker || o.id}${inst?.yahooSymbol ? ` (${inst.yahooSymbol})` : ''} – ${qtyText} szt. × ${priceText} = ${formatPLN(o.amount)}${o.fxFee > 0 ? ` (w tym przewalutowanie ${formatPLN(o.fxFee)})` : ''}`,
      );
    });
  }
  lines.push('');
  lines.push(`Razem: ${formatPLN(plan.spent)} · pozostaje: ${formatPLN(plan.leftover)}`);
  if (plan.fxTotal > 0) lines.push(`Przewalutowanie (wliczone w kwoty): ${formatPLN(plan.fxTotal)}`);
  lines.push(`Maks. odchylenie od celu: ${formatNumber(plan.maxDevBefore, 2)} pp → ${formatNumber(plan.maxDevAfter, 2)} pp`);
  return lines.join('\n');
}

export default function ContributionCalculator({ analysis }) {
  const { state, actions, isDark } = useApp();
  const alloc = state.settings.allocation;
  const calc = alloc.calculator;
  const [amount, setAmount] = useState('1500');
  const [copied, setCopied] = useState(false);

  const setCalc = (patch) => actions.updateSettings({ allocation: { ...alloc, calculator: { ...calc, ...patch } } });

  const accounts = state.accounts.filter((a) => a.type !== 'SAVINGS' && a.type !== 'BONDS');
  const accountId = accounts.some((a) => a.id === calc.accountId) ? calc.accountId : accounts[0]?.id;
  const account = state.accounts.find((a) => a.id === accountId);

  const freeCash = useMemo(() => {
    if (!accountId) return 0;
    const v = valuePortfolio(state, { asOf: isoDay(new Date()), accountIds: [accountId], priceLookup: livePriceLookup(state) });
    return Math.max(0, v.byAccount[accountId]?.cash || 0);
  }, [state, accountId]);

  const limitInfo = useMemo(() => computeLimitUsage(state).find((u) => u.account.id === accountId), [state, accountId]);

  const deposit = Math.max(0, Number(String(amount).replace(',', '.')) || 0);
  const investable = deposit + (calc.includeCash ? freeCash : 0);

  const instrumentsById = useMemo(() => {
    const map = {};
    for (const inst of state.instruments) map[inst.id] = { ...inst, quote: state.prices.quotes[inst.id] };
    return map;
  }, [state.instruments, state.prices.quotes]);

  const plan = useMemo(() => {
    // Cena efektywna: kurs × (1 + przewalutowanie konta), gdy instrument jest w walucie obcej
    const fxById = {};
    const items = analysis.instruments.map((r) => {
      const fxPct = fxConversionPct(account, r.instrument);
      fxById[r.key] = fxPct;
      return { id: r.key, value: r.value, target: r.target, pricePLN: Number.isFinite(r.price.pricePLN) ? r.price.pricePLN * (1 + fxPct) : r.price.pricePLN };
    });
    const result = planContribution({ items, amount: investable, minOrder: Number(calc.minOrder) || 0, fractional: !!calc.fractional });
    // Prowizja za przewalutowanie zawarta w kwocie zlecenia: kwota × pct / (1 + pct)
    const orders = result.orders.map((o) => ({ ...o, fxFee: (o.amount * (fxById[o.id] || 0)) / (1 + (fxById[o.id] || 0)) }));
    return { ...result, orders, fxTotal: orders.reduce((s, o) => s + o.fxFee, 0) };
  }, [analysis.instruments, investable, calc.minOrder, calc.fractional, account]);

  const rowsById = Object.fromEntries(plan.rows.map((r) => [r.id, r]));
  const ordersById = Object.fromEntries(plan.orders.map((o) => [o.id, o]));
  const instColors = useMemo(() => instrumentColorMap(state, isDark), [state, isDark]);
  const limitExceeded = limitInfo && limitInfo.limit > 0 && deposit > limitInfo.remaining + 0.005;

  const onCopy = async () => {
    const ok = await copyToClipboard(buildPlanText({ plan, account, instrumentsById, fractional: !!calc.fractional }));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      actions.notify('Skopiowano plan zakupów do schowka', 'success');
    } else {
      actions.notify('Nie udało się skopiować – przeglądarka zablokowała schowek', 'error');
    }
  };

  return (
    <Card
      title="Kalkulator Inteligentnej Dopłaty"
      subtitle="Wyrównuje wagi docelowe bez sprzedaży (algorytm water-filling)"
      icon={Droplets}
      actions={
        <button
          type="button"
          onClick={onCopy}
          disabled={plan.orders.length === 0}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-800 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-neutral-800 dark:text-stone-100 dark:hover:bg-neutral-700"
        >
          {copied ? <Check size={16} /> : <ClipboardCopy size={16} />}
          {copied ? 'Skopiowano' : 'Kopiuj plan'}
        </button>
      }
    >
      {!analysis.instrumentTargetsSet ? (
        <p className="rounded-lg bg-stone-100 px-3 py-3 text-sm text-stone-600 dark:bg-white/5 dark:text-stone-300">
          Ustaw wagi docelowe instrumentów (sekcja „Akcje i ETF – wagi docelowe”), aby kalkulator mógł wyliczyć plan zakupów.
        </p>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <div className="space-y-4">
            <label className="flex h-16 items-center gap-3 rounded-2xl bg-stone-100 px-5 focus-within:ring-2 focus-within:ring-blue-500/30 dark:bg-white/[0.06]">
              <span className="sr-only">Kwota nowej wpłaty (PLN)</span>
              <input
                type="number"
                min="0"
                step="50"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label="Kwota nowej wpłaty (PLN)"
                className="min-w-0 flex-1 bg-transparent text-2xl font-bold tabular outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="text-sm font-semibold text-stone-500 dark:text-stone-400">PLN</span>
            </label>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Szybki wybór kwoty">
              {QUICK_AMOUNTS.map((q) => {
                const active = deposit === q;
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setAmount(String(q))}
                    aria-pressed={active}
                    className={`h-10 rounded-full border px-4 text-sm font-semibold tabular transition-colors ${
                      active
                        ? 'border-amber-300 bg-white ring-2 ring-amber-300/60 dark:border-amber-400/60 dark:bg-neutral-800 dark:ring-amber-400/30'
                        : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-white/10 dark:bg-neutral-900 dark:text-stone-200 dark:hover:bg-white/5'
                    }`}
                  >
                    {formatNumber(q, 0)}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-sm text-stone-500 dark:text-stone-400">min. zlecenie</span>
              <select
                value={calc.minOrder || 0}
                onChange={(e) => setCalc({ minOrder: Number(e.target.value) })}
                aria-label="Minimalne zlecenie"
                className="h-10 rounded-full border-0 bg-stone-100 pr-8 pl-4 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/30 dark:bg-white/[0.06]"
              >
                {MIN_ORDERS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label.toLowerCase()}
                  </option>
                ))}
              </select>
            </div>
            <Field label="Konto docelowe">
              <Select value={accountId || ''} onChange={(e) => setCalc({ accountId: e.target.value })}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Toggle
              checked={!!calc.fractional}
              onChange={(v) => setCalc({ fractional: v })}
              label="Akcje ułamkowe"
              description="Zakup ułamków jednostek (np. XTB) – plan idealnie odwzorowuje kwoty"
            />
            <Toggle
              checked={!!calc.includeCash}
              onChange={(v) => setCalc({ includeCash: v })}
              label="Dolicz wolną gotówkę z konta"
              description={`Dostępne na koncie: ${formatPLN(freeCash)}`}
            />
            {limitInfo && limitInfo.limit > 0 && (
              <div
                className={`flex gap-2 rounded-lg px-3 py-2 text-xs ${
                  limitExceeded
                    ? 'bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-300'
                    : 'bg-stone-100 text-stone-600 dark:bg-white/5 dark:text-stone-300'
                }`}
              >
                {limitExceeded ? <AlertTriangle size={14} className="mt-0.5 shrink-0" /> : <Info size={14} className="mt-0.5 shrink-0" />}
                <span>
                  Pozostały limit {ACCOUNT_TYPES[account.type].label} {limitInfo.year}: <strong className="tabular">{formatPLN(limitInfo.remaining)}</strong>
                  {limitExceeded && ` – wpłata przekracza limit o ${formatPLN(deposit - limitInfo.remaining)}.`}
                </span>
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Mini label="Do zainwestowania" value={formatPLN(investable)} />
              <Mini label={plan.fxTotal > 0 ? `W zleceniach (w tym FX ${formatPLN(plan.fxTotal)})` : 'W zleceniach'} value={formatPLN(plan.spent)} />
              <Mini label="Reszta gotówki" value={formatPLN(plan.leftover)} />
              <Mini
                label="Maks. odchylenie"
                value={`${formatNumber(plan.maxDevBefore, 1)} → ${formatNumber(plan.maxDevAfter, 1)} pp`}
                tone={plan.maxDevAfter < plan.maxDevBefore - 1e-6 ? 'text-emerald-700 dark:text-emerald-400' : ''}
              />
            </div>

            {investable <= 0 || plan.orders.length === 0 ? (
              <div className="flex items-center gap-2 rounded-2xl border border-dashed border-stone-300 px-4 py-4 text-sm text-stone-500 dark:border-white/10">
                <Calculator size={16} /> {investable > 0 ? 'Za mała kwota, by złożyć zlecenie przy obecnych kursach i minimum zlecenia.' : 'Wpisz kwotę wpłaty.'}
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-left text-[11px] font-semibold tracking-wider text-stone-500 uppercase dark:border-white/10 dark:text-stone-400">
                    <th className="py-2.5 pr-2 pl-1 font-semibold">Aktywo</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Teraz</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Cel</th>
                    <th className="py-2.5 pr-1 pl-2 text-right font-semibold">Dokup</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {[...analysis.instruments]
                    .sort((a, b) => (ordersById[b.key]?.amount || 0) - (ordersById[a.key]?.amount || 0) || b.value - a.value)
                    .map((r) => {
                      const o = ordersById[r.key];
                      const inst = instrumentsById[r.key];
                      const row = rowsById[r.key];
                      const color = instColors[r.key] || '#a8a29e';
                      return (
                        <tr key={r.key} className={`border-b border-stone-100 last:border-0 dark:border-white/5 ${o ? '' : 'text-stone-400 dark:text-stone-500'}`}>
                          <td className="w-full max-w-0 py-3 pr-2 pl-1">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color, opacity: o ? 1 : 0.45 }} />
                              <div className="min-w-0">
                                <div className={`truncate font-semibold ${o ? 'text-stone-900 dark:text-stone-100' : ''}`}>{inst?.ticker || r.label}</div>
                                {o && (
                                  <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">
                                    {calc.fractional ? formatNumber(o.qty, 4) : formatNumber(o.qty, 0)} szt. × {inst?.quote ? formatMoney(inst.quote.price, inst.quote.currency || inst.currency) : formatPLN(o.price)}
                                    {o.fxFee > 0 ? ` · FX ${formatPLN(o.fxFee)}` : ''} · {formatPercent(row?.before, { digits: 1 })} → {formatPercent(row?.after, { digits: 1 })}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className={`px-2 py-3 text-right whitespace-nowrap ${o ? 'text-stone-800 dark:text-stone-200' : ''}`}>
                            {formatNumber(r.value, 0)} <span className="text-xs">PLN</span>
                          </td>
                          <td className="px-2 py-3 text-right whitespace-nowrap">{formatPercent(row?.target, { digits: 1 })}</td>
                          <td className="py-3 pr-1 pl-2 text-right font-semibold whitespace-nowrap" style={o ? { color } : undefined}>
                            {o ? formatNumber(o.amount, 2) : ''}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {plan.skipped.length > 0 && (
              <ul className="space-y-1 text-xs text-stone-500 dark:text-stone-400">
                {plan.skipped.map((s, i) => (
                  <li key={`${s.id}-${i}`} className="flex items-center gap-2">
                    <Badge>{s.id ? instrumentsById[s.id]?.ticker || s.id : 'Uwaga'}</Badge> {s.reason}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-stone-500 dark:text-stone-500">
              Kursy z modułu notowań ({state.prices.status === 'live' ? 'na żywo' : state.prices.status === 'mock' ? 'symulowane' : 'ostatnie znane / z transakcji'})
              {accountFxPct(account) > 0 ? `, z przewalutowaniem ${String(accountFxPct(account)).replace('.', ',')}% (XTB) doliczonym do ceny instrumentów w walutach obcych` : ''}. Plan nie uwzględnia prowizji maklerskich. Wagi liczone w części akcje + ETF
              wybranego zakresu kont.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

function Mini({ label, value, tone = '' }) {
  return (
    <div className="rounded-lg bg-stone-50 px-3 py-2 dark:bg-white/[0.03]">
      <div className="text-[11px] text-stone-500 dark:text-stone-400">{label}</div>
      <div className={`truncate text-sm font-semibold tabular ${tone}`}>{value}</div>
    </div>
  );
}
