import { forwardRef } from 'react';
import { fmtPct, fmtZl, reportHeader } from '../../lib/xReport.js';

// Karta graficzna raportu – czyste SVG (stały ciemny motyw), gotowe do eksportu PNG bez zewnętrznych bibliotek.
// Logotypy spółek osadzone jako data URI (eksport PNG bez blokady CORS); bez logo – monogram tickera w kolorze instrumentu.

const C = {
  bg1: '#0b0b0b',
  bg2: '#1a1a19',
  panel: '#202020',
  line: '#2c2c2a',
  text: '#f0efec',
  sub: '#c3c2b7',
  muted: '#898781',
  up: '#22c55e',
  down: '#ef6b6b',
  accent: '#3987e5',
};
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export const CARD_SIZES = {
  WIDE: { w: 1200, h: 675, label: '16:9 (X)' },
  SQUARE: { w: 1080, h: 1080, label: '1:1' },
};

function sparkPath(points, x, y, w, h) {
  if (!points || points.length < 2) return null;
  const vals = points.map((p) => p.twr);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 0);
  const span = max - min || 1;
  const sx = (i) => x + (i / (points.length - 1)) * w;
  const sy = (v) => y + h - ((v - min) / span) * h;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(p.twr).toFixed(1)}`).join(' ');
  const area = `${d} L${sx(points.length - 1).toFixed(1)},${(y + h).toFixed(1)} L${x},${(y + h).toFixed(1)} Z`;
  return { d, area, zeroY: sy(0) };
}

function Monogram({ x, y, r, ticker, color }) {
  const text = ticker.replace(/[^A-Z0-9]/gi, '').slice(0, ticker.length > 4 ? 2 : 3).toUpperCase();
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={color} />
      <text x={x} y={y + r * 0.36} textAnchor="middle" fontFamily={FONT} fontSize={r * (text.length > 2 ? 0.72 : 0.9)} fontWeight="700" fill="#ffffff">
        {text}
      </text>
    </g>
  );
}

// Logo w kółku obok nazwy spółki: 'slice' – grafika wypełnia koło, 'meet' – cała grafika na tle (bg)
function Logo({ x, y, r, logo, id }) {
  const href = typeof logo === 'string' ? logo : logo.href;
  const fit = typeof logo === 'string' ? 'meet' : logo.fit || 'meet';
  const k = fit === 'slice' ? 1 : 0.78;
  return (
    <g>
      <defs>
        <clipPath id={id}>
          <circle cx={x} cy={y} r={r} />
        </clipPath>
      </defs>
      <circle cx={x} cy={y} r={r} fill={(typeof logo === 'object' && logo.bg) || '#ffffff'} />
      <image href={href} x={x - r * k} y={y - r * k} width={r * 2 * k} height={r * 2 * k} clipPath={`url(#${id})`} preserveAspectRatio={`xMidYMid ${fit}`} />
    </g>
  );
}

function Stat({ x, y, label, value, sub, valueColor = C.text, size = 34 }) {
  return (
    <g>
      <text x={x} y={y} fontFamily={FONT} fontSize="18" fill={C.muted} letterSpacing="0.5">
        {label}
      </text>
      <text x={x} y={y + size + 8} fontFamily={FONT} fontSize={size} fontWeight="700" fill={valueColor}>
        {value}
      </text>
      {sub && (
        <text x={x} y={y + size + 36} fontFamily={FONT} fontSize="18" fill={C.sub}>
          {sub}
        </text>
      )}
    </g>
  );
}

