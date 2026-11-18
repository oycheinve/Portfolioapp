// ═══ MODUŁ ODPINANY: Statystyki budżetu (AI w tle) – widok `#/budgetstats` ═══
// Statystyki z Budżetu (src/lib/budgetStats.js) i analiza AI odświeżana w tle. Jak usunąć – README → „Statystyki budżetu”.
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarDays, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { PREFS_CHANGED_EVENT } from '../lib/budget.js';
import { PLAN_HISTORY_KEY, STATS_AI_KEY, STATS_WATCH_KEYS, computeBudgetStats, readStatsAi, runStatsAi, trackPlanChanges } from '../lib/budgetStats.js';
import { aiOn } from '../lib/aiFeatures.js';
import { BetaBadge, Card } from '../components/ui.jsx';

const zl = (v) => (v === null || v === undefined ? '—' : `${Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} zł`);
const n1 = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('pl-PL', { maximumFractionDigits: 1 }));
const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const mLabel = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const th = 'px-2 py-1.5 text-left text-[11px] font-semibold whitespace-nowrap text-stone-500 dark:text-stone-400';
const td = 'px-2 py-1.5 whitespace-nowrap tabular';

function Tile({ label, value, sub }) {
  return (
    <div className="min-w-0 rounded-xl border border-stone-200 p-2.5 dark:border-white/10">
      <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">{label}</div>
      <div className="text-base font-semibold tabular">{value}</div>
      {sub && <div className="truncate text-[11px] text-stone-400">{sub}</div>}
    </div>
  );
}

