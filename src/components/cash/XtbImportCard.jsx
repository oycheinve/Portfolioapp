import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, Plus, Upload } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { ACCOUNT_TYPES } from '../../lib/constants.js';
import { accountFxPct } from '../../lib/engine.js';
import { readSpreadsheet } from '../../lib/xlsx.js';
import { KIND_LABELS, analyzeXtb, analyzeXtbOpenPositions, buildXtbImport, buildXtbOpenImport, findOpenPositionsSheet } from '../../lib/xtbImport.js';
import { formatDate, formatPLN, todayISO } from '../../lib/format.js';
import { Badge, Button, Card, Input, Select } from '../ui.jsx';

const KIND_OPTIONS = [
  { value: 'STOCK', label: 'Akcja' },
  { value: 'ETF', label: 'ETF/ETC/ETN' },
];
const CURRENCIES = ['PLN', 'USD', 'EUR', 'GBP', 'CHF'];
const NEW_ACCOUNT_TYPES = ['IKE', 'IKZE', 'BROKERAGE'];

function defaultAccount(accounts) {
  return (accounts.find((a) => /xtb/i.test(a.institution || '') || /xtb/i.test(a.name)) || accounts[0])?.id || '';
}

// Import z XTB: 1) wybór konta docelowego z listy, 2) plik .xlsx/.csv z historią operacji gotówkowych,
// 3) podgląd rozpoznanych operacji i mapowania symboli, 4) zapis wpłat, transakcji, dywidend i odsetek
export default function XtbImportCard() {
  const { state, actions } = useApp();
  const inputRef = useRef(null);
  const accounts = state.accounts.filter((a) => a.type !== 'SAVINGS' && a.type !== 'BONDS');
  const [accountId, setAccountId] = useState(() => defaultAccount(accounts));
  const [newAccount, setNewAccount] = useState(null);
  const [fileName, setFileName] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [mapping, setMapping] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);
  const [showOps, setShowOps] = useState(false);

  const account = state.accounts.find((a) => a.id === accountId);

  const onFile = async (file) => {
    if (!file) return;
    setBusy(true);
    setError('');
    setAnalysis(null);
    setFileName(file.name);
    try {
      const sheets = await readSpreadsheet(file);
      // Raport XTB z arkuszem „Open Positions” → import wyłącznie otwartych pozycji; inaczej historia operacji gotówkowych
      if (findOpenPositionsSheet(sheets)) {
        const a = analyzeXtbOpenPositions(sheets, { state });
        setAnalysis(a);
        setMapping(a.symbols);
      } else {
        const a = analyzeXtb(sheets, { state, accountId });
        setAnalysis(a);
        setMapping(Object.fromEntries(Object.entries(a.symbols).map(([sym, s]) => [sym, { ...s, name: s.ticker }])));
      }
    } catch (e) {
      setError(e.message || 'Nie udało się odczytać pliku.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const createAccount = () => {
    const name = newAccount.name.trim() || `${ACCOUNT_TYPES[newAccount.type].label} – XTB`;
    const created = actions.upsert('accounts', { name, type: newAccount.type, institution: 'XTB', currency: 'PLN', openedAt: todayISO() });
    setAccountId(created.id);
    setNewAccount(null);
    actions.notify(`Utworzono konto „${name}”`, 'success');
  };

  // Konto można zmienić także po wczytaniu pliku – podgląd przelicza się dla nowego konta
  const plan = useMemo(() => {
    if (!analysis || !account || analysis.mode === 'OPEN') return null;
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
    actions.notify(`Zaimportowano z XTB na konto „${account.name}”: ${n} operacji${plan.newInstruments.length ? `, ${plan.newInstruments.length} nowych instrumentów` : ''}`, 'success');
    setAnalysis(null);
    setFileName('');
  };

  const sum = (list, f = (x) => x.amount) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const kindCounts = analysis?.ops ? analysis.ops.reduce((acc, o) => ({ ...acc, [o.kind]: (acc[o.kind] || 0) + 1 }), {}) : {};
  const stats = plan && [
    { label: 'Wpłaty', count: plan.cashflows.filter((c) => c.type === 'DEPOSIT').length, value: sum(plan.cashflows.filter((c) => c.type === 'DEPOSIT')) },
    { label: 'Wypłaty', count: plan.cashflows.filter((c) => c.type === 'WITHDRAWAL').length, value: sum(plan.cashflows.filter((c) => c.type === 'WITHDRAWAL')) },
    { label: 'Zakupy', count: plan.trades.filter((t) => t.side === 'BUY').length, value: sum(plan.trades.filter((t) => t.side === 'BUY'), (t) => t.quantity * t.price * t.fxRate + t.fee) },
    { label: 'Sprzedaże', count: plan.trades.filter((t) => t.side === 'SELL').length, value: sum(plan.trades.filter((t) => t.side === 'SELL'), (t) => t.quantity * t.price * t.fxRate - t.fee) },
    { label: 'Dywidendy (brutto)', count: plan.income.filter((i) => i.type === 'DIVIDEND').length, value: sum(plan.income.filter((i) => i.type === 'DIVIDEND'), (i) => i.gross) },
    { label: 'Odsetki (brutto)', count: plan.income.filter((i) => i.type === 'INTEREST').length, value: sum(plan.income.filter((i) => i.type === 'INTEREST'), (i) => i.gross) },
    { label: 'Podatki pobrane', count: (kindCounts.TAX || 0) + (kindCounts.INTEREST_TAX || 0), value: sum(plan.income, (i) => i.foreignTax) },
  ];
  const total = plan ? plan.cashflows.length + plan.trades.length + plan.income.length : 0;

  return (
    <Card title="Import z XTB" subtitle="Plik Excel (.xlsx) lub CSV z historią operacji gotówkowych – automatyczne rozpoznanie wpłat, wypłat, kupna, sprzedaży, dywidend i podatków" icon={FileSpreadsheet}>
      {/* Krok 1: konto docelowe */}
      <div className="mb-2 text-xs font-semibold text-stone-500 uppercase">1. Na które konto zaimportować?</div>
      <div role="radiogroup" aria-label="Konto docelowe importu" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => {
          const active = a.id === accountId;
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setAccountId(a.id)}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                active ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20 dark:border-blue-400 dark:bg-blue-500/10' : 'border-stone-200 hover:bg-stone-50 dark:border-white/10 dark:hover:bg-white/[0.03]'
              }`}
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${active ? 'border-blue-600 dark:border-blue-400' : 'border-stone-300 dark:border-stone-600'}`}>
                {active && <span className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400" />}
              </span>
              <span className="h-6 w-1 shrink-0 rounded" style={{ background: ACCOUNT_TYPES[a.type]?.color }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{a.name}</span>
                <span className="block truncate text-[11px] text-stone-500">
                  {ACCOUNT_TYPES[a.type]?.label}
                  {a.institution ? ` · ${a.institution}` : ''}
                  {accountFxPct(a) > 0 ? ` · FX ${String(accountFxPct(a)).replace('.', ',')}%` : ''}
                </span>
              </span>
            </button>
          );
        })}
        {newAccount ? (
          <div className="space-y-2 rounded-xl border border-dashed border-stone-300 p-3 dark:border-white/15">
            <Input value={newAccount.name} onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })} placeholder="Nazwa, np. IKE – XTB" aria-label="Nazwa nowego konta" className="h-8 text-xs" />
            <div className="flex gap-2">
              <Select value={newAccount.type} onChange={(e) => setNewAccount({ ...newAccount, type: e.target.value })} className="h-8 text-xs" aria-label="Typ nowego konta">
                {NEW_ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ACCOUNT_TYPES[t].label}
                  </option>
                ))}
              </Select>
              <Button size="sm" variant="primary" onClick={createAccount}>
                Utwórz
              </Button>
              <Button size="sm" onClick={() => setNewAccount(null)}>
                ✕
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNewAccount({ name: '', type: 'IKE' })}
            className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300 px-3 py-2.5 text-sm text-stone-600 hover:bg-stone-50 dark:border-white/15 dark:text-stone-300 dark:hover:bg-white/[0.03]"
          >
            <Plus size={15} /> Nowe konto XTB
          </button>
        )}
      </div>

      {/* Krok 2: plik */}
      <div className="mt-4 mb-2 text-xs font-semibold text-stone-500 uppercase">2. Plik z XTB</div>
      <div className="flex flex-wrap items-center gap-3">
        <input ref={inputRef} type="file" accept=".xlsx,.xlsm,.csv,.txt" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Plik z XTB" />
        <Button variant="primary" icon={Upload} disabled={!accountId || busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Wczytywanie…' : 'Wybierz plik z XTB'}
        </Button>
        {fileName && <span className="text-xs text-stone-500">{fileName}</span>}
      </div>
      <p className="mt-2 text-[11px] text-stone-500 dark:text-stone-400">
        Raport z xStation (Historia konta → Eksportuj, Excel): importowane są wyłącznie otwarte pozycje z arkusza „Open Positions” – każda transza z ceną i datą otwarcia, koszt w PLN wg XTB. Plik CSV bez tego arkusza = historia operacji gotówkowych. Ponowny import tego samego pliku nie tworzy duplikatów (rozpoznawanie po ID operacji XTB).
      </p>
      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-300">{error}</div>}

      {analysis?.mode === 'OPEN' && account && (
        <OpenPositionsPreview
          analysis={analysis}
          mapping={mapping}
          setMap={setMap}
          account={account}
          onDone={() => {
            setAnalysis(null);
            setFileName('');
          }}
        />
      )}

      {/* Krok 3: podgląd */}
      {plan && (
        <div className="mt-4 space-y-4">
          <div className="text-xs font-semibold text-stone-500 uppercase">3. Podgląd importu na konto „{account?.name}”</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(kindCounts).map(([k, n]) => (
              <Badge key={k} tone={KIND_LABELS[k]?.tone}>
                {KIND_LABELS[k]?.label || k}: {n}
              </Badge>
            ))}
            <span className="text-xs text-stone-500">
              · arkusz „{analysis.sheetName}”{accountFxPct(account) > 0 ? ` · przewalutowanie ${String(accountFxPct(account)).replace('.', ',')}% wliczone w kurs` : ''}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {stats.map((s) => (
              <div key={s.label} className="min-w-0 rounded-lg bg-stone-50 px-3 py-2 dark:bg-white/[0.03]">
                <div className="truncate text-[11px] text-stone-500">
                  {s.label} ({s.count})
                </div>
                <div className="truncate text-sm font-semibold tabular">{formatPLN(s.value)}</div>
              </div>
            ))}
          </div>

          <div>
            <button type="button" className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400" onClick={() => setShowOps((v) => !v)}>
              {showOps ? 'Ukryj' : 'Pokaż'} rozpoznane operacje ({analysis.ops.length})
            </button>
            {showOps && (
              <div className="mt-2 max-h-72 overflow-auto rounded-xl border border-stone-200 dark:border-white/10">
                <table className="w-full min-w-[560px] text-xs">
                  <thead className="sticky top-0 bg-stone-50 dark:bg-neutral-800">
                    <tr className="text-left text-stone-500">
                      <th className="px-3 py-1.5 font-medium">Data</th>
                      <th className="px-3 py-1.5 font-medium">Rozpoznano jako</th>
                      <th className="px-3 py-1.5 font-medium">Typ w pliku</th>
                      <th className="px-3 py-1.5 font-medium">Symbol</th>
                      <th className="px-3 py-1.5 text-right font-medium">Kwota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.ops.map((o) => (
                      <tr key={`${o.xtbId}-${o.row}`} className="border-t border-stone-100 dark:border-white/5">
                        <td className="px-3 py-1 tabular">{formatDate(o.date)}</td>
                        <td className="px-3 py-1">
                          <Badge tone={KIND_LABELS[o.kind]?.tone}>{KIND_LABELS[o.kind]?.label}</Badge>
                        </td>
                        <td className="max-w-[14rem] truncate px-3 py-1 text-stone-500">{o.type}</td>
                        <td className="px-3 py-1">{o.symbol || '—'}</td>
                        <td className="px-3 py-1 text-right tabular">{formatPLN(o.amount, { sign: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
              Importuj {total} operacji na „{account?.name}”
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

// Podgląd i import otwartych pozycji (arkusz „Open Positions”)
function OpenPositionsPreview({ analysis, mapping, setMap, account, onDone }) {
  const { state, actions } = useApp();
  const hasOther = state.trades.some((t) => t.accountId === account.id && !String(t.id).startsWith(`xtbpos_${account.id}_`));
  const [fundCash, setFundCash] = useState(true);
  const [replaceAccount, setReplaceAccount] = useState(hasOther);
  const plan = useMemo(() => buildXtbOpenImport(analysis, mapping, { state, account, fundCash, replaceAccount }), [analysis, mapping, state, account, fundCash, replaceAccount]);
  const t = analysis.totals;

  const run = () => {
    if (plan.newInstruments.length) actions.addMany('instruments', plan.newInstruments);
    actions.removeMany('trades', [...plan.removeTrades, ...plan.trades.map((x) => x.id)]);
    actions.removeMany('cashflows', [...plan.removeCashflows, ...plan.cashflows.map((x) => x.id)]);
    actions.addMany('trades', plan.trades);
    if (plan.cashflows.length) actions.addMany('cashflows', plan.cashflows);
    if (Object.keys(plan.quotes).length) actions.mergeQuotes(plan.quotes);
    actions.notify(`Zaimportowano otwarte pozycje XTB na „${account.name}”: ${analysis.groups.length} walorów, ${plan.trades.length} transz`, 'success');
    onDone();
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="text-xs font-semibold text-stone-500 uppercase">3. Otwarte pozycje („{analysis.sheetName}”) → konto „{account.name}”</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Walory / transze', `${analysis.groups.length} / ${t.lots}`],
          ['Koszt zakupu (PLN)', formatPLN(t.cost)],
          ['Wartość wg XTB', formatPLN(t.value)],
          ['Zysk netto wg XTB', formatPLN(t.profit, { sign: true })],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-lg bg-stone-50 px-3 py-2 dark:bg-white/[0.03]">
            <div className="truncate text-[11px] text-stone-500">{label}</div>
            <div className="truncate text-sm font-semibold tabular">{value}</div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-white/10">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-stone-100 text-left text-xs text-stone-500 dark:border-white/5">
              <th className="px-3 py-2 font-medium">Ticker</th>
              <th className="px-3 py-2 font-medium">Instrument w aplikacji</th>
              <th className="px-3 py-2 font-medium">Rodzaj</th>
              <th className="px-3 py-2 font-medium">Waluta</th>
              <th className="px-3 py-2 text-right font-medium">Liczba jednostek</th>
              <th className="px-3 py-2 text-right font-medium">Śr. cena zakupu</th>
              <th className="px-3 py-2 text-right font-medium">Cena bieżąca</th>
              <th className="px-3 py-2 text-right font-medium">Wartość (PLN)</th>
              <th className="px-3 py-2 text-right font-medium">Zysk (PLN)</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {analysis.groups.map((g) => {
              const m = mapping[g.ticker];
              const avg = g.lots.reduce((s, l) => s + l.quantity * l.openPrice, 0) / g.lots.reduce((s, l) => s + l.quantity, 0);
              return (
                <tr key={g.ticker} className="border-b border-stone-100 last:border-0 dark:border-white/5">
                  <td className="px-3 py-1.5">
                    <div className="font-medium">{g.ticker}</div>
                    <div className="text-[11px] text-stone-500">
                      {g.name} · {g.lots.length} transz
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <Select value={m.instrumentId || ''} onChange={(e) => setMap(g.ticker, { instrumentId: e.target.value || null })} className="h-8 w-auto text-xs" aria-label={`Instrument dla ${g.ticker}`}>
                      <option value="">+ Nowy: {m.ticker}</option>
                      {state.instruments.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.ticker} – {i.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-1.5">
                    {!m.instrumentId && (
                      <Select value={m.kind} onChange={(e) => setMap(g.ticker, { kind: e.target.value })} className="h-8 w-auto text-xs" aria-label={`Rodzaj ${g.ticker}`}>
                        {KIND_OPTIONS.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {!m.instrumentId ? (
                      <Select value={m.currency} onChange={(e) => setMap(g.ticker, { currency: e.target.value })} className="h-8 w-auto text-xs" aria-label={`Waluta ${g.ticker}`}>
                        {CURRENCIES.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </Select>
                    ) : (
                      <span className="text-xs text-stone-500">istniejący</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">{g.volume.toLocaleString('pl-PL', { maximumFractionDigits: 6 })}</td>
                  <td className="px-3 py-1.5 text-right">{avg.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-3 py-1.5 text-right">{(g.currentPrice || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-3 py-1.5 text-right">{formatPLN(g.value)}</td>
                  <td className={`px-3 py-1.5 text-right ${g.profit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{formatPLN(g.profit, { sign: true })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 text-sm">
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={fundCash} onChange={(e) => setFundCash(e.target.checked)} />
          <span>
            Dodaj wpłaty pokrywające koszt zakupu każdej transzy <span className="text-stone-500">(gotówka konta = 0 zł, wkład = koszt pozycji – bez ujemnego salda)</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={replaceAccount} onChange={(e) => setReplaceAccount(e.target.checked)} />
          <span>
            Zastąp dotychczasowe transakcje i wpłaty konta „{account.name}” <span className="text-stone-500">(zalecane – konto będzie odzwierciedlać dokładnie otwarte pozycje z XTB{plan.otherTrades ? `; usunie ${plan.otherTrades} innych transakcji` : ''})</span>
          </span>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" icon={CheckCircle2} onClick={run}>
          Importuj {plan.trades.length} transz na „{account.name}”
        </Button>
        <Button onClick={onDone}>Anuluj</Button>
        {plan.updated > 0 && <Badge>{plan.updated} transz już było – zostaną zaktualizowane</Badge>}
        {plan.removeTrades.length > 0 && <Badge tone="amber">usuniętych transakcji: {plan.removeTrades.length}</Badge>}
      </div>
    </div>
  );
}
