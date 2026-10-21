import { useState } from 'react';
import { AlertTriangle, Download, Trash2 } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { Button, Modal, Toggle } from '../ui.jsx';

// „Usuń wszystkie transakcje”: czyści całą historię operacji (z potwierdzeniem w dwóch krokach).
// Konta, ustawienia, cele i (domyślnie) instrumenty zostają; obligacje są domyślnie usuwane razem z wpłatami.
export default function ClearHistoryButton({ size = 'md', className = '' }) {
  const { state, actions } = useApp();
  const [open, setOpen] = useState(false);
  const [bonds, setBonds] = useState(true);
  const [instruments, setInstruments] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [typed, setTyped] = useState('');

  const counts = [
    ['transakcji kupna/sprzedaży', state.trades.length],
    ['wpłat i wypłat', state.cashflows.length],
    ['dywidend i odsetek', state.income.length],
    ['pozycji harmonogramu dywidend', state.dividendSchedule.length],
    ['migawek historii wartości', state.snapshots.length],
    ...(bonds ? [['transz obligacji', state.bonds.length]] : []),
    ...(instruments ? [['instrumentów', state.instruments.length]] : []),
  ];
  const total = counts.reduce((s, [, n]) => s + n, 0);
  const ready = understood && typed.trim().toUpperCase() === 'USUŃ';

  const close = () => {
    setOpen(false);
    setUnderstood(false);
    setTyped('');
  };
  const run = () => {
    actions.clearHistory({ bonds, instruments });
    actions.notify('Usunięto całą historię transakcji – portfel jest czysty', 'info');
    close();
  };

  return (
    <>
      <Button variant="danger" size={size} icon={Trash2} className={className} onClick={() => setOpen(true)}>
        Usuń wszystkie transakcje
      </Button>
      <Modal
        open={open}
        onClose={close}
        title="Usunąć wszystkie transakcje?"
        footer={
          <>
            <Button onClick={close}>Anuluj</Button>
            <Button variant="danger" icon={Trash2} disabled={!ready || total === 0} onClick={run}>
              Tak, usuń {total} pozycji
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <div className="flex gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-red-900 dark:bg-red-500/10 dark:text-red-200">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              Zostanie usunięta cała historia operacji – portfel wróci do stanu czystego. Konta, ustawienia, limity i cele zostają.
              <ul className="mt-1.5 list-disc pl-5 text-xs">
                {counts.map(([label, n]) => (
                  <li key={label}>
                    {n} {label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="space-y-3">
            <Toggle checked={bonds} onChange={setBonds} label="Usuń także obligacje skarbowe" description={`${state.bonds.length} transz w rejestrze. Pozostawienie obligacji bez wpłat da ujemną gotówkę na koncie obligacji.`} />
            <Toggle checked={instruments} onChange={setInstruments} label="Usuń także listę instrumentów" description="Tickery, TER i wagi docelowe instrumentów – przy imporcie z XTB zostaną utworzone ponownie" />
          </div>
          <Button size="sm" icon={Download} onClick={() => actions.exportState()}>
            Najpierw pobierz kopię zapasową (JSON)
          </Button>
          <div className="space-y-2 border-t border-stone-100 pt-3 dark:border-white/5">
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-red-600" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
              Rozumiem, że tej operacji nie można cofnąć.
            </label>
            <label className="block text-xs text-stone-600 dark:text-stone-300">
              Wpisz <strong>USUŃ</strong>, aby potwierdzić:
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                aria-label="Potwierdzenie usunięcia"
                className="mt-1 block h-9 w-40 rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-white/10 dark:bg-neutral-800"
              />
            </label>
          </div>
        </div>
      </Modal>
    </>
  );
}
