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

// Kwoty i procenty w szablonach posta: „9 736,12 zł”, „200 zł”, „+26,64%”, „-1,59%” (zwykły minus i spacje tysięcy)
function groupThousands(intPart) {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function tplZl(v, sign = false) {
  const n = Math.round((Number(v) || 0) * 100) / 100;
  const abs = Math.abs(n);
  const [i, d] = abs.toFixed(2).split('.');
  const body = Number.isInteger(abs) ? groupThousands(i) : `${groupThousands(i)},${d}`;
  const prefix = n < 0 ? '-' : sign && n > 0 ? '+' : '';
  return `${prefix}${body} zł`;
}

export function tplPct(v, sign = true) {
  const n = Math.round((Number(v) || 0) * 10000) / 100;
  const body = Math.abs(n).toFixed(2).replace('.', ',');
  const prefix = n < 0 ? '-' : sign && n > 0 ? '+' : '';
  return `${prefix}${body}%`;
}

function moverName(m) {
  return m.instrument.ticker || m.instrument.name;
}

function tail(options) {
  const t = [String(options.hashtags || '').trim(), String(options.handle || '').trim()].filter(Boolean).join(' ');
  return t ? ['', t] : [];
}

// Szablon tygodniowy – dosłownie wg wzoru użytkownika
function weeklyText({ metrics, totals, options }) {
  const { hideAmounts, topN = 1 } = options;
  const lines = [`📊 Raport portfela | Tydzień ${isoWeekNumber(metrics.period)}`];
  if (!hideAmounts) {
    lines.push(`Wartość: ${tplZl(totals.value)}`);
    lines.push(`Wpłacone: ${tplZl(totals.contributions)}`);
    lines.push(`Zysk total: ${tplZl(totals.profit, true)} (${tplPct(totals.profitPct)})`);
    lines.push(`(w tym ${tplZl(totals.dividends)} z dywidend)`);
    lines.push(`Wynik tygodnia: ${tplPct(metrics.pct)} (${tplZl(metrics.profit, true)})`);
  } else {
    lines.push(`Zysk total: ${tplPct(totals.profitPct)}`);
    lines.push(`Wynik tygodnia: ${tplPct(metrics.pct)}`);
  }
  const movers = metrics.instruments;
  const up = movers.filter((m) => m.pct > 0).slice(0, topN);
  const down = [...movers].reverse().filter((m) => m.pct < 0).slice(0, topN);
  if (up.length || down.length) {
    lines.push('Największe ruchy:');
    for (const m of up) lines.push(`🟢 ${moverName(m)}: ${tplPct(m.pct)}`);
    for (const m of down) lines.push(`🔴 ${moverName(m)} ${tplPct(m.pct)}`);
  }
  return [...lines, ...tail(options)].join('\n');
}

// Szablon miesięczny – dosłownie wg wzoru użytkownika
function monthlyText({ metrics, options }) {
  const { hideAmounts } = options;
  const lines = ['📊 Podsumowanie miesiąca:'];
  if (!hideAmounts) {
    lines.push(`Wpłaty: ${tplZl(metrics.deposits)}`);
    lines.push(`Zysk/strata: ${tplZl(metrics.profit, true)}`);
  } else {
    lines.push(`Zysk/strata: ${tplPct(metrics.pct)}`);
  }
  const movers = metrics.instruments;
  if (movers.length) {
    const worst = movers[movers.length - 1];
    const best = movers[0];
    lines.push(`🔴Najgorsze ostatnie (1M): ${moverName(worst)} ${tplPct(worst.pct)}`);
    lines.push(`🟢Najlepsze ostatnie (1M): ${moverName(best)} ${tplPct(best.pct)}`);
  }
  if (!hideAmounts) lines.push(`Dywidendy: ${tplZl(metrics.dividends)}`);
  return [...lines, ...tail(options)].join('\n');
}

function isoWeekNumber(period) {
  const m = /Tydzień (\d+)/.exec(period.label);
  return m ? m[1] : '';
}

export function buildPostText({ metrics, totals, options }) {
  if (metrics.period.type === 'WEEK') return weeklyText({ metrics, totals, options });
  if (metrics.period.type === 'MONTH') return monthlyText({ metrics, totals, options });
  // Raport roczny – dotychczasowy układ
  const { hideAmounts, topN = 2 } = options;
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
  return [...lines, ...tail(options)].join('\n');
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
