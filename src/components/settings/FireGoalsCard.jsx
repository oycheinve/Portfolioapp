import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Target } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { formatPLN } from '../../lib/format.js';
import { Field, Input, Segmented, Toggle } from '../ui.jsx';

// Cele FIRE (przeniesione z widoku symulacji): rok, docelowy majątek i miesięczny dochód z dywidend.
// Sekcja zwijana – domyślnie zwinięta (otwarta przy wejściu z widoku FIRE: #/settings/fire)
export default function FireGoalsCard({ defaultOpen = false }) {
  const { state, actions } = useApp();
  const fire = state.settings.fire;
  const setFire = (patch) => actions.updateSettings({ fire: { ...fire, ...patch } });
  const minYear = new Date().getFullYear() + 1;
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef(null);
  useEffect(() => {
    if (defaultOpen) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [defaultOpen]);
  return (
    <section ref={ref} className="min-w-0 scroll-mt-20 rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="fire-goals-body"
        className={`flex w-full items-center gap-2.5 px-4 py-3 text-left sm:px-5 ${open ? 'border-b border-stone-100 dark:border-white/5' : ''}`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600 dark:bg-white/5 dark:text-stone-300">
          <Target size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">Cele FIRE</span>
          <span className="block truncate text-xs text-stone-500 dark:text-stone-400">
            Kwoty w dzisiejszej sile nabywczej · obecnie {formatPLN(fire.targetMonthlyIncome)} / mies. i {formatPLN(fire.targetNetWorth, { compact: true })} do {fire.targetYear}
          </span>
        </span>
        <span className="hidden text-xs font-medium text-stone-500 sm:inline">{open ? 'Zwiń' : 'Rozwiń'}</span>
        <ChevronDown size={18} className={`shrink-0 text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div id="fire-goals-body" className="p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Docelowy majątek całkowity (zł)">
          <Input type="number" min="0" step="50000" value={fire.targetNetWorth} onChange={(e) => setFire({ targetNetWorth: Number(e.target.value) || 0 })} />
        </Field>
        <Field label="Docelowa miesięczna dywidenda / dochód pasywny (zł)">
          <Input type="number" min="0" step="500" value={fire.targetMonthlyIncome} onChange={(e) => setFire({ targetMonthlyIncome: Number(e.target.value) || 0 })} />
        </Field>
        <Field label="Rok docelowy">
          <Input type="number" min={minYear} max="2100" value={fire.targetYear} onChange={(e) => setFire({ targetYear: Math.max(minYear, Math.min(2100, Number(e.target.value) || 2055)) })} />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-stone-600 dark:text-stone-400">FIRE osiągnięte, gdy</div>
          <Segmented
            size="sm"
            value={fire.criterion}
            onChange={(v) => setFire({ criterion: v })}
            ariaLabel="Kryterium FIRE"
            options={[
              { value: 'BOTH', label: 'Oba cele' },
              { value: 'INCOME', label: 'Dochód' },
              { value: 'NETWORTH', label: 'Majątek' },
            ]}
          />
        </div>
        <Toggle checked={!!fire.includeOtherAssets} onChange={(v) => setFire({ includeOtherAssets: v })} label="Wliczaj nieruchomości i inne aktywa" />
      </div>
        </div>
      )}
    </section>
  );
}
