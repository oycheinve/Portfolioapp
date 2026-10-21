import { useMemo } from 'react';
import { CalendarClock, RotateCcw } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { DEFAULT_CONTRIBUTION_LIMITS } from '../../lib/constants.js';
import { LIMIT_MULTIPLIERS, computeLimitsForYear } from '../../lib/tax.js';
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

export default function LimitsCard() {
  const { state, actions } = useApp();
  const s = state.settings;
  const policy = s.limitsPolicy || { autoUpdate: true, growthPct: 6, projectedWages: {} };
  const currentYear = new Date().getFullYear();

  const years = useMemo(() => {
    const set = new Set([...Object.keys(DEFAULT_CONTRIBUTION_LIMITS), ...Object.keys(s.contributionLimits || {})].map(Number));
    for (let y = currentYear; y <= currentYear + 2; y += 1) set.add(y);
    return [...set].filter((y) => y >= currentYear - 2).sort((a, b) => b - a);
  }, [s.contributionLimits, currentYear]);

  const usage = useMemo(() => computeLimitUsage(state, currentYear), [state, currentYear]);
  const setPolicy = (patch) => actions.updateSettings({ limitsPolicy: { ...policy, ...patch } });

  const setValue = (year, key, value) => {
    const base = computeLimitsForYear(s, year);
    const { source, ...limits } = base;
    actions.updateSettings({
      contributionLimits: { ...s.contributionLimits, [year]: { ...limits, [key]: Number(value) || 0 } },
      contributionLimitsMeta: { ...(s.contributionLimitsMeta || {}), [year]: 'manual' },
    });
  };
  const confirmYear = (year) => {
    const { source, ...limits } = computeLimitsForYear(s, year);
    actions.updateSettings({
      contributionLimits: { ...s.contributionLimits, [year]: limits },
      contributionLimitsMeta: { ...(s.contributionLimitsMeta || {}), [year]: source },
    });
    actions.notify(`Zapisano limity na ${year} r.`, 'success');
  };
  const resetYear = (year) => {
    const next = { ...s.contributionLimits };
    const meta = { ...(s.contributionLimitsMeta || {}) };
    if (DEFAULT_CONTRIBUTION_LIMITS[year]) next[year] = { ...DEFAULT_CONTRIBUTION_LIMITS[year] };
    else delete next[year];
    delete meta[year];
    actions.updateSettings({ contributionLimits: next, contributionLimitsMeta: meta });
  };
  const setWage = (year, value) => {
    const wages = { ...(policy.projectedWages || {}) };
    if (value === '') delete wages[year];
    else wages[year] = Number(value);
    setPolicy({ projectedWages: wages });
  };

  return (
    <Card title="Limity wpłat IKE / IKZE" subtitle="Bieżący i kolejne lata · edycja ręczna lub automatyczna aktualizacja po Nowym Roku" icon={CalendarClock}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-3">
          {years.map((year) => {
            const l = computeLimitsForYear(s, year);
            const meta = SOURCE_META[l.source] || SOURCE_META.estimate;
            const stored = !!s.contributionLimits?.[year];
            const isCurrent = year === currentYear;
            return (
              <div
                key={year}
                className={`rounded-xl border p-3 ${isCurrent ? 'border-blue-300 bg-blue-50/40 dark:border-blue-500/30 dark:bg-blue-500/5' : 'border-stone-200 dark:border-white/10'}`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{year}</span>
                  {isCurrent && <Badge tone="blue">bieżący</Badge>}
                  {year > currentYear && <Badge>przyszły</Badge>}
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  <div className="ml-auto flex gap-1">
                    {!stored && (
                      <Button size="sm" onClick={() => confirmYear(year)}>
                        Zatwierdź
                      </Button>
                    )}
                    {stored && l.source !== 'official' && (
                      <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => resetYear(year)}>
                        {DEFAULT_CONTRIBUTION_LIMITS[year] ? 'Przywróć oficjalny' : 'Wróć do wyliczenia'}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                  {FIELDS.map((f) => (
                    <Field key={f.key} label={f.label}>
                      <Input type="number" step="0.01" min="0" value={l[f.key] ?? ''} onChange={(e) => setValue(year, f.key, e.target.value)} />
                    </Field>
                  ))}
                  <Field label="Przeciętne wynagrodzenie (prognoza)" hint={`IKE = ${LIMIT_MULTIPLIERS.ike}×, IKZE = ${LIMIT_MULTIPLIERS.ikze}×, JDG = ${LIMIT_MULTIPLIERS.ikzeSelfEmployed}×`}>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      placeholder={(l.ike / LIMIT_MULTIPLIERS.ike).toFixed(0)}
                      value={policy.projectedWages?.[year] ?? ''}
                      onChange={(e) => setWage(year, e.target.value)}
                      disabled={stored && l.source !== 'wage' && l.source !== 'estimate'}
                    />
                  </Field>
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-4">
          <div className="space-y-3 rounded-xl bg-stone-50 p-3 dark:bg-white/[0.03]">
            <Toggle
              checked={!!policy.autoUpdate}
              onChange={(v) => setPolicy({ autoUpdate: v })}
              label="Automatyczna aktualizacja"
              description="Po Nowym Roku limit uzupełni się sam: z prognozy wynagrodzenia (jeśli podana) albo jako szacunek."
            />
            <Field label="Szacowany wzrost limitu r/r (%)" hint="Używany, gdy brak prognozy wynagrodzenia">
              <Input type="number" step="0.5" min="0" max="30" value={policy.growthPct ?? 6} onChange={(e) => setPolicy({ growthPct: Number(e.target.value) || 0 })} />
            </Field>
          </div>
          <div className="space-y-3">
            <div className="text-xs font-semibold text-stone-500 dark:text-stone-400">Wykorzystanie {currentYear}</div>
            {usage.filter((u) => u.limit > 0).map((u) => (
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
          <p className="text-[11px] text-stone-500 dark:text-stone-500">
            Oficjalne limity ogłasza MRPiPS na podstawie prognozowanego przeciętnego wynagrodzenia z ustawy budżetowej. Szacunki oznaczone są na pomarańczowo – zaktualizuj je po ogłoszeniu.
          </p>
        </div>
      </div>
    </Card>
  );
}