function List({ title, items, tone }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className={`text-[11px] font-semibold tracking-wide uppercase ${tone || 'text-stone-500 dark:text-stone-400'}`}>{title}</div>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

export default function BudgetStatsView() {
  const { state, actions } = useApp();
  const [ver, setVer] = useState(0);
  const [ai, setAi] = useState(readStatsAi);
  const [busy, setBusy] = useState(false);
  const aiEnabled = aiOn(state.settings, 'budgetStats');
  useEffect(() => {
    trackPlanChanges();
    const on = (e) => {
      const k = e.detail?.key;
      if (!k || STATS_WATCH_KEYS.includes(k) || k === PLAN_HISTORY_KEY) setVer((v) => v + 1);
      if (!k || k === STATS_AI_KEY) setAi(readStatsAi());
    };
    window.addEventListener(PREFS_CHANGED_EVENT, on);
    return () => window.removeEventListener(PREFS_CHANGED_EVENT, on);
  }, []);
  const s = useMemo(() => computeBudgetStats(), [ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = s.months.find((m) => m.current);
  const variable = s.categories.filter((c) => !c.fixed && c.today?.perDayLeft !== null && c.today?.perDayLeft !== undefined);
  const flagged = s.categories.filter((c) => c.today?.overPlan || c.today?.aboveTypical || (c.overPlanRate ?? 0) >= 0.5);

  const refresh = async () => {
    setBusy(true);
    try {
      const r = await runStatsAi(new Date(), { force: true });
      if (r) setAi(r);
    } catch (e) {
      actions.notify(`Statystyki budżetu (AI): ${e.message}`, 'warn');
    } finally {
      setBusy(false);
    }
  };

  if (!s.categories.length) {
    return (
      <Card title="Statystyki budżetu" icon={BarChart3}>
        <p className="text-sm text-stone-600 dark:text-stone-300">Brak danych – uzupełnij Budżet (plan i wydatki), a statystyki pojawią się tutaj.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {aiEnabled && (
        <Card
          icon={Sparkles}
          title={
            <>
              Analiza AI
              <BetaBadge />
            </>
          }
          subtitle={ai ? `Odświeżana w tle po zmianach w budżecie · ${new Date(ai.at).toLocaleString('pl-PL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'Przygotuje się w tle po otwarciu aplikacji'}
          actions={
            <button type="button" onClick={refresh} disabled={busy} className="inline-flex h-8 items-center gap-1 rounded-full border border-stone-200 px-3 text-xs font-semibold text-stone-600 hover:bg-stone-50 disabled:opacity-60 dark:border-white/10 dark:text-stone-300 dark:hover:bg-white/5">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} {busy ? 'Analizuję…' : 'Odśwież'}
            </button>
          }
        >
          {ai ? (
            <div className="space-y-2.5 text-sm">
              <p className="font-medium">{ai.analysis.headline}</p>
              <List title="Obserwacje" items={ai.analysis.insights} />
              <List title="Na co za dużo" items={ai.analysis.overspending} tone="text-amber-700 dark:text-amber-400" />
              <List title="Limity dzienne" items={ai.analysis.dailyLimits} tone="text-blue-700 dark:text-blue-300" />
              <List title="Wskazówki" items={ai.analysis.tips} tone="text-emerald-700 dark:text-emerald-400" />
              <p className="text-[11px] text-stone-400">AI może się mylić – liczby w tabelach poniżej są liczone w aplikacji.</p>
            </div>
          ) : (
            <p className="text-sm text-stone-500 dark:text-stone-400">Jeszcze nie ma analizy – „Odśwież”, aby przygotować ją teraz.</p>
          )}
        </Card>
      )}

      <Card title="Ten miesiąc" icon={CalendarDays} subtitle={`Dzień ${s.elapsed} z ${s.daysInMonth} · zostało ${s.daysLeft} dni (z dzisiejszym)`}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Wydano / plan" value={zl(cur?.spent)} sub={`plan ${zl(cur?.planned)}`} />
          <Tile label="Zakupy" value={cur ? cur.purchases : '—'} sub={cur?.avgPurchase ? `średnio ${zl(cur.avgPurchase)}` : 'z „Dodaj zakup” i paragonów'} />
          <Tile label="Na dzień do końca miesiąca" value={zl(s.summary.perDayLeft)} sub="(plan − wydane) / pozostałe dni" />
          <Tile label="Typowy miesiąc" value={zl(s.summary.meanSpent)} sub={s.summary.monthsWithData ? `σ ${zl(s.summary.sdSpent)} · ${s.summary.monthsWithData} mies.` : 'brak historii'} />
        </div>
        {flagged.length > 0 && (
          <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            <strong>Uwaga:</strong>{' '}
            {flagged
              .slice(0, 6)
              .map((c) => `${c.name}${c.today?.overPlan ? ' – ponad plan' : c.today?.aboveTypical ? ' – ponad typowy poziom (średnia + σ)' : ` – ponad plan w ${Math.round(c.overPlanRate * 100)}% miesięcy`}`)
              .join(' · ')}
          </div>
        )}
        {variable.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-[11px] font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">Ile maksymalnie dziennie (kategorie zmienne)</div>
            <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-white/10">
              <table className="w-full text-[13px]" aria-label="Limity dzienne">
                <thead className="bg-stone-50 dark:bg-white/[0.03]">
                  <tr>
                    <th className={th}>Kategoria</th>
                    <th className={th}>Limit / dzień</th>
                    <th className={th}>Historycznie / dzień</th>
                    <th className={th}>Duży dzień (p90)</th>
                    <th className={th}>Pozostało</th>
                  </tr>
                </thead>
                <tbody>
                  {variable.map((c) => (
                    <tr key={c.key} className="border-t border-stone-100 dark:border-white/5">
                      <td className={`${td} font-medium`}>{c.name}</td>
                      <td className={`${td} font-semibold ${c.perDayHistoric !== null && c.today.perDayLeft < c.perDayHistoric ? 'text-amber-700 dark:text-amber-400' : ''}`}>{zl(c.today.perDayLeft)}</td>
                      <td className={td}>{zl(c.perDayHistoric)}</td>
                      <td className={td}>{zl(c.bigDay)}</td>
                      <td className={td}>{zl(c.today.left)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-[11px] text-stone-400">Bez limitów dziennych: kategorie stałe i opłacane z góry (abonamenty, bilety miesięczne – typ „Stałe koszty” albo ok. 1 zakup w miesiącu) i skokowe (kilka zakupów w miesiącu, np. przejazdy w weekendy) – te oceniane w skali miesiąca.</p>
          </div>
        )}
      </Card>

      <Card title="Kategorie na tle poprzednich miesięcy" icon={BarChart3} subtitle="Średnia, odchylenie standardowe (σ), min–max, jak często ponad plan">
        <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-white/10">
          <table className="w-full text-[13px]" aria-label="Statystyki kategorii">
            <thead className="bg-stone-50 dark:bg-white/[0.03]">
              <tr>
                <th className={th}>Kategoria</th>
                <th className={th}>Ten mies.</th>
                <th className={th}>Średnio</th>
                <th className={th}>σ</th>
                <th className={th}>Min–max</th>
                <th className={th}>Śr. plan</th>
                <th className={th}>Ponad plan</th>
                <th className={th}>Zakupy / mies.</th>
                <th className={th}>Śr. zakup</th>
              </tr>
            </thead>
            <tbody>
              {s.categories.map((c) => (
                <tr key={c.key} className="border-t border-stone-100 dark:border-white/5">
                  <td className={`${td} font-medium`}>
                    {c.name}
                    {(c.fixed || c.lumpy) && <span className="ml-1 rounded bg-stone-100 px-1 text-[10px] text-stone-500 dark:bg-white/10 dark:text-stone-400">{c.fixed ? 'stała' : 'skokowa'}</span>}
                  </td>
                  <td className={`${td} ${c.today?.overPlan || c.today?.aboveTypical ? 'font-semibold text-amber-700 dark:text-amber-400' : ''}`}>{c.today ? `${zl(c.today.spent)} / ${zl(c.today.planned)}` : '—'}</td>
                  <td className={td}>{c.months ? zl(c.meanSpent) : '—'}</td>
                  <td className={td}>{c.months > 1 ? zl(c.sd) : '—'}</td>
                  <td className={td}>{c.months ? `${zl(c.min)} – ${zl(c.max)}` : '—'}</td>
                  <td className={td}>{c.months ? zl(c.meanPlanned) : '—'}</td>
                  <td className={td}>{c.overPlanRate === null ? '—' : `${Math.round(c.overPlanRate * 100)}%`}</td>
                  <td className={td}>{n1(c.purchasesPerMonth)}</td>
                  <td className={td}>{zl(c.avgPurchase)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[11px] text-stone-400">Historia: do 12 poprzednich miesięcy (bez bieżącego). Bez Inwestycji / Oszczędności i „Z oszczędności”. Zakupy – wpisy z „Dodaj zakup” i paragonów.</p>
      </Card>

      <Card title="Miesiące i zmiany założeń" icon={CalendarDays} subtitle={s.summary.meanPlanChanges !== null ? `Średnio ${n1(s.summary.meanPlanChanges)} zmian planu w miesiącu, plan zmienia się średnio o ${zl(s.summary.meanPlanDelta)}` : 'Zmiany planu w trakcie miesiąca zapisywane od teraz'}>
        <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-white/10">
          <table className="w-full text-[13px]" aria-label="Miesiące">
            <thead className="bg-stone-50 dark:bg-white/[0.03]">
              <tr>
                <th className={th}>Miesiąc</th>
                <th className={th}>Plan</th>
                <th className={th}>Wydano</th>
                <th className={th}>Różnica</th>
                <th className={th}>Zakupy</th>
                <th className={th}>Zmiany planu</th>
              </tr>
            </thead>
            <tbody>
              {[...s.months].reverse().map((m) => (
                <tr key={m.month} className="border-t border-stone-100 dark:border-white/5">
                  <td className={`${td} font-medium`}>{mLabel(m.month)}{m.current ? ' (teraz)' : ''}</td>
                  <td className={td}>{zl(m.planned)}</td>
                  <td className={td}>{zl(m.spent)}</td>
                  <td className={`${td} ${m.diff > 0.01 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{m.diff > 0 ? '+' : ''}{zl(m.diff)}</td>
                  <td className={td}>{m.purchases}</td>
                  <td className={td}>{m.planChanges ? `${m.planChanges.changes} · ${zl(m.planChanges.from)} → ${zl(m.planChanges.to)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
