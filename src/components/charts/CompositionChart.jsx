import { useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { SlidersHorizontal } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { buildPortfolioRows } from '../../lib/portfolioTable.js';
import { seriesColor } from '../../lib/colors.js';
import { formatPLN, formatPercent } from '../../lib/format.js';
import { Card, ChartTooltip, Dropdown } from '../ui.jsx';
import { instrumentColorMap } from '../allocation/AllocationDonut.jsx';

const KEY = 'wealth-app-composition-hidden';
const GROUPS = [
  { id: 'STOCK', label: 'Spółki (akcje)' },
  { id: 'ETF', label: 'ETF-y' },
  { id: 'FREE_CASH', label: 'Wolne środki (IKE, IKZE, maklerskie)' },
  { id: 'BONDS', label: 'Obligacje' },
  { id: 'CASH', label: 'Konta oszczędnościowe' },
  { id: 'OTHER', label: 'Nieruchomości i inne' },
];
const GROUP_OF = { STOCK_PL: 'STOCK', STOCK_FOREIGN: 'STOCK', ETF_PL: 'ETF', ETF_FOREIGN: 'ETF', FREE_CASH: 'FREE_CASH', BONDS: 'BONDS', CASH: 'CASH', OTHER: 'OTHER' };

function readHidden() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// Skład portfela: udział procentowy walorów (spółki i ETF-y zsumowane ze wszystkich kont, obligacje per seria,
// konta gotówkowe per konto). Panel filtrów nad wykresem – odznaczone pozycje znikają, udziały liczone od nowa.
export default function CompositionChart() {
  const { state, isDark } = useApp();
  const [hidden, setHiddenState] = useState(readHidden);
  const setHidden = (next) => {
    setHiddenState(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // brak localStorage – filtr nie zostanie zapamiętany
    }
  };
  const instColors = useMemo(() => instrumentColorMap(state, isDark), [state, isDark]);

  const items = useMemo(() => {
    const map = new Map();
    for (const r of buildPortfolioRows(state)) {
      if (!(r.value > 0.005)) continue;
      const group = GROUP_OF[r.category] || 'OTHER';
      // Ten sam walor na kilku kontach – jedna pozycja
      const key = r.instrumentId ? `inst_${r.instrumentId}` : r.id;
      const prev = map.get(key);
      if (prev) prev.value += r.value;
      else map.set(key, { key, group, label: r.instrumentId ? `${r.name}${r.sub && r.sub !== r.name ? ` · ${r.sub}` : ''}` : r.name, short: r.name, value: r.value, instrumentId: r.instrumentId || null });
    }
    let slot = 0;
    return [...map.values()]
      .sort((a, b) => b.value - a.value)
      .map((it) => ({ ...it, color: it.instrumentId && instColors[it.instrumentId] ? instColors[it.instrumentId] : seriesColor((slot += 1) + 1, isDark) }));
  }, [state, instColors, isDark]);

  const hiddenSet = new Set(hidden);
  const visible = items.filter((it) => !hiddenSet.has(it.key));
  const total = visible.reduce((s, it) => s + it.value, 0);
  const groupsPresent = GROUPS.filter((g) => items.some((it) => it.group === g.id));

  const toggle = (key) => setHidden(hiddenSet.has(key) ? hidden.filter((k) => k !== key) : [...hidden, key]);
  const setGroup = (groupId, show) => {
    const keys = items.filter((it) => it.group === groupId).map((it) => it.key);
    setHidden(show ? hidden.filter((k) => !keys.includes(k)) : [...new Set([...hidden, ...keys])]);
  };
  const label = hidden.length === 0 ? 'Wszystkie aktywa' : `Wybrane: ${visible.length} z ${items.length}`;

  return (
    <Card title="Skład portfela" subtitle="Udział procentowy walorów i kont w wybranych aktywach" bodyClassName="p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Dropdown label={label} icon={SlidersHorizontal} badge={hidden.length ? visible.length : null} title="Które aktywa pokazać na wykresie" panelClassName="sm:w-[26rem]">
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setHidden([])} className="rounded-full border border-stone-200 px-3 py-1 text-xs font-medium hover:bg-stone-100 dark:border-white/10 dark:hover:bg-white/5">
                Zaznacz wszystko
              </button>
              <button type="button" onClick={() => setHidden(items.map((it) => it.key))} className="rounded-full border border-stone-200 px-3 py-1 text-xs font-medium hover:bg-stone-100 dark:border-white/10 dark:hover:bg-white/5">
                Odznacz wszystko
              </button>
            </div>
            {groupsPresent.map((g) => {
              const list = items.filter((it) => it.group === g.id);
              const shown = list.filter((it) => !hiddenSet.has(it.key)).length;
              return (
                <div key={g.id} className="border-t border-stone-100 pt-2 dark:border-white/5">
                  <label className="flex cursor-pointer items-center gap-2 py-1 font-semibold">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-blue-600"
                      checked={shown === list.length}
                      ref={(el) => el && (el.indeterminate = shown > 0 && shown < list.length)}
                      onChange={(e) => setGroup(g.id, e.target.checked)}
                    />
                    {g.label} <span className="text-xs font-normal text-stone-500">({shown}/{list.length})</span>
                  </label>
                  {list.map((it) => (
                    <label key={it.key} className="flex cursor-pointer items-center gap-2 rounded-md py-0.5 pl-6 hover:bg-stone-100 dark:hover:bg-white/5">
                      <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={!hiddenSet.has(it.key)} onChange={() => toggle(it.key)} />
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: it.color }} />
                      <span className="min-w-0 flex-1 truncate">{it.label}</span>
                      <span className="text-xs text-stone-500 tabular">{formatPLN(it.value, { compact: true })}</span>
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </Dropdown>
        <span className="text-sm text-stone-500 tabular dark:text-stone-400">
          Suma wybranych: <strong className="text-stone-800 dark:text-stone-100">{formatPLN(total)}</strong>
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-stone-500">Zaznacz w filtrze co najmniej jeden walor.</p>
      ) : (
        <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="relative mx-auto h-72 w-72 sm:h-80 sm:w-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={visible}
                  dataKey="value"
                  nameKey="short"
                  innerRadius="58%"
                  outerRadius="100%"
                  paddingAngle={visible.length > 1 ? 1.5 : 0}
                  stroke="none"
                  isAnimationActive={false}
                  label={false}
                >
                  {visible.map((it) => (
                    <Cell key={it.key} fill={it.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip formatter={(v) => `${formatPercent(total > 0 ? v / total : 0, { digits: 1 })} · ${formatPLN(v)}`} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xs text-stone-500 dark:text-stone-400">{visible.length === items.length ? 'Cały portfel' : 'Wybrane aktywa'}</span>
              <span className="text-xl font-bold tabular">{formatPLN(total, { compact: true })}</span>
              <span className="text-[11px] text-stone-500 dark:text-stone-400">{visible.length} poz.</span>
            </div>
          </div>
          <ul className="max-h-80 space-y-1 overflow-y-auto pr-1 text-sm">
            {visible.map((it) => {
              const share = total > 0 ? it.value / total : 0;
              return (
                <li key={it.key} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: it.color }} />
                  <span className="min-w-0 flex-1 truncate" title={it.label}>
                    {it.short}
                  </span>
                  <span className="hidden w-28 text-right text-xs text-stone-500 tabular sm:inline">{formatPLN(it.value)}</span>
                  <span className="w-16 text-right font-semibold tabular">{formatPercent(share, { digits: 1 })}</span>
                  <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-stone-100 sm:block dark:bg-white/5">
                    <span className="block h-full rounded-full" style={{ width: `${share * 100}%`, background: it.color }} />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
