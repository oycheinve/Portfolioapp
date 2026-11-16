import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Coins, Flag, PiggyBank, Percent, TrendingUp, Wallet } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { computePeriodStats } from '../../lib/engine.js';
import { createPriceResolver } from '../../lib/history.js';
import { dividendKpis } from '../../lib/dividends.js';
import { MILESTONE_TRACKS, readMilestones, recordReached, trackStatus } from '../../lib/milestones.js';
import { formatDate, formatNumber } from '../../lib/format.js';
import { Card } from '../ui.jsx';

const ICONS = { value: Wallet, contrib: PiggyBank, gain: TrendingUp, gainPct: Percent, dividends: Coins };
const short = (v, unit) => {
  if (unit === '%') return `${formatNumber(v, v % 1 ? 1 : 0)}%`;
  const s = v >= 1e6 ? `${formatNumber(v / 1e6, v % 1e6 ? 1 : 0)} mln` : v >= 1000 ? `${formatNumber(v / 1000, v % 1000 ? 1 : 0)}k` : formatNumber(v, 0);
  return `${s} zł${unit === 'zł/rok' ? '/rok' : ''}`;
};
const full = (v, unit) => (unit === '%' ? `${formatNumber(v, 1)}%` : `${formatNumber(v, 0)} zł${unit === 'zł/rok' ? ' / rok' : ''}`);

// Kamienie milowe – odhaczane automatycznie z danych portfela (portfel inwestycyjny, bez poduszki finansowej)
export default function MilestonesCard() {
  const { state, actions } = useApp();
  const resolver = useMemo(() => createPriceResolver(state), [state]);
  const values = useMemo(() => {
    const all = computePeriodStats(state, { period: 'ALL', filter: 'INVEST', priceAt: resolver.instrumentPLN, preferHistory: true });
    const whole = computePeriodStats(state, { period: 'ALL', filter: 'ALL', priceAt: resolver.instrumentPLN, preferHistory: true });
    return {
      value: Math.max(0, whole.endValue || 0),
      gain: Math.max(0, all.totalReturn || 0),
      gainPct: Math.max(0, (all.totalReturnPct || 0) * 100),
      dividends: dividendKpis(state).last12Net || 0,
    };
  }, [state, resolver]);
  const [saved, setSaved] = useState(readMilestones);
  // Nowe progi: zapis daty i krótkie gratulacje (pierwsze uruchomienie – zapis po cichu, bez zalewu komunikatów)
  useEffect(() => {
    // Powiadomienie tylko o progach powyżej najwyższego dotąd zapisanego w danej ścieżce – nowa ścieżka albo progi
    // dopisane do listy poniżej osiągniętego poziomu zapisują się po cichu
    const before = readMilestones();
    const top = (id) => Math.max(-Infinity, ...Object.keys(before[id] || {}).map(Number));
    const all = recordReached(values);
    if (!all.length) return;
    setSaved(readMilestones());
    const fresh = all.filter((f) => Object.keys(before[f.track.id] || {}).length && f.value > top(f.track.id));
    if (fresh.length) {
      const last = fresh.slice(-1)[0];
      actions.notify(`🎯 Kamień milowy osiągnięty: ${last.track.label} – ${full(last.value, last.track.unit)}${fresh.length > 1 ? ` (i ${fresh.length - 1} więcej)` : ''}`, 'success');
    }
  }, [values]); // eslint-disable-line react-hooks/exhaustive-deps
  const tracks = MILESTONE_TRACKS.map((t) => trackStatus(t, values[t.id], saved));
  const done = tracks.reduce((s, t) => s + t.doneCount, 0);
  // Gęste progi – pasek chipów przewinięty tak, by następny próg (z dwoma osiągniętymi przed nim) był widoczny
  const listRef = useRef(null);
  useEffect(() => {
    for (const el of listRef.current?.querySelectorAll('[data-next]') || []) {
      const row = el.parentElement;
      row.scrollLeft = Math.max(0, el.offsetLeft - row.offsetLeft - row.clientWidth / 3);
    }
  }, [values, saved]);

  return (
    <Card collapsible storageKey="fintrack-goals-open-milestones" defaultOpen title="Kamienie milowe" subtitle="Odhaczają się same – na podstawie portfela" icon={Flag} summary={`${done} osiągniętych`}>
      <ul ref={listRef} className="space-y-4" aria-label="Kamienie milowe">
        {tracks.map((s) => {
          const Icon = ICONS[s.track.id];
          return (
            <li key={s.track.id} aria-label={s.track.label}>
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600 dark:bg-white/5 dark:text-stone-300">
                  <Icon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold" title={s.track.hint}>
                      {s.track.label}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular">{full(s.value, s.track.unit)}</span>
                  </div>
                  <div className="text-[11px] text-stone-500 dark:text-stone-400">
                    {s.next ? `Następny: ${short(s.next.value, s.track.unit)} · brakuje ${full(s.next.value - s.value, s.track.unit)}` : 'Wszystkie progi osiągnięte'}
                  </div>
                </div>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(s.progress * 100)} aria-label={`Postęp do progu ${s.next ? short(s.next.value, s.track.unit) : ''}`}>
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${s.progress * 100}%` }} />
              </div>
              <div className="mt-1.5 flex gap-1 overflow-x-auto pb-0.5" aria-label={`Progi: ${s.track.label}`}>
                {s.items.map((x) => (
                  <span
                    key={x.value}
                    data-next={x === s.next ? '' : undefined}
                    title={x.done ? `Osiągnięto${x.at ? ` ${formatDate(x.at)}` : ''}` : 'Jeszcze nie osiągnięto'}
                    className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium tabular ${
                      x.done ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' : x === s.next ? 'border border-emerald-400 text-emerald-700 dark:border-emerald-500/50 dark:text-emerald-300' : 'bg-stone-100 text-stone-500 dark:bg-white/5 dark:text-stone-400'
                    }`}
                  >
                    {x.done && <Check size={11} strokeWidth={3} />}
                    {short(x.value, s.track.unit)}
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
