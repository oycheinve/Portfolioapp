// Etap 5: tekst posta na X na podstawie metryk okresu i statystyk całego portfela

const pln0 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
const pct1 = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function fmtZl(v, sign = false) {
  const n = Math.round(Number(v) || 0);
  const s = `${pln0.format(Math.abs(n))} zł`;
  if (!sign) return n < 0 ? `−${s}` : s;
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
}

export function fmtPct(v, sign = true) {
  const n = (Number(v) || 0) * 100;
  const s = `${pct1.format(Math.abs(n))}%`;
  if (!sign) return n < 0 ? `−${s}` : s;
  return n > 0.049 ? `+${s}` : n < -0.049 ? `−${s}` : s;
}

const PERIOD_NOUN = { WEEK: 'tygodnia', MONTH: 'miesiąca', YEAR: 'roku' };

export function reportHeader(period) {
  const base = period.type === 'WEEK' ? period.label.replace(' / ', '/') : period.label;
  return `📊 Raport portfela | ${base}${period.closed ? '' : ` (do ${period.end.slice(8, 10)}.${period.end.slice(5, 7)})`}`;
}

export function buildPostText({ metrics, totals, options }) {
  const { hideAmounts, topN = 2, hashtags = '', handle = '' } = options;
  const lines = [reportHeader(metrics.period), ''];
  if (!hideAmounts) {
    lines.push(`💼 Wartość portfela: ${fmtZl(totals.value)}`);
    lines.push(`💰 Wpłacone: ${fmtZl(totals.contributions)}`);
    lines.push(`📈 Zysk total: ${fmtZl(totals.profit, true)} (${fmtPct(totals.profitPct)})`);
    lines.push(`💸 w tym dywidendy: ${fmtZl(totals.dividends)}`);
    lines.push(`🗓️ Wynik ${PERIOD_NOUN[metrics.period.type]}: ${fmtPct(metrics.pct)} (${fmtZl(metrics.profit, true)})`);
  } else {
    lines.push(`📈 Zysk total: ${fmtPct(totals.profitPct)}`);
    lines.push(`🗓️ Wynik ${PERIOD_NOUN[metrics.period.type]}: ${fmtPct(metrics.pct)}`);
  }
  const movers = metrics.instruments;
  if (movers.length) {
    const top = movers.slice(0, topN).filter((m) => m.pct >= 0.0005);
    const bottom = movers.slice(-topN).reverse().filter((m) => m.pct <= -0.0005 && !top.includes(m));
    if (top.length) lines.push(`🚀 Najlepsze: ${top.map((m) => `${m.instrument.ticker} ${fmtPct(m.pct)}`).join(' · ')}`);
    if (bottom.length) lines.push(`🔻 Najsłabsze: ${bottom.map((m) => `${m.instrument.ticker} ${fmtPct(m.pct)}`).join(' · ')}`);
  }
  if (!hideAmounts && metrics.dividends > 0) lines.push(`🪙 Dywidendy w okresie: ${fmtZl(metrics.dividends)}`);
  const tail = [hashtags.trim(), handle.trim()].filter(Boolean).join(' ');
  if (tail) lines.push('', tail);
  return lines.join('\n');
}

// Długość wg zasad X (uproszczone): znaki spoza podstawowych zakresów (emoji, CJK) liczone podwójnie
export function xLength(text) {
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === 0xfe0f || cp === 0x200d) continue;
    n += cp > 0x10ff && !(cp >= 0x2000 && cp <= 0x206f) ? 2 : 1;
  }
  return n;
}
