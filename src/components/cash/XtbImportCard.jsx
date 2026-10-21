import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { ACCOUNT_TYPES } from '../../lib/constants.js';
import { accountFxPct } from '../../lib/engine.js';
import { readSpreadsheet } from '../../lib/xlsx.js';
import { analyzeXtb, buildXtbImport } from '../../lib/xtbImport.js';
import { formatDate, formatPLN } from '../../lib/format.js';
import { Badge, Button, Card, Field, Input, Select } from '../ui.jsx';

const KIND_OPTIONS = [
  { value: 'STOCK', label: 'Akcja' },
  { value: 'ETF', label: 'ETF/ETC/ETN' },
];
const CURRENCIES = ['PLN', 'USD', 'EUR', 'GBP', 'CHF'];

function defaultAccount(accounts) {
  const usable = accounts.filter((a) => a.type !== 'SAVINGS' && a.type !== 'BONDS');
  return (usable.find((a) => /xtb/i.test(a.institution || '') || /xtb/i.test(a.name)) || usable[0])?.id || '';
}

// Import z XTB: plik .xlsx/.csv z historią operacji gotówkowych → podgląd → zapis wpłat, transakcji, dywidend i odsetek
export default function XtbImportCard() {
  const { state, actions } = useApp();
  const inputRef = useRef(null);
  const [accountId, setAccountId] = useState(() => defaultAccount(state.accounts));
  const [fileName, setFileName] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [mapping, setMapping] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);

  const account = state.accounts.find((a) => a.id === accountId);
  const accounts = state.accounts.filter((a) => a.type !== 'SAVINGS' && a.type !== 'BONDS');

  const onFile = async (file) => {
    if (!file) return;
    setBusy(true);
    setError('');
    setAnalysis(null);
    setFileName(file.name);
    try {
      const sheets = await readSpreadsheet(file);
      const a = analyzeXtb(sheets, { state, accountId });
      setAnalysis(a);
      setMapping(Object.fromEntries(Object.entries(a.symbols).map(([sym, s]) => [sym, { ...s, name: s.ticker }])));
    } catch (e) {
      setError(e.message || 'Nie udało się odczytać pliku.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const plan = useMemo(() => {
    if (!analysis || !account) return null;
    return buildXtbImport(analysis, mapping, { state, account, fxPct: accountFxPct(account) });
  }, [analysis, mapping, state, account]);

  const setMap = (sym, patch) => setMapping((m) => ({ ...m, [sym]: { ...m[sym], ...patch } }));

  const doImport = () => {
    if (!plan) return;
    if (plan.newInstruments.length) actions.addMany('instruments', plan.newInstruments);
    if (plan.cashflows.length) actions.addMany('cashflows', plan.cashflows);
    if (plan.trades.length) actions.addMany('trades', plan.trades);
    if (plan.income.length) actions.addMany('income', plan.income);
    const n = plan.cashflows.length + plan.trades.length + plan.income.length;
    actions.notify(`Zaimportowano z XTB: ${n} operacji${plan.newInstruments.length ? `, ${plan.newInstruments.length} nowych instrumentów` : ''}`, 'success');
    setAnalysis(null);
    setFileName('');
  };

  const sum = (list, f = (x) => x.amount) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const stats = plan && [
    { label: 'Wpłaty', count: plan.cashflows.filter((c) => c.type === 'DEPOSIT').length, value: sum(plan.cashflows.filter((c) => c.type === 'DEPOSIT')) },
    { label: 'Wypłaty', count: plan.cashflows.filter((c) => c.type === 'WITHDRAWAL').length, value: sum(plan.cashflows.filter((c) => c.type === 'WITHDRAWAL')) },
    { label: 'Zakupy', count: plan.trades.filter((t) => t.side === 'BUY').length, value: sum(plan.trades.filter((t) => t.side === 'BUY'), (t) => t.quantity * t.price * t.fxRate + t.fee) },
    { label: 'Sprzedaże', count: plan.trades.filter((t) => t.side === 'SELL').length, value: sum(plan.trades.filter((t) => t.side === 'SELL'), (t) => t.quantity * t.price * t.fxRate - t.fee) },
    { label: 'Dywidendy (brutto)', count: plan.income.filter((i) => i.type === 'DIVIDEND').length, value: sum(plan.income.filter((i) => i.type === 'DIVIDEND'), (i) => i.gross) },
    { label: 'Odsetki (brutto)', count: plan.income.filter((i) => i.type === 'INTEREST').length, value: sum(plan.income.filter((i) => i.type === 'INTEREST'), (i) => i.gross) },
    { label: 'Podatki pobrane', count: null, value: sum(plan.income, (i) => i.foreignTax) },
  ];
  const total = plan ? plan.cashflows.length + plan.trades.length + plan.income.length : 0;

  return (
    <Card title="Import z XTB" subtitle="Plik Excel (.xlsx) lub CSV z historią operacji gotówkowych – wpłaty, wypłaty, zakupy, sprzedaże, dywidendy i podatki" icon={FileSpreadsheet}>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Konto docelowe">
          <Select
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              setAnalysis(null);
            }}
            className="w-auto min-w-[12rem]"
          >
            <option value="" disabled>
              Wybierz konto…
            </option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({ACCOUNT_TYPES[a.type]?.label})
              </option>
            ))}
          </Select>
        </Field>
        <input ref={inputRef} type="file" accept=".xlsx,.xlsm,.csv,.txt" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Plik z XTB" />
        <Button variant="primary" icon={Upload} disabled={!accountId || busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Wczytywanie…' : 'Wybierz plik z XTB'}
        </Button>
        {fileName && <span className="text-xs text-stone-500">{fileName}</span>}
      </div>
      <p className="mt-2 text-[11px] text-stone-500 dark:text-stone-400">
        W xStation: Historia konta → Operacje gotówkowe → Eksportuj (Excel). Ponowny import tego samego pliku nie tworzy duplikatów (rozpoznawanie po ID operacji XTB).
      </p>
      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-300">{error}</div>}

      {plan && (
        <div className="mt-4 space-y-4">
          <div className="text-xs text-stone-500">
            Arkusz „{analysis.sheetName}” · {analysis.ops.length} wierszy · konto {account?.name}
            {accountFxPct(account) > 0 ? ` · przewalutowanie ${String(accountFxPct(account)).replace('.', ',')}% wliczone w kurs` : ''}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {stats.map((s) => (
              <div key={s.label} className="min-w-0 rounded-lg bg-stone-50 px-3 py-2 dark:bg-white/[0.03]">
                <div className="truncate text-[11px] text-stone-500">
                  {s.label}
                  {s.count !== null ? ` (${s.count})` : ''}
                </div>
                <div className="truncate text-sm font-semibold tabular">{formatPLN(s.value)}</div>
              </div>
            ))}
          </div>

          {Object.keys(mapping).length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-white/10">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-stone-100 text-left text-xs text-stone-500 dark:border-white/5">
                    <th className="px-3 py-2 font-medium">Symbol XTB</th>
                    <th className="px-3 py-2 font-medium">Instrument w aplikacji</th>
                    <th className="px-3 py-2 font-medium">Nazwa</th>
                    <th className="px-3 py-2 font-medium">Rodzaj</th>
                    <th className="px-3 py-2 font-medium">Waluta</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(mapping).map(([sym, m]) => (
                    <tr key={sym} className="border-b border-stone-100 last:border-0 dark:border-white/5">
                      <td className="px-3 py-1.5 font-medium">{sym}</td>
                      <td className="px-3 py-1.5">
                        <Select value={m.instrumentId || ''} onChange={(e) => setMap(sym, { instrumentId: e.target.value || null })} className="h-8 w-auto text-xs" aria-label={`Instrument dla ${sym}`}>
                          <option value="">+ Nowy: {m.ticker}</option>
                          {state.instruments.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.ticker} – {i.name}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-3 py-1.5">
                        {m.instrumentId ? (
                          <span className="text-xs text-stone-500">istniejący</span>
                        ) : (
                          <Input value={m.name} onChange={(e) => setMap(sym, { name: e.target.value })} className="h-8 w-40 text-xs" aria-label={`Nazwa ${sym}`} />
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        {!m.instrumentId && (
                          <Select value={m.kind} onChange={(e) => setMap(sym, { kind: e.target.value })} className="h-8 w-auto text-xs" aria-label={`Rodzaj ${sym}`}>
                            {KIND_OPTIONS.map((k) => (
                              <option key={k.value} value={k.value}>
                                {k.label}
                              </option>
                            ))}
                          </Select>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        {!m.instrumentId && (
                          <Select value={m.currency} onChange={(e) => setMap(sym, { currency: e.target.value })} className="h-8 w-auto text-xs" aria-label={`Waluta ${sym}`}>
                            {CURRENCIES.map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </Select>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" icon={CheckCircle2} disabled={total === 0 && plan.newInstruments.length === 0} onClick={doImport}>
              Importuj {total} operacji
            </Button>
            <Button onClick={() => setAnalysis(null)}>Anuluj</Button>
            {plan.duplicates > 0 && <Badge>{plan.duplicates} już zaimportowanych – pominięte</Badge>}
            {plan.skipped.length > 0 && (
              <button type="button" className="text-xs font-medium text-amber-700 hover:underline dark:text-amber-400" onClick={() => setShowSkipped((v) => !v)}>
                {plan.skipped.length} wierszy pominiętych {showSkipped ? '▲' : '▼'}
              </button>
            )}
          </div>
          {showSkipped && plan.skipped.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              {plan.skipped.map((s) => (
                <li key={`${s.xtbId}-${s.row}`}>
                  {formatDate(s.date)} · {s.type} · {formatPLN(s.amount)} {s.symbol && `· ${s.symbol}`} – {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
