import { useMemo, useRef, useState } from 'react';
import { Check, ClipboardCopy, Download, Image as ImageIcon, Send } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { computePeriodStats, isoDay } from '../../lib/engine.js';
import { createPriceResolver } from '../../lib/history.js';
import { buildPortfolioSeries, defaultSelection } from '../../lib/series.js';
import { listPeriods, periodMetrics } from '../../lib/reports.js';
import { buildPostText, fmtPct, xLength } from '../../lib/xReport.js';
import { dividendKpis } from '../../lib/dividends.js';
import { instrumentColorMap } from '../allocation/AllocationDonut.jsx';
import { Button, Card, Field, Input, Segmented, Select, Toggle } from '../ui.jsx';
import ReportCard, { CARD_SIZES, svgToPngBlob } from './ReportCard.jsx';

const TYPES = [
  { value: 'WEEK', label: 'Tygodniowy' },
  { value: 'MONTH', label: 'Miesięczny' },
  { value: 'YEAR', label: 'Roczny' },
];
const X_LIMIT = 280;
const PREFS_KEY = 'wealth-app-x-report';

function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
  } catch {
    return {};
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export default function XReportGenerator() {
  const { state, actions } = useApp();
  const saved = useMemo(readPrefs, []);
  const [type, setType] = useState(saved.type || 'MONTH');
  const [periodIdx, setPeriodIdx] = useState(0);
  const [options, setOptions] = useState({
    hideAmounts: !!saved.hideAmounts,
    topN: saved.topN || 1,
    hashtags: saved.hashtags ?? '',
    handle: saved.handle || '',
  });
  const [size, setSize] = useState(saved.size || 'WIDE');
  const [edited, setEdited] = useState(null);
  const [copied, setCopied] = useState(false);
  const svgRef = useRef(null);

  const persist = (patch) => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ type, size, ...options, ...patch }));
    } catch {
      // brak localStorage – preferencje nie zostaną zapamiętane
    }
  };
  const setOpt = (patch) => {
    setOptions((o) => ({ ...o, ...patch }));
    setEdited(null);
    persist(patch);
  };

  const periods = useMemo(() => listPeriods(state, type), [state, type]);
  const period = periods[Math.min(periodIdx, periods.length - 1)];
  const resolver = useMemo(() => createPriceResolver(state), [state]);
  const metrics = useMemo(() => (period ? periodMetrics(state, period, resolver) : null), [state, period, resolver]);
  const totals = useMemo(() => {
    const st = computePeriodStats(state, { period: 'ALL' });
    const k = dividendKpis(state);
    return {
      value: st.endValue,
      contributions: st.contributionsAll,
      profit: st.totalReturn,
      profitPct: st.contributionsAll > 0 ? st.totalReturn / st.contributionsAll : 0,
      dividends: st.dividendsNet,
      dividendYield: k.yield,
    };
  }, [state]);
  const series = useMemo(
    () => (period ? buildPortfolioSeries(state, { range: { start: period.start, end: period.end }, selection: defaultSelection(), benchmarks: [], resolver }).points : []),
    [state, period, resolver],
  );
  const colors = useMemo(() => instrumentColorMap(state, true), [state]);

  const generated = metrics ? buildPostText({ metrics, totals, options }) : '';
  const text = edited ?? generated;
  const length = xLength(text);

  const onCopy = async () => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      actions.notify('Skopiowano tekst posta – wklej go na X', 'success');
    } else actions.notify('Przeglądarka zablokowała schowek', 'error');
  };

  const fileName = () =>
    `raport-${period?.label
      .toLowerCase()
      .replace(/ł/g, 'l')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')}-${isoDay(new Date())}.png`;
  const onDownload = async () => {
    if (!svgRef.current) return;
    const blob = await svgToPngBlob(svgRef.current);
    if (!blob) {
      actions.notify('Nie udało się wygenerować obrazu', 'error');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const onCopyImage = async () => {
    try {
      const blob = await svgToPngBlob(svgRef.current);
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
      actions.notify('Skopiowano obraz karty do schowka', 'success');
    } catch {
      actions.notify('Kopiowanie obrazu nieobsługiwane – użyj „Pobierz PNG”', 'warn');
    }
  };
  const intentUrl = `https://x.com/intent/post?text=${encodeURIComponent(text)}`;

  if (!period || !metrics) return <Card title="Raport na X">Brak danych do raportu.</Card>;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-neutral-900">
        <Segmented
          options={TYPES}
          value={type}
          onChange={(t) => {
            setType(t);
            setPeriodIdx(0);
            setEdited(null);
            persist({ type: t });
          }}
          ariaLabel="Okres raportu"
        />
        <Select
          value={periodIdx}
          onChange={(e) => {
            setPeriodIdx(Number(e.target.value));
            setEdited(null);
          }}
          className="w-auto min-w-[11rem]"
          aria-label="Wybór okresu"
        >
          {periods.map((p, i) => (
            <option key={p.first} value={i}>
              {p.label}
              {p.closed ? '' : ' (w toku)'}
            </option>
          ))}
        </Select>
        <span className="text-xs text-stone-500 dark:text-stone-400">{period.rangeLabel}</span>
        <span className={`ml-auto text-sm font-semibold tabular ${metrics.profit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {fmtPct(metrics.pct)} w okresie
        </span>
      </div>

      <div className="grid items-start gap-4 sm:gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <Card
          title="Tekst posta na X"
          subtitle="Generowany automatycznie – możesz go poprawić przed skopiowaniem"
          icon={Send}
          actions={
            <Button variant="primary" size="sm" icon={copied ? Check : ClipboardCopy} onClick={onCopy}>
              {copied ? 'Skopiowano' : 'Kopiuj tekst na X'}
            </Button>
          }
        >
          <div className="space-y-4">
            <div className="relative">
              <textarea
                value={text}
                onChange={(e) => setEdited(e.target.value)}
                rows={12}
                aria-label="Tekst posta"
                className="w-full resize-y rounded-xl border border-stone-200 bg-stone-50 p-3 font-sans text-sm leading-relaxed outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-neutral-950"
              />
              <div className="mt-1 flex items-center justify-between text-xs">
                {edited !== null ? (
                  <button type="button" className="text-blue-600 hover:underline dark:text-blue-400" onClick={() => setEdited(null)}>
                    Przywróć wygenerowany tekst
                  </button>
                ) : (
                  <span className="text-stone-500">Dane z {period.closed ? 'zamkniętego' : 'bieżącego'} okresu</span>
                )}
                <span className={`tabular font-medium ${length > X_LIMIT ? 'text-amber-700 dark:text-amber-400' : 'text-stone-500'}`}>
                  {length}/{X_LIMIT}
                  {length > X_LIMIT && ' – wymaga X Premium lub skrócenia'}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Liczba ruchów (wzrost / spadek)">
                <Select value={options.topN} onChange={(e) => setOpt({ topN: Number(e.target.value) })}>
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Twój nick na X">
                <Input value={options.handle} placeholder="@nick" onChange={(e) => setOpt({ handle: e.target.value })} />
              </Field>
              <Field label="Hashtagi" className="col-span-2">
                <Input value={options.hashtags} onChange={(e) => setOpt({ hashtags: e.target.value })} />
              </Field>
            </div>
            <Toggle
              checked={options.hideAmounts}
              onChange={(v) => setOpt({ hideAmounts: v })}
              label="Ukryj kwoty (tylko procenty)"
              description="Tryb prywatny – w poście i na karcie nie pojawią się wartości w zł"
            />
            <a
              href={intentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-stone-200 px-3 text-sm font-medium hover:bg-stone-50 dark:border-white/10 dark:hover:bg-white/5"
            >
              <Send size={16} /> Otwórz w X z tym tekstem
            </a>
          </div>
        </Card>

        <Card
          title="Karta graficzna"
          subtitle="Podgląd do zrzutu ekranu lub pobrania jako obraz PNG"
          icon={ImageIcon}
          actions={
            <>
              <Segmented
                size="sm"
                value={size}
                onChange={(v) => {
                  setSize(v);
                  persist({ size: v });
                }}
                ariaLabel="Format karty"
                options={Object.entries(CARD_SIZES).map(([k, v]) => ({ value: k, label: v.label }))}
              />
              <Button size="sm" icon={Download} onClick={onDownload}>
                Pobierz PNG
              </Button>
              <Button size="sm" variant="ghost" icon={ClipboardCopy} onClick={onCopyImage}>
                Kopiuj obraz
              </Button>
            </>
          }
        >
          <div className={`mx-auto ${size === 'SQUARE' ? 'max-w-xl' : ''}`}>
            <div className="overflow-hidden rounded-2xl shadow-lg ring-1 ring-black/5">
              <ReportCard ref={svgRef} metrics={metrics} totals={totals} series={series} colors={colors} options={options} size={size} />
            </div>
          </div>
          <p className="mt-3 text-[11px] text-stone-500 dark:text-stone-500">
            Logotypy spółek zastąpione monogramami w kolorach instrumentów. Ruchy instrumentów = zmiana ceny w PLN w okresie
            {metrics.sources.includes('revaluation') ? ' (część wycen z historii cen / rekonstrukcji)' : ''}.
          </p>
        </Card>
      </div>
    </div>
  );
}
