import { useEffect, useMemo, useState } from 'react';
import { Archive, ArrowRight, CheckCircle2, CircleDashed, PartyPopper, Repeat, X, Zap } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { GOAL_CATEGORIES, GOAL_SOURCES } from '../../lib/goals.js';
import { applyRollover, buildRolloverPlan } from '../../lib/goalsRollover.js';
import { seriesColor } from '../../lib/colors.js';
import { formatNumber, formatPercent } from '../../lib/format.js';
import { Badge, Button } from '../ui.jsx';
import Ring from './Ring.jsx';

function fmtValue(v, unit) {
  return `${formatNumber(v, unit === 'zł' ? 0 : 2)}${unit ? ` ${unit}` : ''}`;
}

// Podsumowanie roku + kreator przenoszenia celów (krok 1: wyniki, krok 2: decyzje)
export default function YearReviewModal({ year, onClose, onLater }) {
  const { state, actions, isDark } = useApp();
  const plan = useMemo(() => buildRolloverPlan(state, year), [state, year]);
  const [step, setStep] = useState(1);
  const [decisions, setDecisions] = useState({});
  const s = plan.summary;
  const early = year >= new Date().getFullYear();

  useEffect(() => {
    setDecisions(Object.fromEntries(plan.items.map((i) => [i.goal.id, { action: i.action, target: i.newTarget }])));
  }, [plan]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && (onLater || onClose)();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onLater]);

  const setAll = (action) => setDecisions((d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, { ...v, action }])));
  const rolled = Object.values(decisions).filter((d) => d.action === 'ROLL').length;

  const confirm = () => {
    actions.goalsRollover(applyRollover(state, plan, decisions));
    actions.notify(`Zamknięto rok ${year}: przeniesiono ${rolled} ${rolled === 1 ? 'cel' : 'celów'} na ${plan.toYear}`, 'success');
    onClose(plan.toYear);
  };

  const ringColor = s.overall >= 1 ? '#0ca30c' : seriesColor(0, isDark);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4">
      <div role="dialog" aria-modal="true" aria-label={`Podsumowanie roku ${year}`} className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl border border-stone-200 bg-white shadow-2xl sm:max-w-2xl sm:rounded-3xl dark:border-white/10 dark:bg-neutral-900">
        {/* Nagłówek */}
        <div className="relative shrink-0 bg-gradient-to-br from-blue-600 via-violet-600 to-fuchsia-600 px-5 pt-5 pb-4 text-white sm:px-6">
          <button type="button" onClick={onLater || onClose} aria-label="Zamknij" className="absolute top-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/15">
            <X size={18} />
          </button>
          <div className="flex items-center gap-2 text-sm opacity-90">
            <PartyPopper size={16} /> {step === 1 ? (early ? 'Zamknięcie roku' : 'Szczęśliwego Nowego Roku!') : 'Kreator przenoszenia celów'}
          </div>
          <h2 className="mt-1 text-2xl font-bold">{step === 1 ? `Podsumowanie ${year}` : `Cele ${year} → ${plan.toYear}`}</h2>
          <div className="mt-3 flex gap-1.5" aria-hidden="true">
            <span className="h-1 flex-1 rounded-full bg-white" />
            <span className={`h-1 flex-1 rounded-full ${step === 2 ? 'bg-white' : 'bg-white/35'}`} />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {step === 1 ? (
            <div className="space-y-5">
              <div className="flex flex-col items-center gap-5 sm:flex-row">
                <div className="relative shrink-0">
                  <Ring value={s.overall} size={148} stroke={14} color={ringColor} track={isDark ? '#2c2c2a' : '#ecebe6'} label={`Zrealizowano ${Math.round(s.overall * 100)}% celów`} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold tabular">{formatPercent(s.overall, { digits: 0 })}</span>
                    <span className="text-[11px] text-stone-500">celów całkowitych</span>
                  </div>
                </div>
                <div className="w-full space-y-3">
                  <p className="text-base">
                    Zrealizowano <strong>{formatPercent(s.overall, { digits: 0 })}</strong> celów całkowitych · osiągnięte w pełni{' '}
                    <strong>
                      {s.done} z {s.total}
                    </strong>
                    .
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {s.byCategory.map((c) => (
                      <div key={c.id} className="rounded-xl bg-stone-50 p-2.5 dark:bg-white/[0.04]">
                        <div className="text-[11px] text-stone-500">{c.label}</div>
                        <div className="text-sm font-semibold tabular">{c.rows.length ? formatPercent(c.pct, { digits: 0 }) : '—'}</div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-white/10">
                          <div className="h-full rounded-full" style={{ width: `${c.pct * 100}%`, background: seriesColor(c.slot, isDark) }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {early && <p className="text-xs text-amber-700 dark:text-amber-400">Rok {year} jeszcze trwa – po zamknięciu wyniki zostaną zamrożone na dziś.</p>}
                </div>
              </div>

              <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 dark:divide-white/5 dark:border-white/10">
                {s.rows.map((r) => (
                  <li key={r.goal.id} className="flex items-center gap-3 px-3 py-2.5">
                    {r.done ? <CheckCircle2 size={18} className="shrink-0 text-emerald-600 dark:text-emerald-400" /> : <CircleDashed size={18} className="shrink-0 text-amber-600 dark:text-amber-400" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{r.goal.name}</div>
                      <div className="text-xs text-stone-500 tabular">
                        {GOAL_CATEGORIES[r.goal.category]?.label} · {fmtValue(r.current, r.goal.unit)} z {fmtValue(r.target, r.goal.unit)}
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge tone={r.done ? 'green' : 'amber'}>{r.done ? 'Sukces' : 'Niezrealizowane'}</Badge>
                      <div className="mt-0.5 text-xs font-semibold tabular">{formatPercent(r.pct, { digits: 0 })}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="mr-auto text-sm text-stone-600 dark:text-stone-300">
                  Wybierz dla każdego celu. Przeniesione cele startują od zera w {plan.toYear}; wszystkie cele {year} zostaną zarchiwizowane z wynikiem.
                </p>
                <Button size="sm" icon={Repeat} onClick={() => setAll('ROLL')}>
                  Przerzuć wszystkie
                </Button>
                <Button size="sm" variant="ghost" icon={Archive} onClick={() => setAll('ARCHIVE')}>
                  Archiwizuj wszystkie
                </Button>
              </div>
              <ul className="space-y-2">
                {plan.items.map((item) => {
                  const d = decisions[item.goal.id] || { action: item.action, target: item.newTarget };
                  const roll = d.action === 'ROLL';
                  return (
                    <li key={item.goal.id} className={`rounded-xl border p-3 ${roll ? 'border-blue-300 bg-blue-50/40 dark:border-blue-500/30 dark:bg-blue-500/5' : 'border-stone-200 dark:border-white/10'}`}>
                      <div className="flex flex-wrap items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-medium">{item.goal.name}</span>
                            <Badge tone={item.success ? 'green' : 'amber'}>{item.success ? 'Sukces' : formatPercent(item.pct, { digits: 0 })}</Badge>
                          </div>
                          {item.auto && (
                            <div className="mt-1 flex items-center gap-1 text-[11px] text-violet-700 dark:text-violet-300">
                              <Zap size={11} /> Cel automatyczny ({GOAL_SOURCES[item.goal.source]?.label.toLowerCase()}) – wygeneruje się na {plan.toYear}
                            </div>
                          )}
                          {item.alreadyRolled && <div className="mt-1 text-[11px] text-stone-500">Już przeniesiony wcześniej na {plan.toYear}.</div>}
                        </div>
                        <div className="inline-flex rounded-lg border border-stone-200 bg-stone-100 p-0.5 dark:border-white/10 dark:bg-neutral-800" role="radiogroup" aria-label={`Decyzja: ${item.goal.name}`}>
                          {[
                            { value: 'ROLL', label: `Przerzuć na ${plan.toYear}`, icon: Repeat },
                            { value: 'ARCHIVE', label: 'Archiwizuj', icon: Archive },
                          ].map((o) => {
                            const Icon = o.icon;
                            const active = d.action === o.value;
                            return (
                              <button
                                key={o.value}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                disabled={item.alreadyRolled && o.value === 'ROLL'}
                                onClick={() => setDecisions((all) => ({ ...all, [item.goal.id]: { ...d, action: o.value } }))}
                                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium disabled:opacity-40 ${
                                  active ? 'bg-white text-stone-900 shadow-sm dark:bg-neutral-950 dark:text-white' : 'text-stone-500 dark:text-stone-400'
                                }`}
                              >
                                <Icon size={13} /> {o.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {roll && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-600 dark:text-stone-300">
                          <span>Cel na {plan.toYear}:</span>
                          <input
                            type="number"
                            min="0"
                            value={d.target}
                            onChange={(e) => setDecisions((all) => ({ ...all, [item.goal.id]: { ...d, target: e.target.value } }))}
                            aria-label={`Nowa wartość docelowa: ${item.goal.name}`}
                            className="h-8 w-28 rounded-md border border-stone-200 bg-white px-2 text-right text-sm tabular outline-none focus:border-blue-500 dark:border-white/10 dark:bg-neutral-800"
                          />
                          <span>{item.goal.unit}</span>
                          {item.newTargetSource && <Badge tone="violet">{item.newTargetSource} z Ustawień</Badge>}
                          <span className="text-stone-400">postęp od 0</span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-stone-100 px-5 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-6 dark:border-white/5">
          {step === 1 ? (
            <>
              {onLater && (
                <Button variant="ghost" onClick={onLater} className="mr-auto">
                  Przypomnij później
                </Button>
              )}
              <Button variant="primary" onClick={() => setStep(2)} disabled={plan.items.length === 0}>
                Dalej: przenieś cele <ArrowRight size={16} />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep(1)} className="mr-auto">
                Wstecz
              </Button>
              <Button variant="primary" onClick={confirm}>
                Zamknij rok {year} ({rolled} → {plan.toYear})
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
