import { useMemo, useState } from 'react';
import { ResponsiveContainer, Tooltip, Treemap } from 'recharts';
import { Grid3x3 } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { instrumentColorMap } from '../allocation/AllocationDonut.jsx';
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

// Pastelowe tło i kolor tekstu kafelka wg zmiany dziennej (skala −2% … +2%): zielenie – wzrost, róże/czerwienie – spadek
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mixHex = (a, b, t) => `rgb(${hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t)).join(',')})`;
export function heatStyle(change, isDark, maxAbs = 0.02) {
  const P = isDark
    ? { zero: '#2a2a28', upLo: '#1f2e24', upHi: '#1f6b3a', downLo: '#33201f', downHi: '#8a2a2a', upText: '#86efac', downText: '#fca5a5', zeroText: '#d6d3d1' }
    : { zero: '#efeee9', upLo: '#e5f4e8', upHi: '#a6dcb4', downLo: '#f9e4e4', downHi: '#eeaaaa', upText: '#1f7a3d', downText: '#c23030', zeroText: '#57534e' };
  if (!Number.isFinite(change) || Math.abs(change) < 0.0005) return { fill: P.zero, text: P.zeroText };
  const t = Math.pow(Math.min(1, Math.abs(change) / maxAbs), 0.8);
  return change > 0 ? { fill: mixHex(P.upLo, P.upHi, t), text: P.upText } : { fill: mixHex(P.downLo, P.downHi, t), text: P.downText };
}

function HeatTile(props) {
  const { x, y, width, height, depth, name, change, isDark, color } = props;
  if (depth !== 1 || width <= 0 || height <= 0) return null;
  const gap = 3;
  const w = Math.max(0, width - gap * 2);
  const h = Math.max(0, height - gap * 2);
  const { fill, text } = heatStyle(change, isDark);
  const r = Math.min(16, w / 4, h / 4);
  const fontSize = Math.max(11, Math.min(15, Math.sqrt(w * h) / 9));
  const showName = w > 56 && h > 30;
  const showChange = w > 56 && h > 48;
  const showDot = w > 18 && h > 18;
  const px = x + gap + 10;
  const py = y + gap + 8 + fontSize;
  return (
    <g>
      <rect x={x + gap} y={y + gap} width={w} height={h} rx={r} ry={r} fill={fill} />
      {showDot && <circle cx={showName ? px + 4 : x + gap + Math.min(14, w / 2)} cy={showName ? py - fontSize * 0.35 : y + gap + Math.min(14, h / 2)} r={4.5} fill={color || text} />}
      {showName && (
        <text x={px + 13} y={py} fill={isDark ? '#f5f5f4' : '#1c1917'} fontSize={fontSize} fontWeight={700}>
          {name}
        </text>
      )}
      {showChange && (
        <text x={px} y={py + fontSize * 1.45} fill={text} fontSize={fontSize} fontWeight={700}>
          {Number.isFinite(change) ? `${change > 0 ? '+' : ''}${(change * 100).toFixed(2).replace('.', ',')}%` : '—'}
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
  const instColors = useMemo(() => instrumentColorMap(state, isDark), [state, isDark]);

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
      prev.color = instColors[p.instrumentId];
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
  }, [valuation.positions, quotes, group, instColors]);

  const legendStops = [-0.02, -0.01, 0, 0.01, 0.02];

  return (
    <Card
      title="Mapa cieplna dnia"
      subtitle={`Wielkość kafelka = wartość pozycji · kolor = zmiana dzienna (−2% … +2%) · ${formatPLN(total, { compact: true })}`}
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
                  <span className="h-3 w-8 rounded-full" style={{ background: heatStyle(s, isDark).fill }} />
                  <span className="tabular">{s > 0 ? '+' : ''}{(s * 100).toFixed(0)}%</span>
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
