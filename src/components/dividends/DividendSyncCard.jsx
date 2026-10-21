import { useEffect, useState } from 'react';
import { CloudDownload, RefreshCw } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { runDividendSync } from '../../lib/dividendSync.js';
import { formatDateTime } from '../../lib/format.js';
import { Button, Toggle } from '../ui.jsx';

// Synchronizacja przy otwarciu zakładki Dywidendy (raz na 12 h) – niezależnie od tego, która sekcja jest rozwinięta
export function useDividendAutoSync() {
  const { state, actions } = useApp();
  useEffect(() => {
    const prefs = state.settings.dividendPrefs || {};
    const age = prefs.lastSync ? (Date.now() - new Date(prefs.lastSync).getTime()) / 3600000 : Infinity;
    if (prefs.autoSync !== false && age > 12) runDividendSync(state, actions, { silent: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

// Automatyczne dane dywidend: ustawienia i synchronizacja na żądanie
export default function DividendSyncCard() {
  const { state, actions } = useApp();
  const prefs = state.settings.dividendPrefs || {};
  const [busy, setBusy] = useState(false);
  const setPrefs = (patch) => actions.updateSettings({ dividendPrefs: { ...prefs, ...patch } });

  const sync = async (silent) => {
    setBusy(true);
    try {
      await runDividendSync(state, actions, { silent });
    } finally {
      setBusy(false);
    }
  };

  const auto = state.dividendSchedule.filter((d) => d.source === 'YAHOO' || d.source === 'HISTORY');
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <CloudDownload size={20} className="shrink-0 text-blue-600 dark:text-blue-400" />
      <div className="min-w-0 flex-1 basis-60">
        <div className="text-sm font-semibold">Automatyczne dane dywidend</div>
        <div className="text-xs text-stone-500 dark:text-stone-400">
          {prefs.lastSync ? `Ostatnia synchronizacja ${formatDateTime(prefs.lastSync)} · źródło: ${prefs.lastSyncSource}` : 'Jeszcze nie synchronizowano'} · {auto.length} wpisów automatycznych
        </div>
      </div>
      <Toggle checked={prefs.autoSync !== false} onChange={(v) => setPrefs({ autoSync: v })} label="Przy otwarciu" />
      <Toggle checked={!!prefs.autoBook} onChange={(v) => setPrefs({ autoBook: v })} label="Księguj wypłaty" />
      <Button size="sm" variant="primary" icon={RefreshCw} onClick={() => sync(false)} disabled={busy}>
        {busy ? 'Synchronizacja…' : 'Synchronizuj'}
      </Button>
    </div>
  );
}
