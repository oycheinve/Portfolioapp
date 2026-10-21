import { useMemo } from 'react';
import { CalendarClock, RotateCcw } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { DEFAULT_CONTRIBUTION_LIMITS } from '../../lib/constants.js';
import { computeLimitsForYear } from '../../lib/tax.js';
import { computeLimitUsage } from '../../lib/engine.js';
import { formatPLN, formatPercent } from '../../lib/format.js';
import { Badge, Button, Card, Field, Input, ProgressBar, Toggle } from '../ui.jsx';

const SOURCE_META = {
  official: { label: 'oficjalny', tone: 'green' },
  manual: { label: 'ręcznie', tone: 'blue' },
  wage: { label: 'z wynagrodzenia', tone: 'violet' },
  estimate: { label: 'szacunek', tone: 'amber' },
};

const FIELDS = [
  { key: 'ike', label: 'IKE' },
  { key: 'ikze', label: 'IKZE' },
  { key: 'ikzeSelfEmployed', label: 'IKZE (JDG)' },
];

// Limity wpłat wyłącznie dla bieżącego roku: edycja ręczna albo automatyczna aktualizacja po Nowym Roku
export default function LimitsCard() {
  const { state, actions } = useApp();
  const s = state.settings;
  const policy = s.limitsPolicy || { autoUpdate: true, growthPct: 6, projectedWages: {} };
  const year = new Date().getFullYear();
  const l = computeLimitsForYear(s, year);
  const meta = SOURCE_META[l.source] || SOURCE_META.estimate;
  const stored = !!s.contributionLimits?.[year];

  const usage = useMemo(() => computeLimitUsage(state, year), [state, year]);
  const setPolicy = (patch) => actions.updateSettings({ limitsPolicy: { ...policy, ...patch } });

  const setValue = (key, value) => {
    const { source, ...limits } = computeLimitsForYear(s, year);
    actions.updateSettings({
      contributionLimits: { ...s.contributionLimits, [year]: { ...limits, [key]: Number(value) || 0 } },
      contributionLimitsMeta: { ...(s.contributionLimitsMeta || {}), [year]: 'manual' },
    });
  };
  const confirmYear = () => {
    const { source, ...limits } = computeLimitsForYear(s, year);
    actions.updateSettings({
      contributionLimits: { ...s.contributionLimits, [year]: limits },
      contributionLimitsMeta: { ...(s.contributionLimitsMeta || {}), [year]: source },
    });
    actions.notify(`Zapisano limity na ${year} r.`, 'success');
  };
  const resetYear = () => {
    const next = { ...s.contributionLimits };
    const metaNext = { ...(s.contributionLimitsMeta || {}) };
    if (DEFAULT_CONTRIBUTION_LIMITS[year]) next[year] = { ...DEFAULT_CONTRIBUTION_LIMITS[year] };
    else delete next[year];
    delete metaNext[year];
    actions.updateSettings({ contributionLimits: next, contributionLimitsMeta: metaNext });
  };

  return (
    <Card title="Limity wpłat IKE / IKZE" subtitle={`Rok ${year} · edycja ręczna lub automatyczna aktualizacja po Nowym Roku`} icon={CalendarClock}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-3">
          <div className="rounded-xl border border-blue-300 bg-blue-50/40 p-3 dark:border-blue-500/30 dark:bg-blue-500/5">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-semibold">{year}</span>
              <Badge tone="blue">bieżący</Badge>
              <Badge tone={meta.tone}>{meta.label}</Badge>
              <div className="ml-auto flex gap-1">
                {!stored && (
                  <Button size="sm" onClick={confirmYear}>
                    Zatwierdź
                  </Button>
                )}
                {stored && l.source !== 'official' && (
                  <Button size="sm" variant="ghost" icon={RotateCcw} onClick={resetYear}>
                    {DEFAULT_CONTRIBUTION_LIMITS[year] ? 'Przywróć oficjalny' : 'Wróć do wyliczenia'}
                  </Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {FIELDS.map((f) => (
                <Field key={f.key} label={f.label}>
                  <Input type="number" step="0.01" min="0" value={l[f.key] ?? ''} onChange={(e) => setValue(f.key, e.target.value)} />
                </Field>
              ))}
            </div>
          </div>

          <div className="space-y-3 rounded-xl bg-stone-50 p-3 dark:bg-white/[0.03]">
            <Toggle
              checked={!!policy.autoUpdate}
              onChange={(v) => setPolicy({ autoUpdate: v })}
              label="Automatyczna aktualizacja po Nowym Roku"
              description="W nowym roku limit uzupełni się sam (oficjalny, jeśli jest w aplikacji, w przeciwnym razie szacunek). Zawsze możesz go poprawić ręcznie powyżej."
            />
            {policy.autoUpdate && (
              <Field label="Szacowany wzrost limitu r/r (%)" hint="Używany do szacunku, dopóki nie wpiszesz oficjalnej kwoty">
                <Input type="number" step="0.5" min="0" max="30" value={policy.growthPct ?? 6} onChange={(e) => setPolicy({ growthPct: Number(e.target.value) || 0 })} />
              </Field>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-xs font-semibold text-stone-500 dark:text-stone-400">Wykorzystanie {year}</div>
          {usage.filter((u) => u.limit > 0).length === 0 && <p className="text-xs text-stone-500">Brak kont IKE/IKZE.</p>}
          {usage
            .filter((u) => u.limit > 0)
            .map((u) => (
              <div key={u.account.id}>
                <div className="flex justify-between text-xs">
                  <span className="truncate">{u.account.name}</span>
                  <span className="tabular">{formatPercent(u.usage, { digits: 0 })}</span>
                </div>
                <div className="mt-1">
                  <ProgressBar value={u.usage} label={`Wykorzystanie limitu ${u.account.name}`} />
                </div>
                <div className="mt-0.5 text-[11px] text-stone-500 tabular">
                  {formatPLN(u.deposited)} z {formatPLN(u.limit)} · zostało {formatPLN(u.remaining)}
                </div>
              </div>
            ))}
        </div>
      </div>
    </Card>
  );
}
