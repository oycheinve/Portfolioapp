import { useMemo, useState } from 'react';
import { AlertTriangle, Calculator, Check, ClipboardCopy, Droplets, Info } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { planContribution } from '../../lib/allocation.js';
import { accountFxPct, computeLimitUsage, fxConversionPct, isoDay, livePriceLookup, valuePortfolio } from '../../lib/engine.js';
import { ACCOUNT_TYPES } from '../../lib/constants.js';
import { formatDate, formatMoney, formatNumber, formatPLN, formatPercent, todayISO } from '../../lib/format.js';
import { Badge, Button, Card, Field, Input, Select, Toggle } from '../ui.jsx';

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
  const { state, actions } = useApp();
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
      subtitle="Algorytm water-filling: dokupuje niedoważone pozycje bez sprzedaży"
      icon={Droplets}
      actions={
        <Button variant="primary" size="sm" icon={copied ? Check : ClipboardCopy} onClick={onCopy} disabled={plan.orders.length === 0}>
          {copied ? 'Skopiowano' : 'Kopiuj plan zakupów'}
        </Button>
      }
    >
      {!analysis.instrumentTargetsSet ? (
        <p className="rounded-lg bg-stone-100 px-3 py-3 text-sm text-stone-600 dark:bg-white/5 dark:text-stone-300">
          Ustaw wagi docelowe instrumentów (sekcja „Akcje i ETF – wagi docelowe”), aby kalkulator mógł wyliczyć plan zakupów.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <div className="space-y-4">
            <Field label="Kwota nowej wpłaty (PLN)">
              <Input type="number" min="0" step="50" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="text-base font-semibold" />
            </Field>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Szybki wybór kwoty">
              {QUICK_AMOUNTS.map((q) => {
                const active = deposit === q;
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setAmount(String(q))}
                    className={`rounded-full border px-3.5 py-1 text-sm font-medium tabular transition-colors ${
                      active
                        ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500 dark:text-neutral-950'
                        : 'border-stone-200 text-stone-700 hover:bg-stone-100 dark:border-white/10 dark:text-stone-200 dark:hover:bg-white/5'
                    }`}
                  >
                    {formatNumber(q, 0)} zł
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Konto docelowe">
                <Select value={accountId || ''} onChange={(e) => setCalc({ accountId: e.target.value })}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Minimalne zlecenie">
                <Select value={calc.minOrder || 0} onChange={(e) => setCalc({ minOrder: Number(e.target.value) })}>
                  {MIN_ORDERS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
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

            {plan.orders.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-stone-300 px-4 py-6 text-sm text-stone-500 dark:border-white/10">
                <Calculator size={16} /> {investable > 0 ? 'Za mała kwota, by złożyć zlecenie przy obecnych kursach i minimum zlecenia.' : 'Wpisz kwotę wpłaty.'}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-stone-100 dark:border-white/5">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-stone-100 text-left text-xs text-stone-500 dark:border-white/5 dark:text-stone-400">
                      <th className="px-3 py-2 font-medium">Instrument</th>
                      <th className="px-3 py-2 text-right font-medium">Sztuk</th>
                      <th className="px-3 py-2 text-right font-medium">Kurs</th>
                      <th className="px-3 py-2 text-right font-medium">Kwota</th>
                      <th className="px-3 py-2 text-right font-medium">Waga: przed → po (cel)</th>
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {plan.orders.map((o) => {
                      const inst = instrumentsById[o.id];
                      const q = inst?.quote;
                      const r = rowsById[o.id];
                      return (
                        <tr key={o.id} className="border-b border-stone-100 last:border-0 dark:border-white/5">
                          <td className="px-3 py-2">
                            <div className="font-medium">{inst?.ticker}</div>
                            <div className="max-w-[12rem] truncate text-xs text-stone-500 dark:text-stone-400">{inst?.name}</div>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">{calc.fractional ? formatNumber(o.qty, 4) : formatNumber(o.qty, 0)}</td>
                          <td className="px-3 py-2 text-right">
                            <div>{q ? formatMoney(q.price, q.currency || inst.currency) : formatPLN(o.price)}</div>
                            {q && (q.currency || inst.currency) !== 'PLN' && <div className="text-xs text-stone-500">{formatPLN(o.price)}</div>}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="font-semibold">{formatPLN(o.amount)}</div>
                            {o.fxFee > 0 && <div className="text-xs text-stone-500">FX {formatPLN(o.fxFee)}</div>}
                          </td>
                          <td className="px-3 py-2 text-right text-xs">
                            {formatPercent(r?.before, { digits: 1 })} → <span className="font-medium">{formatPercent(r?.after, { digits: 1 })}</span>{' '}
                            <span className="text-stone-500">({formatPercent(r?.target, { digits: 1 })})</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

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
