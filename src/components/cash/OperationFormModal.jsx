import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { ACCOUNT_TYPES } from '../../lib/constants.js';
import { accountFxPct, bondIncomeEvents, computeCashBalances, fxConversionPct, incomeEventsWithTax, limitDeposits, tradeAmounts } from '../../lib/engine.js';
import { belkaRateForAccount, limitForAccount } from '../../lib/tax.js';
import { formatPLN, todayISO } from '../../lib/format.js';
import { Button, Field, Input, Modal, Segmented, Select } from '../ui.jsx';

const CURRENCIES = ['PLN', 'USD', 'EUR', 'GBP', 'CHF'];

export const emptyOperation = (accountId) => ({
  id: null,
  mode: 'DEPOSIT',
  date: todayISO(),
  accountId: accountId || '',
  amount: '',
  note: '',
  instrumentId: '',
  quantity: '',
  price: '',
  fxRate: '',
  fee: '',
  newInstrument: { ticker: '', name: '', kind: 'STOCK', currency: 'PLN', yahooSymbol: '' },
  targetBalance: '',
  diffAs: 'FLOW',
});

// Formularz z rejestru dla edycji istniejącej wpłaty/wypłaty lub transakcji
export function operationFromCashflow(c) {
  return { ...emptyOperation(c.accountId), id: c.id, mode: c.type, date: c.date, amount: String(c.amount), note: c.note || '', instrumentId: c.instrumentId || '' };
}
export function operationFromTrade(t) {
  return {
    ...emptyOperation(t.accountId),
    id: t.id,
    mode: t.side,
    date: t.date,
    note: t.note || '',
    instrumentId: t.instrumentId,
    quantity: String(t.quantity),
    price: String(t.price),
    fxRate: String(t.fxRate ?? 1),
    fee: t.fee ? String(t.fee) : '',
  };
}

