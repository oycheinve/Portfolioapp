import { useMemo, useState } from 'react';
import { CloudDownload, LineChart, RefreshCw } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { getCpiTable } from '../../lib/bonds.js';
import { getClient } from '../../lib/cloud.js';
import { formatDateTime } from '../../lib/format.js';
import { Card } from '../ui.jsx';
import { CpiCard } from '../bonds/SavingsSection.jsx';

const pct = (v) => (Number.isFinite(v) ? `${v > 0 ? '+' : ''}${v.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%` : '—');
const monthName = (key) => new Date(`${key}-01T12:00:00`).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });

// Ustawienia → System i Konto → Inflacja CPI (GUS): stan danych z bazy inflation_rates, synchronizacja na żądanie
// (ta sama funkcja co harmonogram) i ręczne korekty odczytów
export default function InflationCard() {
  const { state, actions } = useApp();
  const inf = state.inflation || {};
  const table = useMemo(() => getCpiTable(state.settings, inf), [state.settings, inf]);
  const fetchedKeys = Object.keys(inf.rows || {}).sort();
  const lastKey = Object.keys(table).sort().at(-1);
  const last = lastKey ? table[lastKey] : null;
  const [busy, setBusy] = useState('');

  const reload = async () => {
    setBusy('reload');
    const r = await actions.refreshInflation({ force: true });
    setBusy('');
    actions.notify(r ? `Wczytano ${Object.keys(r.rows).length} miesięcy z bazy` : 'Baza inflacji niedostępna – używana tabela wbudowana', r ? 'success' : 'warn');
  };

  const syncNow = async () => {
    setBusy('sync');
    try {
      let token = '';
      try {
        const sb = await getClient();
        token = (await sb.auth.getSession()).data?.session?.access_token || '';
      } catch {
        // brak Supabase w aplikacji
      }
      if (!token) throw new Error('zaloguj się do chmury, aby uruchomić pobieranie z GUS');
      const res = await fetch('/api/inflation-sync', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      await actions.refreshInflation({ force: true });
      actions.notify(`${body.source}: ostatni odczyt ${body.latest} (${pct(body.latestYoy)} r/r) · zapisano ${body.written} zmian`, 'success');
    } catch (e) {
      actions.notify(`Pobieranie inflacji: ${e.message}`, 'warn');
    } finally {
      setBusy('');
    }
  };

  const btn = 'inline-flex h-9 items-center gap-2 rounded-lg border border-stone-200 px-3 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-white/10 dark:text-stone-200 dark:hover:bg-white/5';
  const status =
    inf.status === 'ok' && fetchedKeys.length
      ? `Baza inflation_rates: ${fetchedKeys.length} miesięcy (${fetchedKeys[0]} – ${fetchedKeys.at(-1)})${inf.updatedAt ? ` · aktualizacja ${formatDateTime(inf.updatedAt)}` : ''}`
      : inf.status === 'loading'
        ? 'Wczytywanie…'
        : `Tabela wbudowana${inf.error ? ` (baza niedostępna: ${inf.error})` : ''}`;

  return (
    <div className="space-y-3">
      <Card title="Inflacja CPI (GUS)" subtitle="Miesięczne odczyty GUS w Supabase – benchmark inflacji w wykresach i obligacje COI/EDO" icon={LineChart}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-stone-50 px-3 py-2.5 dark:bg-white/[0.03]">
            <div className="text-[11px] text-stone-500 dark:text-stone-400">Ostatni odczyt</div>
            <div className="text-lg font-semibold tabular">{last ? pct(last.value) : '—'} <span className="text-xs font-normal text-stone-500">r/r</span></div>
            <div className="text-[11px] text-stone-500 first-letter:uppercase dark:text-stone-400">{lastKey ? `${monthName(lastKey)}${last?.estimate ? ' · szacunek' : ''}` : 'brak danych'}</div>
          </div>
          <div className="rounded-xl bg-stone-50 px-3 py-2.5 dark:bg-white/[0.03]">
            <div className="text-[11px] text-stone-500 dark:text-stone-400">Zmiana m/m</div>
            <div className="text-lg font-semibold tabular">{pct(last?.mom)}</div>
            <div className="text-[11px] text-stone-500 dark:text-stone-400">źródło: {last?.source || '—'}</div>
          </div>
          <div className="rounded-xl bg-stone-50 px-3 py-2.5 text-[11px] text-stone-600 dark:bg-white/[0.03] dark:text-stone-300">
            <div className="text-stone-500 dark:text-stone-400">Dane</div>
            <div className="mt-0.5 leading-snug">{status}</div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={reload} disabled={!!busy} className={btn}>
            <RefreshCw size={15} className={busy === 'reload' ? 'animate-spin' : ''} /> Odśwież z bazy
          </button>
          <button type="button" onClick={syncNow} disabled={!!busy} className={btn}>
            <CloudDownload size={15} className={busy === 'sync' ? 'animate-pulse' : ''} /> Pobierz z GUS teraz
          </button>
        </div>
        <p className="mt-3 text-[11px] text-stone-500 dark:text-stone-400">
          Serwer codziennie sprawdza nowe dane GUS (publikacja: szybki szacunek pod koniec miesiąca, pełne dane w połowie następnego) i zapisuje je w tabeli inflation_rates. Benchmark „Inflacja CPI” w Wykresach to indeks cen z miesięcznych odczytów m/m – porównasz z nim realną stopę zwrotu portfela. Poniżej możesz poprawić pojedyncze odczyty (zapis w Twoich ustawieniach, pierwszeństwo przed bazą).
        </p>
      </Card>
      <CpiCard />
    </div>
  );
}
