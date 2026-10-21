import { Target } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { formatPLN } from '../../lib/format.js';
import { Card, Field, Input, Segmented, Toggle } from '../ui.jsx';

// Cele FIRE (przeniesione z widoku symulacji): rok, docelowy majątek i miesięczny dochód z dywidend
export default function FireGoalsCard() {
  const { state, actions } = useApp();
  const fire = state.settings.fire;
  const setFire = (patch) => actions.updateSettings({ fire: { ...fire, ...patch } });
  const minYear = new Date().getFullYear() + 1;
  return (
    <Card
      title="Cele FIRE"
      subtitle={`Kwoty w dzisiejszej sile nabywczej · obecnie ${formatPLN(fire.targetMonthlyIncome)} / mies. i ${formatPLN(fire.targetNetWorth, { compact: true })} do ${fire.targetYear}`}
      icon={Target}
    >
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
    </Card>
  );
}
