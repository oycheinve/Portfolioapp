import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { PREFS_CHANGED_EVENT } from '../../lib/budget.js';
import { WEEKLY_KEY, generateWeeklyReview, periodLabel, readWeekly, reviewSunday, weekLabel } from '../../lib/weeklyReview.js';
import { formatPLN, formatPercent, signClass } from '../../lib/format.js';
import { BetaBadge, Card } from '../ui.jsx';

// Pulpit → Przegląd tygodnia (AI): ostatni zapisany przegląd; „Wygeneruj teraz” – za ostatnie 7 dni (1 zapytanie)
export default function WeeklyReviewCard() {
  const { state, actions } = useApp();
  const [all, setAll] = useState(readWeekly);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const on = (e) => (!e.detail?.key || e.detail.key === WEEKLY_KEY) && setAll(readWeekly());
    window.addEventListener(PREFS_CHANGED_EVENT, on);
    return () => window.removeEventListener(PREFS_CHANGED_EVENT, on);
  }, []);
  const keys = Object.keys(all).sort().reverse();
  const key = keys[0] || null;
  const entry = key ? all[key] : null;
  const current = key === reviewSunday();
  const run = async () => {
    setBusy(true);
    try {
      await generateWeeklyReview(state);
      setAll(readWeekly());
    } catch (e) {
      actions.notify(`Przegląd tygodnia: ${e.message}`, 'warn');
    } finally {
      setBusy(false);
    }
  };
  const r = entry?.review;
  const p = entry?.data?.portfel;
  return (
    <Card
      collapsible
      storageKey="fintrack-dash-open-weekly"
      icon={Sparkles}
      title={
        <>
          Przegląd tygodnia
          <BetaBadge />
        </>
      }
      subtitle={entry ? `${periodLabel(entry.period) || `Tydzień ${weekLabel(key)}`}${current ? '' : ' (poprzedni tydzień)'}` : 'Komentarz AI do minionego tygodnia – w niedzielę'}
      summary={p ? `${formatPLN(p.zysk_tydzien_zl, { sign: true })}` : undefined}
    >
      {!entry ? (
        <div className="space-y-2 text-sm text-stone-600 dark:text-stone-300">
          <p>Przegląd przygotuje się sam w niedzielę albo w poniedziałek przy otwarciu aplikacji. Możesz go też wygenerować teraz – za ostatnie 7 dni.</p>
        </div>
      ) : (
        <div className="space-y-2.5 text-sm">
          <p className="font-medium">{r.headline}</p>
          {p && (
            <p className="text-xs text-stone-500 tabular dark:text-stone-400">
              W tygodniu: <span className={signClass(p.zysk_tydzien_zl)}>{formatPLN(p.zysk_tydzien_zl, { sign: true })}</span> ({formatPercent((p.stopa_tydzien_proc || 0) / 100, { sign: true })}) · wartość {formatPLN(p.wartosc_zl)}
            </p>
          )}
          {r.drivers?.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">Co napędziło wynik</div>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                {r.drivers.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          {r.watch?.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">Na co uważać</div>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                {r.watch.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          {r.budget && (
            <div>
              <div className="text-[11px] font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">Budżet w tygodniu</div>
              <p className="mt-0.5">{r.budget}</p>
            </div>
          )}
          {r.milestone && <p className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">🎯 {r.milestone}</p>}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-stone-100 pt-2 text-[11px] text-stone-400 dark:border-white/5">
        <span>{entry ? `Wygenerowano ${new Date(entry.at).toLocaleString('pl-PL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })} · AI może się mylić` : 'Na podstawie danych portfela – bez rekomendacji'}</span>
        <button type="button" onClick={run} disabled={busy} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-stone-200 px-2.5 font-semibold text-stone-600 hover:bg-stone-50 disabled:opacity-60 dark:border-white/10 dark:text-stone-300 dark:hover:bg-white/5">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} {busy ? 'Przygotowuję…' : entry ? 'Odśwież' : 'Wygeneruj teraz'}
        </button>
      </div>
    </Card>
  );
}
