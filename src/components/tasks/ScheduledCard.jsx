import { CalendarClock, ChevronRight, Repeat } from 'lucide-react';
import TaskAccordion from './TaskAccordion.jsx';

// Zadania zaplanowane na przyszłe okresy (start po bieżącym dniu / tygodniu / miesiącu) – pojawią się na liście
// dopiero w swoim okresie; kliknięcie przenosi do tego okresu. Zwijana sekcja (domyślnie zwinięta). items: [{ id, title, isRecurring, period, label }]
export default function ScheduledCard({ items, onOpen, unitLabel }) {
  return (
    <TaskAccordion title="Zaplanowane" count={items.length} hint={`Zadania na przyszłe ${unitLabel} – pojawią się na liście w swoim terminie`}>
      {items.length === 0 ? (
        <p className="px-2 py-4 text-center text-sm text-stone-500 dark:text-stone-400">Brak zaplanowanych zadań. Przejdź strzałką → do przyszłego okresu albo wybierz datę w polu „Zaplanuj na”.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.id}>
              <button type="button" onClick={() => onOpen(it.period)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-stone-50 dark:hover:bg-white/[0.03]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{it.title}</span>
                  <span className="block text-[11px] font-semibold text-violet-700 tabular first-letter:uppercase dark:text-violet-300">{it.label}</span>
                </span>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${it.isRecurring ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'bg-stone-100 text-stone-600 dark:bg-white/[0.06] dark:text-stone-300'}`}>
                  {it.isRecurring && <Repeat size={10} />}
                  {it.isRecurring ? 'od tego terminu' : 'jednorazowo'}
                </span>
                <ChevronRight size={16} className="shrink-0 text-stone-400" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </TaskAccordion>
  );
}

// Wspólne: pole „Zaplanuj na” (wybór daty / miesiąca przenosi widok do tego okresu)
export function PlanInput({ type = 'date', value, min, onChange, label }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-stone-500 dark:text-stone-400">
      <CalendarClock size={13} className="shrink-0" />
      <span className="shrink-0">Zaplanuj na</span>
      <input
        type={type}
        value={value}
        min={min}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        aria-label={label}
        className="h-8 min-w-0 rounded-lg border border-stone-200 bg-white px-2 text-xs text-stone-700 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-neutral-800 dark:text-stone-200 dark:[color-scheme:dark]"
      />
    </label>
  );
}