function num(v) {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function modesFor(account) {
  if (!account) return [];
  const base = [
    { value: 'DEPOSIT', label: 'Wpłata' },
    { value: 'WITHDRAWAL', label: 'Wypłata' },
  ];
  if (account.type === 'SAVINGS') return [...base, { value: 'BALANCE', label: 'Ustal saldo' }];
  if (account.type === 'BONDS') return base;
  return [...base, { value: 'BUY', label: 'Kupno' }, { value: 'SELL', label: 'Sprzedaż' }];
}

// Wpłata/wypłata (z opcjonalnym aktywem), kupno/sprzedaż instrumentu lub ustalenie salda konta oszczędnościowego.
// onSave otrzymuje listę zapisów: [{ collection, item }] oraz nowe instrumenty.
export default function OperationFormModal({ form, setForm, onSave }) {
  const { state } = useApp();
  const open = !!form;
  const f = form || emptyOperation();
  const set = (patch) => setForm({ ...f, ...patch });
  const account = state.accounts.find((a) => a.id === f.accountId);
  const modes = modesFor(account);
  const mode = modes.some((m) => m.value === f.mode) ? f.mode : 'DEPOSIT';
  const isTrade = mode === 'BUY' || mode === 'SELL';
  const isBroker = account && account.type !== 'SAVINGS' && account.type !== 'BONDS';
  const year = Number((f.date || todayISO()).slice(0, 4));
  const amount = num(f.amount);

  // Saldo gotówki konta na dzień operacji (bez edytowanej pozycji)
  const balance = useMemo(() => {
    if (!account || !open) return 0;
    const others = { ...state, cashflows: state.cashflows.filter((c) => c.id !== f.id), trades: state.trades.filter((t) => t.id !== f.id) };
    const income = [...incomeEventsWithTax(others), ...bondIncomeEvents(others, f.date || todayISO())];
    return computeCashBalances(others, f.date || todayISO(), [account.id], income)[account.id] || 0;
  }, [state, account, f.id, f.date, open]);

  const limit = account ? limitForAccount(account, state.settings, year) : 0;
  // Wpłaty liczone do limitu bez rotacji wewnątrz konta i bez wpłat technicznych
  const yearDeposits = account ? limitDeposits(state, account.id, year, { excludeId: f.id }) : 0;
  const remaining = Math.max(0, limit - yearDeposits);

  // Instrument transakcji (istniejący lub nowy)
  const newInst = f.newInstrument || emptyOperation().newInstrument;
  const instrument = f.instrumentId && f.instrumentId !== '__new' ? state.instruments.find((i) => i.id === f.instrumentId) : null;
  const tradeCcy = instrument?.currency || (f.instrumentId === '__new' ? newInst.currency : 'PLN');
  const defaultFx = tradeCcy === 'PLN' ? 1 : state.prices.fx?.rates?.[tradeCcy] || 1;
  const fxRate = f.fxRate === '' ? defaultFx : num(f.fxRate);
  const tradeDraft = { quantity: num(f.quantity), price: num(f.price), fxRate, fee: num(f.fee), currency: tradeCcy };
  const tradeCalc = tradeAmounts(tradeDraft, account, instrument || { currency: tradeCcy });
  const fxPct = fxConversionPct(account, instrument || { currency: tradeCcy }, tradeDraft);
  const held = instrument
    ? state.trades
        .filter((t) => t.accountId === f.accountId && t.instrumentId === instrument.id && t.id !== f.id && t.date <= (f.date || todayISO()))
        .reduce((s, t) => s + (t.side === 'BUY' ? 1 : -1) * Number(t.quantity), 0)
    : 0;

  // Ustal saldo (konto oszczędnościowe): różnica jako wpłata/wypłata albo odsetki
  const target = num(f.targetBalance);
  const diff = Math.round((target - balance) * 100) / 100;
  const belka = account ? belkaRateForAccount(account) : 0;

  const errors = [];
  const warnings = [];
  if (!f.accountId) errors.push('Wybierz konto.');
  if (!f.date) errors.push('Podaj datę.');
  if (mode === 'DEPOSIT' || mode === 'WITHDRAWAL') {
    if (!(amount > 0)) errors.push('Kwota musi być większa od zera.');
    if (mode === 'DEPOSIT' && limit > 0 && amount > remaining) warnings.push(`Wpłata przekracza roczny limit ${ACCOUNT_TYPES[account.type].label} ${year} o ${formatPLN(amount - remaining)} (pozostało ${formatPLN(remaining)}).`);
    if (mode === 'WITHDRAWAL' && amount > balance + 0.005) warnings.push(`Wypłata przekracza dostępną gotówkę na koncie (${formatPLN(balance)}). Najpierw zarejestruj sprzedaż aktywów.`);
    if (mode === 'WITHDRAWAL' && account && (account.type === 'IKE' || account.type === 'IKZE')) warnings.push(`Wypłata z ${ACCOUNT_TYPES[account.type].label} przed osiągnięciem wieku emerytalnego oznacza zwrot – utratę preferencji podatkowych.`);
  }
  if (isTrade) {
    if (!f.instrumentId) errors.push('Wybierz instrument.');
    if (f.instrumentId === '__new' && !newInst.ticker.trim()) errors.push('Podaj ticker nowego instrumentu.');
    if (!(num(f.quantity) > 0)) errors.push('Liczba jednostek musi być większa od zera.');
    if (!(num(f.price) > 0)) errors.push('Podaj cenę.');
    if (mode === 'BUY' && tradeCalc.buyCost > balance + 0.005) warnings.push(`Zakup za ${formatPLN(tradeCalc.buyCost)} przekracza gotówkę na koncie (${formatPLN(balance)}) – dodaj najpierw wpłatę.`);
    if (mode === 'SELL' && instrument && num(f.quantity) > held + 1e-9) warnings.push(`Sprzedajesz więcej niż posiadasz na tym koncie (${held} szt.).`);
  }
  if (mode === 'BALANCE') {
    if (f.targetBalance === '' || target < 0) errors.push('Podaj bieżącą wartość konta.');
    else if (Math.abs(diff) < 0.01) errors.push('Saldo już jest równe tej kwocie.');
  }

  const save = () => {
    const writes = [];
    const instruments = [];
    if (mode === 'DEPOSIT' || mode === 'WITHDRAWAL') {
      writes.push({
        collection: 'cashflows',
        item: {
          ...(f.id ? { id: f.id } : {}),
          date: f.date,
          accountId: f.accountId,
          type: mode,
          amount: Math.round(amount * 100) / 100,
          note: f.note.trim(),
          ...(isBroker && f.instrumentId && f.instrumentId !== '__new' ? { instrumentId: f.instrumentId } : {}),
        },
      });
    } else if (isTrade) {
      let instrumentId = f.instrumentId;
      if (instrumentId === '__new') {
        const ticker = newInst.ticker.trim().toUpperCase();
        instrumentId = `inst_${ticker.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now().toString(36)}`;
        instruments.push({
          id: instrumentId,
          ticker,
          name: newInst.name.trim() || ticker,
          kind: newInst.kind,
          currency: newInst.currency,
          yahooSymbol: newInst.yahooSymbol.trim() || (newInst.currency === 'PLN' ? `${ticker}.WA` : ticker),
          ter: 0,
          sector: '',
        });
      }
      writes.push({
        collection: 'trades',
        item: {
          ...(f.id ? { id: f.id } : {}),
          accountId: f.accountId,
          instrumentId,
          date: f.date,
          side: mode,
          quantity: num(f.quantity),
          price: num(f.price),
          currency: tradeCcy,
          fxRate,
          fee: num(f.fee),
          note: f.note.trim(),
        },
      });
    } else if (mode === 'BALANCE') {
      // Zmiana salda konta oszczędnościowego – transfer w obrębie oszczędności, nie wypłata z portfela
      const note = f.note.trim() || `Zmiana salda do ${formatPLN(target)}`;
      if (diff > 0 && f.diffAs === 'INTEREST') {
        const gross = belka > 0 && belka < 1 ? diff / (1 - belka) : diff;
        writes.push({ collection: 'income', item: { accountId: f.accountId, date: f.date, type: 'INTEREST', gross: Math.round(gross * 100) / 100, foreignTax: 0, note } });
      } else {
        writes.push({ collection: 'cashflows', item: { date: f.date, accountId: f.accountId, type: diff > 0 ? 'DEPOSIT' : 'WITHDRAWAL', amount: Math.abs(diff), note, source: 'BALANCE' } });
      }
    }
    onSave({ writes, instruments });
  };

  return (
    <Modal
      open={open}
      onClose={() => setForm(null)}
      title={f.id ? 'Edytuj operację' : 'Nowa operacja'}
      footer={
        <>
          <Button onClick={() => setForm(null)}>Anuluj</Button>
          <Button variant="primary" disabled={errors.length > 0} onClick={save}>
            Zapisz
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Konto">
            <Select value={f.accountId} onChange={(e) => set({ accountId: e.target.value })} disabled={!!f.id}>
              <option value="" disabled>
                Wybierz konto…
              </option>
              {state.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({ACCOUNT_TYPES[a.type].label})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Data">
            <Input type="date" value={f.date} max={todayISO()} onChange={(e) => set({ date: e.target.value })} />
          </Field>
        </div>

        {modes.length > 0 && (
          <Segmented
            options={f.id ? modes.filter((m) => (isTrade ? m.value === 'BUY' || m.value === 'SELL' : m.value === 'DEPOSIT' || m.value === 'WITHDRAWAL')) : modes}
            value={mode}
            onChange={(v) => set({ mode: v })}
            ariaLabel="Rodzaj operacji"
          />
        )}

        {(mode === 'DEPOSIT' || mode === 'WITHDRAWAL') && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Kwota (PLN)" hint={mode === 'DEPOSIT' && limit > 0 ? `Pozostały limit ${year}: ${formatPLN(remaining)}` : mode === 'WITHDRAWAL' && account ? `Dostępna gotówka: ${formatPLN(balance)}` : undefined}>
              <Input type="number" min="0" step="0.01" inputMode="decimal" value={f.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="0,00" autoFocus />
            </Field>
            {isBroker && (
              <Field label="Dotyczy aktywa (opcjonalnie)" hint="Np. wpłata przeznaczona na zakup konkretnego ETF">
                <Select value={f.instrumentId === '__new' ? '' : f.instrumentId} onChange={(e) => set({ instrumentId: e.target.value })}>
                  <option value="">— bez przypisania —</option>
                  {state.instruments.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.ticker} – {i.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Opis (opcjonalnie)" className={isBroker ? 'sm:col-span-2' : ''}>
              <Input value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="np. Wpłata miesięczna" />
            </Field>
          </div>
        )}

        {isTrade && (
          <div className="space-y-3">
            <Field label="Instrument (aktywo)">
              <Select value={f.instrumentId} onChange={(e) => set({ instrumentId: e.target.value, fxRate: '' })}>
                <option value="" disabled>
                  Wybierz instrument…
                </option>
                {state.instruments.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.ticker} – {i.name} ({i.currency})
                  </option>
                ))}
                <option value="__new">+ Nowy instrument…</option>
              </Select>
            </Field>
            {f.instrumentId === '__new' && (
              <div className="grid grid-cols-2 gap-3 rounded-lg bg-stone-50 p-3 sm:grid-cols-4 dark:bg-white/[0.03]">
                <Field label="Ticker">
                  <Input value={newInst.ticker} onChange={(e) => set({ newInstrument: { ...newInst, ticker: e.target.value } })} placeholder="np. LPP" />
                </Field>
                <Field label="Nazwa">
                  <Input value={newInst.name} onChange={(e) => set({ newInstrument: { ...newInst, name: e.target.value } })} />
                </Field>
                <Field label="Rodzaj">
                  <Select value={newInst.kind} onChange={(e) => set({ newInstrument: { ...newInst, kind: e.target.value } })}>
                    <option value="STOCK">Akcja</option>
                    <option value="ETF">ETF/ETC/ETN</option>
                  </Select>
                </Field>
                <Field label="Waluta">
                  <Select value={newInst.currency} onChange={(e) => set({ newInstrument: { ...newInst, currency: e.target.value }, fxRate: '' })}>
                    {CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Symbol Yahoo (opcjonalnie)" className="col-span-2 sm:col-span-4" hint="Np. LPP.WA, VWCE.DE – do notowań; puste = ticker + .WA dla PLN">
                  <Input value={newInst.yahooSymbol} onChange={(e) => set({ newInstrument: { ...newInst, yahooSymbol: e.target.value } })} />
                </Field>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Liczba jednostek" hint={mode === 'SELL' && instrument ? `Posiadasz: ${held}` : undefined}>
                <Input type="number" min="0" step="any" value={f.quantity} onChange={(e) => set({ quantity: e.target.value })} />
              </Field>
              <Field label={`Cena (${tradeCcy})`}>
                <Input type="number" min="0" step="any" value={f.price} onChange={(e) => set({ price: e.target.value })} />
              </Field>
              <Field label={`Kurs ${tradeCcy}/PLN`}>
                <Input type="number" min="0" step="any" value={tradeCcy === 'PLN' ? '1' : f.fxRate === '' ? String(defaultFx) : f.fxRate} disabled={tradeCcy === 'PLN'} onChange={(e) => set({ fxRate: e.target.value })} />
              </Field>
              <Field label="Prowizja (PLN)">
                <Input type="number" min="0" step="0.01" value={f.fee} onChange={(e) => set({ fee: e.target.value })} placeholder="0" />
              </Field>
            </div>
            <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm tabular dark:bg-white/[0.03]">
              Wartość: <strong>{formatPLN(tradeCalc.gross)}</strong>
              {tradeCalc.fxFee > 0 && (
                <span className="text-stone-500">
                  {' '}
                  · przewalutowanie {String(accountFxPct(account)).replace('.', ',')}%: {formatPLN(tradeCalc.fxFee)}
                </span>
              )}
              {tradeCalc.fee > 0 && <span className="text-stone-500"> · prowizja {formatPLN(tradeCalc.fee)}</span>} ·{' '}
              {mode === 'BUY' ? 'Koszt' : 'Wpływ'}: <strong>{formatPLN(mode === 'BUY' ? tradeCalc.buyCost : tradeCalc.sellProceeds)}</strong>
              {fxPct === 0 && tradeCcy !== 'PLN' && <span className="text-stone-500"> · bez prowizji FX dla tego konta</span>}
            </div>
            <Field label="Opis (opcjonalnie)">
              <Input value={f.note} onChange={(e) => set({ note: e.target.value })} />
            </Field>
          </div>
        )}

        {mode === 'BALANCE' && (
          <div className="space-y-3">
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Zamiast wpisywać każdą wpłatę osobno, podaj całkowitą bieżącą wartość konta na wybrany dzień. Aplikacja dopisze różnicę względem obecnego salda.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Wartość konta na ten dzień (PLN)" hint={`Saldo w aplikacji: ${formatPLN(balance)}`}>
                <Input type="number" min="0" step="0.01" inputMode="decimal" value={f.targetBalance} onChange={(e) => set({ targetBalance: e.target.value })} autoFocus />
              </Field>
              <Field label="Opis (opcjonalnie)">
                <Input value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="Aktualizacja salda" />
              </Field>
            </div>
            {f.targetBalance !== '' && Math.abs(diff) >= 0.01 && (
              <div className="space-y-2 rounded-lg bg-stone-50 p-3 text-sm dark:bg-white/[0.03]">
                <div className="tabular">
                  Różnica: <strong className={diff >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>{formatPLN(diff, { sign: true })}</strong>
                </div>
                {diff > 0 ? (
                  <Segmented
                    size="sm"
                    value={f.diffAs}
                    onChange={(v) => set({ diffAs: v })}
                    ariaLabel="Zaksięguj różnicę jako"
                    options={[
                      { value: 'FLOW', label: 'Zmiana salda (dopłata / transfer)' },
                      { value: 'INTEREST', label: 'Odsetki (zysk)' },
                    ]}
                  />
                ) : (
                  <div className="text-xs text-stone-500">Spadek salda zostanie zapisany jako zmiana salda (transfer w obrębie oszczędności) – nie jest wypłatą.</div>
                )}
                {diff > 0 && f.diffAs === 'INTEREST' && belka > 0 && (
                  <div className="text-xs text-stone-500">Odsetki brutto {formatPLN(diff / (1 - belka))} – po podatku Belki saldo wzrośnie o {formatPLN(diff)}.</div>
                )}
              </div>
            )}
          </div>
        )}

        {warnings.length > 0 && (
          <ul className="space-y-1.5">
            {warnings.map((w) => (
              <li key={w} className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-300">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {w}
              </li>
            ))}
          </ul>
        )}
        {account?.type === 'IKZE' && mode === 'DEPOSIT' && amount > 0 && <p className="text-xs text-stone-500 dark:text-stone-400">Wpłata obniży podstawę opodatkowania w PIT za {year}.</p>}
      </div>
    </Modal>
  );
}
