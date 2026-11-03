import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

// Minimalistyczna zwijana sekcja zadań (domyślnie zwinięta): nazwa, licznik i dyskretna strzałka; płynne
// rozwijanie (grid-template-rows), zwinięta treść nieaktywna (inert). hint – opis widoczny po rozwinięciu.
export default function TaskAccordion({ title, count, hint, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const [settled, setSettled] = useState(defaultOpen);
  const toggle = () => {
    setSettled(false);
    setOpen((o) => !o);
  };
  return (
    <section className="min-w-0 rounded-2xl border border-stone-200 bg-white dark:border-white/[0.07] dark:bg-neutral-900" aria-label={title}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-2xl px-4 py-2.5 text-left transition-colors hover:bg-stone-50 dark:hover:bg-white/[0.03]"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</span>
        {count != null && <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-500 tabular dark:bg-white/[0.06] dark:text-stone-400">{count}</span>}
        <ChevronDown size={16} className={`shrink-0 text-stone-400 transition-transform duration-300 dark:text-stone-500 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      <div
        className="grid grid-cols-[minmax(0,1fr)] transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && open) setSettled(true);
        }}
      >
        <div className={`min-h-0 ${open && settled ? '' : 'overflow-hidden'}`} inert={open ? undefined : ''} aria-hidden={open ? undefined : true}>
          <div className="px-2 pb-2">
            {hint && <p className="px-2 pb-1.5 text-[11px] text-stone-500 dark:text-stone-400">{hint}</p>}
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
