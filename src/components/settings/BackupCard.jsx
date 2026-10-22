import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, Download, FileUp, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { COLLECTIONS } from '../../state/schema.js';
import { collectionLabel, validateBackup } from '../../lib/backup.js';
import { formatDateTime } from '../../lib/format.js';
import { Badge, Button, Card, Modal, Toggle } from '../ui.jsx';
import ClearHistoryButton from './ClearHistoryButton.jsx';

function daysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export default function BackupCard() {
  const { state, actions } = useApp();
  const fileRef = useRef(null);
  const [confirm, setConfirm] = useState(null);
  const [preview, setPreview] = useState(null); // { name, raw, report }
  const [backupFirst, setBackupFirst] = useState(true);
  const size = new Blob([JSON.stringify(state)]).size;
  const since = daysSince(state.meta.lastBackupAt);
  const stale = since === null || since > 30;

  const onFile = async (file) => {
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      setPreview({ name: file.name, raw, report: validateBackup(raw) });
    } catch (e) {
      setPreview({ name: file.name, raw: null, report: { ok: false, errors: [`Plik nie jest poprawnym JSON: ${e.message}`], warnings: [], info: null } });
    }
  };

  const doImport = () => {
    if (backupFirst) actions.exportState();
    // Dane po naprawie rekordów (wartości domyślne dla brakujących pól)
    actions.importRaw(preview.report?.data || preview.raw);
    setPreview(null);
  };

  const r = preview?.report;

  return (
    <Card title="Kopia zapasowa danych" subtitle="Cały portfel, transakcje i ustawienia w jednym pliku JSON – przywrócisz je po odświeżeniu, wyczyszczeniu przeglądarki lub na innym urządzeniu" icon={Database}>
      <div
        className={`mb-4 flex items-start gap-3 rounded-xl px-4 py-3 text-sm ${
          stale ? 'bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200' : 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200'
        }`}
      >
        {stale ? <AlertTriangle size={18} className="mt-0.5 shrink-0" /> : <ShieldCheck size={18} className="mt-0.5 shrink-0" />}
        <div>
          <div className="font-medium">
            {since === null ? 'Nie wykonano jeszcze kopii zapasowej' : `Ostatnia kopia: ${formatDateTime(state.meta.lastBackupAt)} (${since === 0 ? 'dziś' : `${since} dni temu`})`}
          </div>
          <div className="text-xs opacity-80">Dane są przechowywane tylko w tej przeglądarce. Eksportuj kopię regularnie (np. raz w miesiącu) i trzymaj ją w chmurze lub na dysku.</div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={actions.exportState}
          className="flex items-center gap-3 rounded-xl border-2 border-blue-600 bg-blue-600 px-4 py-4 text-left text-white transition hover:bg-blue-700 dark:border-blue-500 dark:bg-blue-500 dark:text-neutral-950 dark:hover:bg-blue-400"
        >
          <Download size={24} className="shrink-0" />
          <span>
            <span className="block font-semibold">Pobierz kopię zapasową (JSON)</span>
            <span className="block text-xs opacity-90">majatek-backup-RRRR-MM-DD_GG-MM.json</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-3 rounded-xl border-2 border-stone-300 px-4 py-4 text-left transition hover:bg-stone-50 dark:border-white/15 dark:hover:bg-white/5"
        >
          <FileUp size={24} className="shrink-0" />
          <span>
            <span className="block font-semibold">Wczytaj kopię zapasową</span>
            <span className="block text-xs text-stone-500 dark:text-stone-400">wybierz plik .json – podgląd i sprawdzenie przed przywróceniem</span>
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            await onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
        {COLLECTIONS.map((c) => (
          <span key={c}>
            {collectionLabel(c)}: <strong className="tabular">{state[c]?.length || 0}</strong>
          </span>
        ))}
        <span>
          Rozmiar ≈ <strong>{(size / 1024).toFixed(0)} KB</strong>
        </span>
        <span>Ostatnia zmiana {formatDateTime(state.meta.updatedAt)}</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-100 pt-4 dark:border-white/5">
        <Button size="sm" icon={RotateCcw} onClick={() => setConfirm('demo')}>
          Wczytaj dane demo
        </Button>
        <ClearHistoryButton size="sm" />
        <Button size="sm" variant="danger" icon={Trash2} onClick={() => setConfirm('empty')}>
          Wyczyść wszystko
        </Button>
      </div>

      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={`Wczytaj kopię zapasową: ${preview?.name || ''}`}
        footer={
          <>
            <Button onClick={() => setPreview(null)}>Anuluj</Button>
            <Button variant="primary" icon={FileUp} disabled={!r?.ok} onClick={doImport}>
              Przywróć dane z kopii
            </Button>
          </>
        }
      >
        {r && (
          <div className="space-y-4 text-sm">
            <div
              className={`flex items-center gap-2 rounded-lg px-3 py-2 font-medium ${
                r.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-300'
              }`}
            >
              {r.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              {r.ok ? 'Struktura pliku poprawna' : 'Pliku nie można zaimportować'}
            </div>
            {r.errors.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-red-700 dark:text-red-300">
                {r.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            {r.warnings.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-amber-800 dark:text-amber-300">
                {r.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            {r.info && (
              <div className="rounded-lg bg-stone-50 p-3 dark:bg-white/[0.03]">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                  <span>Utworzono: {r.info.exportedAt ? formatDateTime(r.info.exportedAt) : 'nieznana data'}</span>
                  <Badge>wersja {r.info.version}</Badge>
                  {r.info.demo && <Badge tone="amber">dane demo</Badge>}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs tabular">
                  {COLLECTIONS.map((c) => (
                    <div key={c} className="flex justify-between">
                      <span className="text-stone-500">{collectionLabel(c)}</span>
                      <span className="font-medium">
                        {r.info.counts[c] ?? 0}
                        <span className="text-stone-400"> (teraz {state[c]?.length || 0})</span>
                      </span>
                    </div>
                  ))}
                </div>
                {r.info.accounts.length > 0 && <div className="mt-2 text-xs text-stone-500">Konta: {r.info.accounts.join(', ')}</div>}
              </div>
            )}
            {r.ok && <Toggle checked={backupFirst} onChange={setBackupFirst} label="Najpierw pobierz kopię obecnych danych" description="Zalecane – import zastępuje cały obecny stan" />}
          </div>
        )}
      </Modal>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm === 'demo' ? 'Wczytać dane demonstracyjne?' : 'Wyczyścić wszystkie dane?'}
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>Anuluj</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirm === 'demo') actions.loadDemo();
                else actions.resetEmpty();
                actions.notify(confirm === 'demo' ? 'Wczytano dane demo' : 'Wyczyszczono dane', 'info');
                setConfirm(null);
              }}
            >
              {confirm === 'demo' ? 'Zastąp danymi demo' : 'Wyczyść'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-stone-600 dark:text-stone-300">Obecne dane zostaną nadpisane. Jeśli chcesz je zachować, najpierw wyeksportuj kopię do pliku JSON.</p>
      </Modal>
    </Card>
  );
}
