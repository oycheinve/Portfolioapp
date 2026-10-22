import { useEffect, useMemo, useState } from 'react';
import { Archive, CalendarCheck, CheckCircle2, Lock, Minus, Pencil, Plus, Repeat, Target, Trash2, Unlock, Zap } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { GOAL_CATEGORIES, GOAL_SOURCES, autoGoalValue, goalDirection, goalsSummary } from '../lib/goals.js';
import { seriesColor } from '../lib/colors.js';
import { formatNumber, formatPercent } from '../lib/format.js';
import { Badge, Button, Card, EmptyState, Field, IconButton, Input, Modal, Select } from '../components/ui.jsx';
import Ring from '../components/goals/Ring.jsx';
import YearReviewModal from '../components/goals/YearReviewModal.jsx';
import { reopenYear } from '../lib/goalsRollover.js';

function fmtValue(v, unit) {
  const digits = unit === 'zł' ? 0 : 2;
  return `${formatNumber(v, digits)}${unit ? ` ${unit}` : ''}`;
}

export default function GoalsView() {
  const { state, actions, isDark } = useApp();

  // Uzupełnienie wartości startowej w starszych celach (wyznacza kierunek „auto”): liczniki roczne startują od 0,
  // cele wartościowe i ręczne – od obecnej wartości (docelowa niższa = cel „w dół”)
  useEffect(() => {
    const counters = new Set(['DEPOSITS', 'DIVIDENDS', 'PASSIVE', 'IKE_LIMIT', 'IKZE_LIMIT']);
    for (const g of state.goals) {
      if (g.status === 'ARCHIVED' || g.startValue !== undefined) continue;
      const startValue = counters.has(g.source) ? 0 : g.source && g.source !== 'MANUAL' ? autoGoalValue(state, g) : Number(g.current) || 0;
      actions.upsert('goals', { ...g, startValue });
    }
  }, [state.goals]); // eslint-disable-line react-hooks/exhaustive-deps
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [form, setForm] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const summary = useMemo(() => goalsSummary(state, year), [state, year]);
  const [review, setReview] = useState(null);
  const yearGoals = state.goals.filter((g) => Number(g.year) === year);
  const openGoals = yearGoals.filter((g) => g.status !== 'ARCHIVED');
  const closed = yearGoals.length > 0 && openGoals.length === 0;
  const goalById = Object.fromEntries(state.goals.map((g) => [g.id, g]));
  const reopen = () => {
    for (const u of reopenYear(state, year)) actions.upsert('goals', u);
    actions.updateSettings({ goalsReview: { reviewedYears: (state.settings.goalsReview?.reviewedYears || []).filter((y) => y !== year) } });
    actions.notify(`Otworzono ponownie cele ${year}`, 'info');
  };
  const years = useMemo(() => {
    const set = new Set([currentYear, currentYear + 1, ...state.goals.map((g) => Number(g.year))]);
    return [...set].sort((a, b) => b - a);
  }, [state.goals, currentYear]);

  const bump = (goal, dir) => {
    const step = Number(goal.step) || 1;
    actions.upsert('goals', { ...goal, current: Math.max(0, Math.round(((Number(goal.current) || 0) + dir * step) * 100) / 100) });
  };
  const setCurrent = (goal, value) => actions.upsert('goals', { ...goal, current: value === '' ? 0 : Math.max(0, Number(value)) });

  const newGoal = (category = 'FINANCIAL') => setForm({ year, category, name: '', target: '', current: 0, unit: '', step: 1, source: 'MANUAL' });
  const save = () => {
    const src = GOAL_SOURCES[form.source];
    const target = Number(form.target) || 0;
    const current = Number(form.current) || 0;
    // Wartość na starcie celu (zapamiętywana przy utworzeniu albo zmianie wartości docelowej) – wyznacza kierunek „auto”
    const prev = form.id ? state.goals.find((g) => g.id === form.id) : null;
    const keepStart = prev && prev.startValue !== undefined && Number(prev.target) === target && prev.source === form.source;
    const startValue = keepStart ? prev.startValue : form.source && form.source !== 'MANUAL' ? autoGoalValue(state, { ...form, year: Number(form.year) }) : current;
    actions.upsert('goals', {
      ...form,
      name: form.name.trim(),
      year: Number(form.year),
      target,
      current,
      startValue,
      direction: form.direction || 'AUTO',
      step: Number(form.step) || 1,
      unit: form.unit || src?.unit || '',
    });
    actions.notify(form.id ? 'Zapisano cel' : 'Dodano cel', 'success');
    setForm(null);
  };

  const ringColor = summary.overall >= 1 ? '#0ca30c' : seriesColor(0, isDark);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Wskaźnik zbiorczy */}
      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6 dark:border-white/10 dark:bg-neutral-900">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <div className="relative shrink-0">
            <Ring value={summary.overall} color={ringColor} track={isDark ? '#2c2c2a' : '#ecebe6'} label={`Postęp celów ${Math.round(summary.overall * 100)}%`} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold tabular">{formatPercent(summary.overall, { digits: 0 })}</span>
              <span className="text-xs text-stone-500">celów {year}</span>
            </div>
          </div>
          <div className="w-full min-w-0 flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
                  <Target size={16} /> Cele roczne {year}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                  Osiągnięte: {summary.done} z {summary.total}
                  {closed && (
                    <Badge tone="neutral">
                      <Lock size={11} /> rok zamknięty
                    </Badge>
                  )}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-auto" aria-label="Rok celów">
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
                <Button variant="primary" icon={Plus} onClick={() => newGoal()}>
                  Nowy cel
                </Button>
                {openGoals.length > 0 && year <= currentYear && (
                  <Button icon={CalendarCheck} onClick={() => setReview(year)} title="Podsumowanie roku i kreator przenoszenia celów">
                    Zamknij rok {year}
                  </Button>
                )}
                {closed && (
                  <Button variant="ghost" icon={Unlock} onClick={reopen}>
                    Otwórz ponownie
                  </Button>
                )}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {summary.byCategory.map((c) => (
                <div key={c.id} className="rounded-xl bg-stone-50 p-3 dark:bg-white/[0.03]">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium">{c.label}</span>
                    <span className="tabular text-stone-500">
                      {c.done}/{c.rows.length} · {formatPercent(c.pct, { digits: 0 })}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-white/10">
                    <div className="h-full rounded-full transition-all" style={{ width: `${c.pct * 100}%`, background: seriesColor(c.slot, isDark) }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-stone-500">Wskaźnik zbiorczy = średni postęp wszystkich celów roku (każdy cel liczony maks. do 100%).</p>
          </div>
        </div>
      </section>

      {summary.total === 0 ? (
        <Card>
          <EmptyState icon={Target} title={`Brak celów na ${year}`} description="Dodaj cele finansowe, rozwojowe i inne – postęp policzy się automatycznie." action={<Button variant="primary" icon={Plus} onClick={() => newGoal()}>Dodaj cel</Button>} />
        </Card>
      ) : (
        <div className="grid items-start gap-4 sm:gap-6 xl:grid-cols-3">
          {summary.byCategory.map((c) => (
            <Card
              key={c.id}
              title={c.label}
              subtitle={`${c.rows.length} ${c.rows.length === 1 ? 'cel' : 'celów'} · ${formatPercent(c.pct, { digits: 0 })}`}
              icon={Target}
              actions={<IconButton icon={Plus} label={`Dodaj cel: ${c.label}`} onClick={() => newGoal(c.id)} />}
              bodyClassName="p-0 sm:p-0"
            >
              {c.rows.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-stone-500">Brak celów w tej kategorii.</p>
              ) : (
                <ul className="divide-y divide-stone-100 dark:divide-white/5">
                  {c.rows.map(({ goal, current, target, start, pct, capped, done }) => {
                    const archived = goal.status === 'ARCHIVED';
                    const auto = goal.source && goal.source !== 'MANUAL' && !archived;
                    return (
                      <li key={goal.id} className="px-4 py-3 sm:px-5">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-medium">{goal.name}</span>
                              {done && <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" aria-label="Osiągnięty" />}
                              {archived && <Badge tone={done ? 'green' : 'amber'}>{done ? 'Sukces' : 'Niezrealizowane'}</Badge>}
                              {archived && goal.rolledTo && goalById[goal.rolledTo] && (
                                <Badge tone="blue">
                                  <Repeat size={10} /> przeniesiony na {goalById[goal.rolledTo].year}
                                </Badge>
                              )}
                              {archived && !goal.rolledTo && (
                                <Badge>
                                  <Archive size={10} /> archiwum
                                </Badge>
                              )}
                              {goal.rolledFrom && !archived && <Badge tone="blue">z {Number(goal.year) - 1}</Badge>}
                            </div>
                            <div className="text-xs text-stone-500 tabular dark:text-stone-400">
                              {goalDirection(goal) === 'DOWN' ? (
                                <>
                                  ↓ spadek do {fmtValue(target, goal.unit)} · teraz {fmtValue(current, goal.unit)}
                                  {goal.startValue !== undefined && ` · start ${fmtValue(Number(goal.startValue), goal.unit)}`}
                                </>
                              ) : (
                                <>
                                  {fmtValue(current, goal.unit)} z {fmtValue(target, goal.unit)}
                                  {start > 0 && ` · start ${fmtValue(start, goal.unit)} (0%)`}
                                </>
                              )}
                            </div>
                            {auto && (
                              <Badge tone="violet" className="mt-1">
                                <Zap size={10} /> auto: {GOAL_SOURCES[goal.source]?.label.toLowerCase()}
                              </Badge>
                            )}
                          </div>
                          <span className={`text-lg font-bold tabular ${done ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>{formatPercent(pct, { digits: 0 })}</span>
                        </div>
                        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-stone-100 dark:bg-white/5">
                          <div className="h-full rounded-full transition-all" style={{ width: `${capped * 100}%`, background: done ? '#0ca30c' : seriesColor(c.slot, isDark) }} />
                        </div>
                        <div className="mt-2 flex items-center gap-1">
                          {!auto && !archived && (
                            <>
                              <button type="button" aria-label="Zmniejsz" onClick={() => bump(goal, -1)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 hover:bg-stone-100 dark:border-white/10 dark:hover:bg-white/5">
                                <Minus size={14} />
                              </button>
                              <input
                                type="number"
                                min="0"
                                step={goal.step || 1}
                                value={goal.current ?? 0}
                                onChange={(e) => setCurrent(goal, e.target.value)}
                                aria-label={`Aktualna wartość: ${goal.name}`}
                                className="h-8 w-20 rounded-lg border border-stone-200 bg-white px-2 text-center text-sm tabular outline-none focus:border-blue-500 dark:border-white/10 dark:bg-neutral-800"
                              />
                              <button type="button" aria-label="Zwiększ" onClick={() => bump(goal, 1)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 hover:bg-stone-100 dark:border-white/10 dark:hover:bg-white/5">
                                <Plus size={14} />
                              </button>
                            </>
                          )}
                          <span className="ml-auto" />
                          {!archived && <IconButton icon={Pencil} label="Edytuj cel" onClick={() => setForm({ ...goal })} className="h-8 w-8" />}
                          <IconButton icon={Trash2} label="Usuń cel" onClick={() => setToDelete(goal)} className="h-8 w-8 hover:text-red-600" />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? 'Edytuj cel' : 'Nowy cel roczny'}
        footer={
          <>
            <Button onClick={() => setForm(null)}>Anuluj</Button>
            <Button variant="primary" onClick={save} disabled={!form?.name?.trim() || !(Number(form?.target) > 0)}>
              Zapisz
            </Button>
          </>
        }
      >
        {form && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nazwa celu" className="col-span-2">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="np. Przeczytać 5 książek" autoFocus />
            </Field>
            <Field label="Kategoria">
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {Object.values(GOAL_CATEGORIES).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Rok">
              <Input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
            </Field>
            <Field label="Postęp liczony" className="col-span-2" hint={form.source !== 'MANUAL' ? 'Wartość aktualna pobierana automatycznie z danych portfela' : 'Aktualizujesz przyciskami + / − lub wpisując wartość'}>
              <Select
                value={form.source}
                onChange={(e) => {
                  const src = GOAL_SOURCES[e.target.value];
                  setForm({ ...form, source: e.target.value, unit: src?.unit || form.unit, step: src?.unit === 'zł' ? 100 : form.step });
                }}
              >
                {Object.values(GOAL_SOURCES).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Wartość docelowa (Y)" hint="Postęp rośnie od stanu w chwili ustawienia celu (ten stan = 0%)">
              <Input type="number" min="0" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
            </Field>
            <Field label="Kierunek celu" hint="Auto: gdy wartość docelowa jest niższa niż obecna, cel polega na zmniejszeniu wartości">
              <Select value={form.direction || 'AUTO'} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                <option value="AUTO">Automatycznie</option>
                <option value="UP">Wzrost do wartości docelowej</option>
                <option value="DOWN">Spadek do wartości docelowej</option>
              </Select>
            </Field>
            <Field label="Jednostka">
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="np. książek, zł, km" />
            </Field>
            {form.source === 'MANUAL' && (
              <>
                <Field label="Wartość aktualna (X)">
                  <Input type="number" min="0" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
                </Field>
                <Field label="Krok przycisków + / −">
                  <Input type="number" min="0.01" step="any" value={form.step} onChange={(e) => setForm({ ...form, step: e.target.value })} />
                </Field>
              </>
            )}
          </div>
        )}
      </Modal>

      {review && (
        <YearReviewModal
          year={review}
          onClose={(toYear) => {
            setReview(null);
            if (toYear) setYear(toYear);
          }}
        />
      )}

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Usunąć cel?"
        footer={
          <>
            <Button onClick={() => setToDelete(null)}>Anuluj</Button>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={() => {
                actions.remove('goals', toDelete.id);
                setToDelete(null);
              }}
            >
              Usuń
            </Button>
          </>
        }
      >
        <p className="text-sm text-stone-600 dark:text-stone-300">„{toDelete?.name}” zostanie usunięty.</p>
      </Modal>
    </div>
  );
}
