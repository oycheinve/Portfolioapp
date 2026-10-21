import { useState } from 'react';
import { ArrowRightLeft, ChevronDown, ChevronUp, Radio, RefreshCw } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { fxToPLN } from '../../lib/engine.js';
import { formatDateTime, formatMoney, formatNumber, formatPLN, formatPercent, signClass } from '../../lib/format.js';
import { Badge, Button, Card, Field, Input, Select } from '../ui.jsx';

export default function LivePricesCard() {
  const { state, actions, refreshing } = useApp();
  const { quotes, fx, status, lastRefresh, log = [] } = state.prices;
  const [showLog, setShowLog] = useState(false);
  const [conv, setConv] = useState({ amount: 1000, from: 'USD', to: 'PLN' });

  const converted = (Number(conv.amount) || 0) * (fxToPLN(fx, conv.from) / fxToPLN(fx, conv.to));
  const currencies = Object.keys(fx.rates || { PLN: 1 });

  const statusBadge = {
    live: <Badge tone="green">Na żywo</Badge>,
    partial: <Badge tone="amber">Częściowo symulowane</Badge>,
    mock: <Badge tone="neutral">Symulacja</Badge>,
    loading: <Badge tone="blue">Pobieranie…</Badge>,
    error: <Badge tone="red">Błąd</Badge>,
    idle: <Badge tone="neutral">Brak danych</Badge>,
  }[status] || <Badge>—</Badge>;

  return (
    <Card
      title="Notowania (Live Prices)"
      subtitle={`Yahoo Finance (.WA dla GPW) · kursy walut NBP · ${lastRefresh ? formatDateTime(lastRefresh) : 'nie odświeżano'}`}
      icon={Radio}
      actions={
        <>
          {statusBadge}
          <Select
            value={state.settings.priceMode}
            onChange={(e) => actions.updateSettings({ priceMode: e.target.value })}
            className="h-8 w-auto text-xs"
            aria-label="Źródło notowań"
          >
            <option value="auto">Na żywo + fallback</option>
            <option value="mock">Tylko symulacja</option>
          </Select>
          <Button variant="primary" size="sm" icon={RefreshCw} onClick={() => actions.refreshPrices()} disabled={refreshing}>
            Odśwież
          </Button>
        </>
      }
      bodyClassName="p-0 sm:p-0"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-stone-100 text-left text-xs text-stone-500 dark:border-white/5 dark:text-stone-400">
              <th className="px-4 py-2 font-medium sm:px-5">Instrument</th>
              <th className="px-3 py-2 font-medium">Symbol</th>
              <th className="px-3 py-2 text-right font-medium">Kurs</th>
              <th className="px-3 py-2 text-right font-medium">Zmiana</th>
              <th className="px-3 py-2 text-right font-medium">Kurs w PLN</th>
              <th className="px-3 py-2 text-right font-medium">TER</th>
              <th className="px-4 py-2 font-medium sm:px-5">Źródło</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {state.instruments.map((inst) => {
              const q = quotes[inst.id];
              const change = q && q.prevClose ? q.price / q.prevClose - 1 : null;
              const ccy = q?.currency || inst.currency;
              return (
                <tr key={inst.id} className="border-b border-stone-100 last:border-0 dark:border-white/5">
                  <td className="px-4 py-2 sm:px-5">
                    <div className="font-medium">{inst.ticker}</div>
                    <div className="max-w-[14rem] truncate text-xs text-stone-500 dark:text-stone-400">{inst.name}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-stone-500 dark:text-stone-400">
                    {inst.yahooSymbol || '—'} <Badge className="ml-1">{inst.kind === 'ETF' ? 'ETF' : 'Akcja'}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right">{q ? formatMoney(q.price, ccy) : '—'}</td>
                  <td className={`px-3 py-2 text-right ${signClass(change)}`}>
                    <span className="inline-flex items-center gap-0.5">
                      {change > 0 ? <ChevronUp size={14} /> : change < 0 ? <ChevronDown size={14} /> : null}
                      {formatPercent(change, { sign: true })}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">{q ? formatPLN(q.price * fxToPLN(fx, ccy)) : '—'}</td>
                  <td className="px-3 py-2 text-right text-stone-500 dark:text-stone-400">{inst.kind === 'ETF' ? formatPercent((inst.ter || 0) / 100, { digits: 2 }) : '—'}</td>
                  <td className="px-4 py-2 text-xs text-stone-500 sm:px-5 dark:text-stone-400">{q?.source || 'brak'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 border-t border-stone-100 p-4 sm:p-5 lg:grid-cols-2 dark:border-white/5">
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
            <span className="font-semibold text-stone-700 dark:text-stone-200">Kursy walut (PLN)</span>
            <span>{fx.source}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {currencies
              .filter((c) => c !== 'PLN')
              .map((c) => (
                <div key={c} className="rounded-lg border border-stone-100 px-3 py-2 dark:border-white/5">
                  <div className="text-[11px] text-stone-500">{c}/PLN</div>
                  <div className="font-semibold tabular">{formatNumber(fx.rates[c], 4)}</div>
                </div>
              ))}
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-stone-700 dark:text-stone-200">
            <ArrowRightLeft size={14} /> Przelicznik walut
          </div>
          <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
            <Field label="Kwota">
              <Input type="number" value={conv.amount} onChange={(e) => setConv({ ...conv, amount: e.target.value })} />
            </Field>
            <Field label="Z">
              <Select value={conv.from} onChange={(e) => setConv({ ...conv, from: e.target.value })}>
                {currencies.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Na">
              <Select value={conv.to} onChange={(e) => setConv({ ...conv, to: e.target.value })}>
                {currencies.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-2 text-lg font-semibold tabular">= {formatMoney(converted, conv.to)}</div>
        </div>
      </div>

      {log.length > 0 && (
        <div className="border-t border-stone-100 px-4 py-3 sm:px-5 dark:border-white/5">
          <button type="button" className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800 dark:hover:text-stone-200" onClick={() => setShowLog((v) => !v)}>
            {showLog ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Dziennik pobierania ({log.length})
          </button>
          {showLog && (
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-[11px]">
              {log.map((l, i) => (
                <li key={i} className={l.level === 'warn' ? 'text-amber-700 dark:text-amber-400' : 'text-stone-500'}>
                  {l.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
