import { useMemo, useState } from 'react';
import { ResponsiveContainer, Tooltip, Treemap } from 'recharts';
import { Grid3x3 } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { divergingColor, readableTextOn } from '../../lib/colors.js';
import { formatMoney, formatPLN, formatPercent } from '../../lib/format.js';
import { Card, EmptyState, Segmented } from '../ui.jsx';

const GROUPS = [
  { value: 'INSTRUMENT', label: 'Instrument' },
  { value: 'ACCOUNT', label: 'Per konto' },
];

function dailyChange(quote) {
  if (!quote || !Number.isFinite(quote.price) || !Number.isFinite(quote.prevClose) || quote.prevClose === 0) return null;
  return quote.price / quote.prevClose - 1;
}

function HeatTile(props) {
  const { x, y, width, height, depth, name, change, isDark } = props;
  if (depth !== 1 || width <= 0 || height <= 0) return null;
  const fill = divergingColor(change, isDark);
  const text = readableTextOn(fill);
  const showName = width > 44 && height > 26;
  const showChange = width > 44 && height > 42;
  const fontSize = Math.max(10, Math.min(16, Math.sqrt(width * height) / 7));
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={4}
        ry={4}
        fill={fill}
        stroke={isDark ? '#171717' : '#ffffff'}
        strokeWidth={2}
      />
      {showName && (
        <text x={x + width / 2} y={y + height / 2 - (showChange ? fontSize * 0.45 : -fontSize * 0.35)} textAnchor="middle" fill={text} fontSize={fontSize} fontWeight={600}>
          {name}
        </text>
      )}
      {showChange && (
        <text x={x + width / 2} y={y + height / 2 + fontSize * 0.85} textAnchor="middle" fill={text} fontSize={Math.max(10, fontSize * 0.75)} opacity={0.9}>
          {Number.isFinite(change) ? `${change > 0 ? '+' : ''}${(change * 100).toFixed(2)}%` : '—'}
        </text>
      )}
    </g>
  );
}

function HeatTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  if (!d || d.value === undefined) return null;
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-white/10 dark:bg-neutral-900">
      <div className="font-semibold">
        {d.name} <span className="font-normal text-stone-500">· {d.fullName}</span>
      </div>
      {d.accountName && <div className="text-stone-500">{d.accountName}</div>}
      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 tabular">
        <span className="text-stone-500">Wartość</span>
        <span className="text-right font-medium">{formatPLN(d.value)}</span>
        <span className="text-stone-500">Zmiana dzienna</span>
        <span className={`text-right font-medium ${d.change > 0 ? 'text-emerald-600' : d.change < 0 ? 'text-red-600' : ''}`}>
          {formatPercent(d.change, { sign: true })}
        </span>
        <span className="text-stone-500">Zmiana PLN</span>
        <span className="text-right">{formatPLN(d.changePLN, { sign: true })}</span>
        <span className="text-stone-500">Kurs</span>
        <span className="text-right">{formatMoney(d.price, d.currency)}</span>
        <span className="text-stone-500">Udział</span>
        <span className="text-right">{formatPercent(d.share, { digits: 1 })}</span>
      </div>
    </div>
  );
}

export default function HeatmapCard({ valuation }) {
  const { state, isDark } = useApp();
  const [group, setGroup] = useState('INSTRUMENT');
  const quotes = state.prices.quotes;

  const { data, dayChangePLN, dayChangePct, total } = useMemo(() => {
    const map = new Map();
    for (const p of valuation.positions) {
      if (!p.instrument) continue;
      const key = group === 'ACCOUNT' ? `${p.instrumentId}|${p.accountId}` : p.instrumentId;
      const q = quotes[p.instrumentId];
      const change = dailyChange(q);
      const prev = map.get(key) || {
        key,
        name: p.instrument.ticker,
        fullName: p.instrument.name,
        accountName: group === 'ACCOUNT' ? p.account?.name : null,
        value: 0,
        change,
        price: q?.price,
        currency: q?.currency || p.instrument.currency,
      };
      prev.value += p.value;
      map.set(key, prev);
    }
    const items = [...map.values()].filter((d) => d.value > 0);
    const sum = items.reduce((s, d) => s + d.value, 0);
    let changePLN = 0;
    for (const d of items) {
      d.changePLN = Number.isFinite(d.change) ? d.value - d.value / (1 + d.change) : 0;
      d.share = sum > 0 ? d.value / sum : 0;
      changePLN += d.changePLN;
    }
    items.sort((a, b) => b.value - a.value);
    return { data: items, dayChangePLN: changePLN, dayChangePct: sum - changePLN > 0 ? changePLN / (sum - changePLN) : 0, total: sum };
  }, [valuation.positions, quotes, group]);

  const legendStops = [-0.03, -0.015, 0, 0.015, 0.03];

  return (
    <Card
      title="Mapa Cieplna Dnia"
      subtitle={`Akcje i ETF · rozmiar = wartość, kolor = zmiana dzienna · ${formatPLN(total, { compact: true })}`}
      icon={Grid3x3}
      actions={<Segmented options={GROUPS} value={group} onChange={setGroup} size="sm" ariaLabel="Grupowanie mapy" />}
    >
      {data.length === 0 ? (
        <EmptyState icon={Grid3x3} title="Brak pozycji akcji i ETF" description="Dodaj transakcje kupna, aby zobaczyć mapę cieplną." />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-xs text-stone-500 dark:text-stone-400">Zmiana dzienna portfela akcji/ETF</div>
              <div className={`text-lg font-semibold tabular ${dayChangePLN > 0 ? 'text-emerald-700 dark:text-emerald-400' : dayChangePLN < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                {formatPLN(dayChangePLN, { sign: true })} <span className="text-sm">({formatPercent(dayChangePct, { sign: true })})</span>
              </div>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-stone-500 dark:text-stone-400" aria-label="Legenda skali kolorów">
              {legendStops.map((s) => (
                <div key={s} className="flex flex-col items-center gap-0.5">
                  <span className="h-3 w-8 rounded-sm" style={{ background: divergingColor(s, isDark) }} />
                  <span className="tabular">{s > 0 ? '+' : ''}{(s * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
          <div className="h-72 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <Treemap data={data} dataKey="value" nameKey="name" aspectRatio={4 / 3} isAnimationActive={false} content={<HeatTile isDark={isDark} />}>
                <Tooltip content={<HeatTooltip />} />
              </Treemap>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}
