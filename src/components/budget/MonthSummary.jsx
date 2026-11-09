import { useState } from 'react';
import { Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { generateMonthSummary, monthStats, readBudgetAi, writeBudgetAi } from '../../lib/budgetAi.js';
import { formatPLN } from '../../lib/format.js';
import { BetaBadge } from '../ui.jsx';

// Poprzedni miesiąc w Budżecie: „Wyświetl podsumowanie miesięczne od AI” – statystyki + analiza AI (z archiwum,
// a gdy jej brak – wygenerowanie na żądanie). Kropka „nowe”, gdy podsumowanie powstało automatycznie i nie było oglądane.
export default function MonthSummary({ month, label }) {
  const [entry, setEntry] = useState(() => readBudgetAi()[month] || null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const stats = entry?.stats || monthStats(month);
  if (!stats) return null;
  const run = async () => {
    setBusy(true);
    setError('');
    try {
      setEntry(await generateMonthSummary(month));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const show = () => {
    setOpen(true);
    if (entry && !entry.seen) {
      const all = readBudgetAi();
      all[month] = { ...entry, seen: true };
      writeBudgetAi(all);
      setEntry(all[month]);
    }
    if (!entry && !busy) run();
  };
  const s = entry?.summary;
  const diff = stats.planned - stats.spent;
  return (
    <>
      <button type="button" onClick={show} className="relative inline-flex h-9 items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 text-xs font-semibold text-violet-800 hover:bg-violet-100 dark:border-violet-400/25 dark:bg-violet-500/10 dark:text-violet-200">
        <Sparkles size={15} /> Wyświetl podsumowanie miesięczne od AI
        {entry && !entry.seen && <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white dark:ring-neutral-900" aria-label="Nowe podsumowanie" />}
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-stone-50 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] dark:bg-neutral-950" role="dialog" aria-modal="true" aria-label="Podsumowanie miesięczne">
          <header className="flex items-center gap-2 border-b border-stone-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-neutral-900">
            <Sparkles size={18} className="text-violet-600 dark:text-violet-300" />
            <h2 className="min-w-0 flex-1 truncate text-base font-semibold">
              Podsumowanie: {label}
              <BetaBadge />
            </h2>
            <button type="button" onClick={() => setOpen(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-white/5" aria-label="Zamknij podsumowanie">
              <X size={18} />
            </button>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            <div className="grid grid-cols-3 gap-2" aria-label="Statystyki miesiąca">
              {[
                ['Plan', formatPLN(stats.planned), ''],
                ['Wydano', formatPLN(stats.spent), stats.previous ? `poprz. ${formatPLN(stats.previous.spent)}` : ''],
                [diff >= 0 ? 'Zostało' : 'Przekroczono', formatPLN(Math.abs(diff)), `${stats.entries} wpisów · ${stats.receipts} parag.`],
              ].map(([l, v, sub]) => (
                <div key={l} className="min-w-0 rounded-xl bg-white px-3 py-2.5 dark:bg-neutral-900">
                  <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">{l}</div>
                  <div className={`truncate text-base font-semibold tabular ${l === 'Przekroczono' ? 'text-red-600 dark:text-red-400' : l === 'Zostało' ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>{v}</div>
                  {sub && <div className="truncate text-[10px] text-stone-500 dark:text-stone-400">{sub}</div>}
                </div>
              ))}
            </div>
            {stats.overspent.length > 0 && (
              <div className="rounded-xl bg-white p-3 text-sm dark:bg-neutral-900">
                <div className="mb-1 text-[11px] font-semibold tracking-wide text-red-700 uppercase dark:text-red-400">Przekroczone kategorie</div>
                {stats.overspent.map((c) => (
                  <div key={c.name} className="flex justify-between gap-2 tabular">
                    <span>{c.name}</span>
                    <span className="font-medium text-red-600 dark:text-red-400">+{formatPLN(c.over)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-400/20 dark:bg-violet-500/10" aria-label="Analiza AI">
              {busy && (
                <p className="flex items-center gap-2 text-sm text-violet-800 dark:text-violet-200">
                  <Loader2 size={16} className="animate-spin" /> AI analizuje miesiąc…
                </p>
              )}
              {error && <p className="text-sm text-red-600 dark:text-red-400">Nie udało się przygotować podsumowania: {error}</p>}
              {s && !busy && (
                <div className="space-y-2 text-[13px] leading-relaxed">
                  <p className="font-semibold text-stone-800 dark:text-stone-100">{s.headline}</p>
                  {s.highlights.length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-5">
                      {s.highlights.map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ul>
                  )}
                  {s.overspent.length > 0 && (
                    <div>
                      <div className="text-[11px] font-bold tracking-wide text-red-700 uppercase dark:text-red-400">Przekroczenia</div>
                      <ul className="list-disc pl-5">
                        {s.overspent.map((h) => (
                          <li key={h}>{h}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {s.tips.length > 0 && (
                    <div>
                      <div className="text-[11px] font-bold tracking-wide text-violet-700 uppercase dark:text-violet-300">Na kolejny miesiąc</div>
                      <ul className="list-disc pl-5">
                        {s.tips.map((h) => (
                          <li key={h}>{h}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    Dyscyplina budżetowa: <strong>{s.score}/100</strong> · przygotowano {new Date(entry.at).toLocaleString('pl-PL')}
                  </p>
                </div>
              )}
            </div>
            <button type="button" onClick={run} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50 dark:text-violet-300 dark:hover:bg-violet-500/10">
              <RefreshCw size={15} /> {s ? 'Przygotuj ponownie' : 'Przygotuj podsumowanie'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