const ReportCard = forwardRef(function ReportCard({ metrics, totals, series, colors, logos = {}, options, size = 'WIDE' }, ref) {
  const { w, h } = CARD_SIZES[size];
  const hide = options.hideAmounts;
  const pad = 56;
  const wide = size === 'WIDE';
  const movers = metrics.instruments;
  const n = Math.min(3, movers.length);
  const top = movers.slice(0, n);
  const bottom = movers.length > n ? movers.slice(-Math.min(2, movers.length - n)) : [];
  const list = [...top.map((m) => ({ ...m, kind: 'top' })), ...bottom.map((m) => ({ ...m, kind: 'bottom' }))];
  const periodUp = metrics.profit >= 0;

  // Układ: szeroki = dwie kolumny; kwadrat = jedna kolumna
  const leftW = wide ? 620 : w - pad * 2;
  const rightX = wide ? pad + leftW + 40 : pad;
  const rightW = wide ? w - rightX - pad : w - pad * 2;
  const statsY = wide ? 250 : 260;
  const sparkY = wide ? 168 : 520;
  const sparkH = wide ? 112 : 120;
  const listY = wide ? 330 : 690;
  const rowH = wide ? 50 : 56;
  const spark = sparkPath(series, rightX, sparkY, rightW, sparkH);
  const header = reportHeader(metrics.period).replace('📊 ', '');

  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`Karta raportu: ${header}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id="rc-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={C.bg2} />
          <stop offset="100%" stopColor={C.bg1} />
        </linearGradient>
        <linearGradient id="rc-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={periodUp ? C.up : C.down} stopOpacity="0.35" />
          <stop offset="100%" stopColor={periodUp ? C.up : C.down} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width={w} height={h} rx="28" fill="url(#rc-bg)" />
      <rect x="1" y="1" width={w - 2} height={h - 2} rx="27" fill="none" stroke={C.line} strokeWidth="2" />

      {/* Nagłówek */}
      <text x={pad} y={pad + 18} fontFamily={FONT} fontSize="18" fontWeight="600" fill={C.accent} letterSpacing="3">
        RAPORT PORTFELA
      </text>
      <text x={pad} y={pad + 62} fontFamily={FONT} fontSize="40" fontWeight="700" fill={C.text}>
        {header.replace('Raport portfela | ', '')}
      </text>
      <text x={w - pad} y={pad + 18} textAnchor="end" fontFamily={FONT} fontSize="18" fill={C.muted}>
        {metrics.period.rangeLabel}
      </text>
      {options.handle && (
        <text x={w - pad} y={pad + 46} textAnchor="end" fontFamily={FONT} fontSize="20" fontWeight="600" fill={C.sub}>
          {options.handle}
        </text>
      )}

      {/* Wynik okresu – duża liczba */}
      <text x={pad} y={pad + 108} fontFamily={FONT} fontSize="18" fill={C.muted}>
        Wynik okresu
      </text>
      <text x={pad} y={pad + 172} fontFamily={FONT} fontSize="64" fontWeight="800" fill={periodUp ? C.up : C.down}>
        {fmtPct(metrics.pct)}
      </text>
      {!hide && (
        <text x={pad + 270} y={pad + 170} fontFamily={FONT} fontSize="28" fontWeight="600" fill={periodUp ? C.up : C.down}>
          {fmtZl(metrics.profit, true)}
        </text>
      )}

      {/* Statystyki */}
      {hide ? (
        <g>
          <Stat x={pad} y={statsY + 60} label="ZYSK TOTAL" value={fmtPct(totals.profitPct)} valueColor={totals.profit >= 0 ? C.up : C.down} />
          <Stat x={pad + leftW / 2} y={statsY + 60} label="STOPA DYWIDENDY" value={fmtPct(totals.dividendYield, false)} />
        </g>
      ) : (
        <g>
          <Stat x={pad} y={statsY + 60} label="WARTOŚĆ PORTFELA" value={fmtZl(totals.value)} />
          <Stat x={pad + leftW / 2} y={statsY + 60} label="WPŁACONE" value={fmtZl(totals.contributions)} />
          <Stat
            x={pad}
            y={statsY + 175}
            label="ZYSK TOTAL"
            value={fmtZl(totals.profit, true)}
            sub={fmtPct(totals.profitPct)}
            valueColor={totals.profit >= 0 ? C.up : C.down}
          />
          <Stat x={pad + leftW / 2} y={statsY + 175} label="W TYM DYWIDENDY" value={fmtZl(totals.dividends)} sub={metrics.dividends > 0 ? `w okresie ${fmtZl(metrics.dividends)}` : null} />
        </g>
      )}

      {/* Wykres okresu (TWR) */}
      {spark && (
        <g>
          <line x1={rightX} x2={rightX + rightW} y1={spark.zeroY} y2={spark.zeroY} stroke={C.line} strokeWidth="2" strokeDasharray="4 6" />
          <path d={spark.area} fill="url(#rc-spark)" />
          <path d={spark.d} fill="none" stroke={periodUp ? C.up : C.down} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        </g>
      )}

      {/* Najlepsze / najsłabsze */}
      <text x={rightX} y={listY - 18} fontFamily={FONT} fontSize="18" fill={C.muted} letterSpacing="0.5">
        NAJWIĘKSZE RUCHY W OKRESIE
      </text>
      {list.map((m, i) => {
        const y = listY + i * rowH;
        const up = m.pct >= 0;
        const barX = rightX + 205;
        const barMax = rightW - 205 - 100;
        const maxAbs = Math.max(...list.map((x) => Math.abs(x.pct)), 0.0001);
        const bw = Math.max(4, (Math.abs(m.pct) / maxAbs) * barMax);
        return (
          <g key={`${m.instrument.id}-${m.kind}`}>
            <rect x={rightX} y={y} width={rightW} height={rowH - 10} rx="12" fill={C.panel} />
            {logos[m.instrument.id] ? (
              <Logo x={rightX + 26} y={y + (rowH - 10) / 2} r={16} logo={logos[m.instrument.id]} id={`rc-logo-${i}`} />
            ) : (
              <Monogram x={rightX + 26} y={y + (rowH - 10) / 2} r={16} ticker={m.instrument.ticker} color={colors[m.instrument.id] || C.accent} />
            )}
            <text x={rightX + 54} y={y + (rowH - 10) / 2 + 7} fontFamily={FONT} fontSize={m.instrument.ticker.length > 7 ? 16 : 20} fontWeight="700" fill={C.text}>
              {m.instrument.ticker.length > 10 ? `${m.instrument.ticker.slice(0, 9)}…` : m.instrument.ticker}
            </text>
            <rect x={barX} y={y + (rowH - 10) / 2 - 5} width={bw} height="10" rx="5" fill={up ? C.up : C.down} opacity="0.85" />
            <text x={rightX + rightW - 16} y={y + (rowH - 10) / 2 + 7} textAnchor="end" fontFamily={FONT} fontSize="20" fontWeight="700" fill={up ? C.up : C.down}>
              {fmtPct(m.pct)}
            </text>
          </g>
        );
      })}

      {/* Stopka */}
      <line x1={pad} x2={w - pad} y1={h - pad - 6} y2={h - pad - 6} stroke={C.line} strokeWidth="2" />
      <text x={pad} y={h - pad + 26} fontFamily={FONT} fontSize="18" fill={C.muted}>
        Mój Majątek · portfel inwestycyjny
      </text>
      <text x={w - pad} y={h - pad + 26} textAnchor="end" fontFamily={FONT} fontSize="18" fill={C.muted}>
        {options.hashtags?.split(/\s+/).slice(0, 3).join(' ')}
      </text>
    </svg>
  );
});

export default ReportCard;

// Eksport SVG → PNG (canvas, skala 2× dla ostrości)
export async function svgToPngBlob(svgEl, scale = 2) {
  const clone = svgEl.cloneNode(true);
  const w = Number(svgEl.getAttribute('width'));
  const h = Number(svgEl.getAttribute('height'));
  clone.removeAttribute('style');
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
