import { useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FileText, Image as ImageIcon, Loader2, Paperclip, Sparkles, Trash2, X } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { requestEarnings } from '../../lib/newsAi.js';
import { compressImage } from '../../lib/receipts.js';
import { RETENTION_DAYS, companyKey, companyPeriods, deleteCompanyHistory, deleteEarnings, periodOrder, readEarnings, readHistory, saveEarnings, surprise } from '../../lib/earnings.js';
import { chartChrome, seriesColor } from '../../lib/colors.js';
import { formatDate } from '../../lib/format.js';
import { BetaBadge, Card, ChartTooltip } from '../ui.jsx';
import { Legend } from '../charts/chartUtils.jsx';

const VERDICT = {
  beat: { label: 'BEAT', title: 'Lepiej niż punkt odniesienia', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' },
  miss: { label: 'MISS', title: 'Gorzej niż punkt odniesienia', cls: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300' },
  inline: { label: 'ZGODNIE', title: 'Podobnie jak punkt odniesienia', cls: 'bg-stone-200 text-stone-700 dark:bg-white/10 dark:text-stone-200' },
  mixed: { label: 'MIESZANE', title: 'Część pozycji lepiej, część gorzej', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
  unknown: { label: 'BEZ OCENY', title: 'Brak punktu odniesienia (konsensusu)', cls: 'bg-stone-100 text-stone-500 dark:bg-white/5 dark:text-stone-400' },
};
const Verdict = ({ v, big }) => {
  const x = VERDICT[v] || VERDICT.unknown;
  return (
    <span title={x.title} className={`inline-flex shrink-0 items-center rounded-md font-bold tracking-wide ${big ? 'px-2.5 py-1 text-xs' : 'px-1.5 py-0.5 text-[10px]'} ${x.cls}`}>
      {x.label}
    </span>
  );
};
const nf = (v, d = 2) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('pl-PL', { maximumFractionDigits: d }));
const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1024))} kB`);
const inputCls = 'h-10 w-full min-w-0 rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 dark:border-white/10 dark:bg-neutral-800';
// Limity jednego zapytania (Vercel: 4,5 MB treści): pliki binarne łącznie ≤ ~3,8 MB base64, tekst ≤ 145 tys. znaków
const MAX_B64 = 3_800_000;
const MAX_PDF_INLINE = 2_600_000; // większy PDF → tekst wyciągnięty w przeglądarce
const MAX_TEXT = 145000;
const TEXT_RE = /\.(txt|csv|tsv|md|json|html?|xml)$/i;
const b64Of = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(',') + 1));
    r.onerror = () => reject(new Error('Nie udało się odczytać pliku'));
    r.readAsDataURL(file);
  });
const htmlToText = (h) => h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<\/t[dh]>/gi, '\t').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+\n/g, '\n');

// Analityk wyników spółek (BETA): wyłącznie Twoje materiały – wklejony tekst, zrzuty ekranu, raporty PDF i pliki
// tekstowe (bez wyszukiwania w internecie, bez limitów wyszukiwarki). AI wyłuskuje wskaźniki istotne dla branży,
// a każda analiza dopisuje liczby do własnej historii spółki (kwartał po kwartale) – z niej powstają wykresy.
export default function EarningsAnalyst() {
  const { state, actions } = useApp();
  const [query, setQuery] = useState('');
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]); // { id, name, kind: 'image' | 'pdf' | 'text', mime, data, text, size, note }
  const [busy, setBusy] = useState('');
  const [list, setList] = useState(readEarnings);
  const [hist, setHist] = useState(readHistory);
  const [company, setCompany] = useState(() => companyKey(readEarnings()[0]?.analysis || {}) || Object.keys(readHistory())[0] || null);
  const [openKey, setOpenKey] = useState(() => readEarnings()[0]?.key || null);
  const fileRef = useRef(null);
  const tickers = useMemo(() => [...new Set((state.instruments || []).map((i) => i.ticker || i.name).filter(Boolean))].sort(), [state.instruments]);
  const companies = useMemo(() => Object.entries(hist).map(([key, c]) => ({ key, ...c, count: Object.keys(c.periods || {}).length })).sort((a, b) => a.company.localeCompare(b.company, 'pl')), [hist]);
  const b64Used = files.reduce((n, f) => n + (f.data?.length || 0), 0);

  const addFiles = async (e) => {
    const picked = [...(e.target.files || [])];
    e.target.value = '';
    let used = b64Used;
    for (const file of picked) {
      const id = `${file.name}-${file.size}-${Date.now()}`;
      try {
        if (file.type.startsWith('image/')) {
          setBusy(`Przygotowanie: ${file.name}…`);
          const img = await compressImage(file);
          if (used + img.base64.length > MAX_B64) throw new Error('za dużo zrzutów w jednym zapytaniu – usuń część plików');
          used += img.base64.length;
          setFiles((f) => [...f, { id, name: file.name, kind: 'image', mime: img.mime, data: img.base64, size: img.bytes }]);
        } else if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
          if (file.size <= MAX_PDF_INLINE && used + file.size * 1.37 <= MAX_B64) {
            setBusy(`Wczytywanie PDF: ${file.name}…`);
            const data = await b64Of(file);
            used += data.length;
            setFiles((f) => [...f, { id, name: file.name, kind: 'pdf', mime: 'application/pdf', data, size: file.size }]);
          } else {
            // Duży raport: tekst wyciągnięty w przeglądarce (tabele zachowane jako wiersze)
            setBusy(`Odczyt tekstu z PDF: ${file.name}…`);
            const { pdfToText } = await import('../../lib/pdfText.js');
            const r = await pdfToText(file, { onProgress: (i, n) => setBusy(`Odczyt PDF ${file.name}: strona ${i}/${n}…`) });
            if (!r.text.trim()) throw new Error('PDF nie zawiera tekstu (skan) – dodaj zrzuty ekranu kluczowych tabel');
            setFiles((f) => [...f, { id, name: file.name, kind: 'text', text: r.text, size: file.size, note: `PDF → tekst, ${r.pages}/${r.totalPages} str.${r.truncated ? ' (skrócony)' : ''}` }]);
          }
        } else if (file.type.startsWith('text/') || TEXT_RE.test(file.name)) {
          const raw = await file.text();
          const t = /\.html?$/i.test(file.name) || file.type === 'text/html' ? htmlToText(raw) : raw;
          setFiles((f) => [...f, { id, name: file.name, kind: 'text', text: t.slice(0, MAX_TEXT), size: file.size }]);
        } else {
          throw new Error('nieobsługiwany format – zapisz dokument jako PDF albo wklej tekst');
        }
      } catch (err) {
        actions.notify(`${file.name}: ${err.message}`, 'warn');
      }
    }
    setBusy('');
  };

  const run = async (e) => {
    e?.preventDefault();
    const fileText = files
      .filter((f) => f.kind === 'text')
      .map((f) => `\n[Plik: ${f.name}]\n${f.text}`)
      .join('\n');
    const allText = `${text.trim()}${fileText}`.slice(0, MAX_TEXT);
    const bin = files.filter((f) => f.kind !== 'text').map((f) => ({ data: f.data, mime: f.mime, name: f.name }));
    if (!allText.trim() && !bin.length) return;
    // Historia spółki z własnej bazy – AI odniesie się do trendu
    const known = hist[companyKey({ ticker: query.trim() })] || (!query.trim() && company ? hist[company] : null);
    const history = known ? companyPeriods(known).map(({ quarter, revenue, netIncome, ebitda, eps }) => ({ quarter, revenue, netIncome, ebitda, eps })) : [];
    setBusy('AI analizuje Twoje materiały…');
    try {
      const res = await requestEarnings({ query: query.trim() || known?.ticker || known?.company || '', text: allText, files: bin, history });
      if (!res.analysis) throw new Error(res.error || 'Brak analizy');
      const entry = saveEarnings(res);
      setList(readEarnings());
      setHist(readHistory());
      setCompany(companyKey(entry.analysis));
      setOpenKey(entry.key);
      setText('');
      setFiles([]);
      actions.notify(`Zapisano: ${entry.analysis.company} ${entry.analysis.quarter} – historia spółki zaktualizowana`, 'success');
    } catch (err) {
      actions.notify(`Analityk wyników: ${err.message}`, 'warn');
    } finally {
      setBusy('');
    }
  };

  const sel = companies.find((c) => c.key === company) || null;
  const entries = list.filter((e) => companyKey(e.analysis) === company).sort((x, y) => periodOrder(y.analysis.quarter) - periodOrder(x.analysis.quarter));
  const open = entries.find((e) => e.key === openKey) || entries[0] || null;
  const removeEntry = (key) => {
    deleteEarnings(key);
    setList(readEarnings());
  };
  const removeCompany = () => {
    if (!sel || !window.confirm(`Usunąć całą historię spółki ${sel.company} (${sel.count} okresów) i jej analizy?`)) return;
    for (const e of entries) deleteEarnings(e.key);
    deleteCompanyHistory(sel.key);
    const h = readHistory();
    setHist(h);
    setList(readEarnings());
    setCompany(Object.keys(h)[0] || null);
  };

  return (
    <Card
      collapsible
      storageKey="fintrack-portfolio-open-earnings"
      icon={Sparkles}
      title={
        <>
          Analityk wyników spółek
          <BetaBadge />
        </>
      }
      subtitle="Wklej wyniki, zrzut lub raport PDF – kluczowe wskaźniki branży i własna historia spółek"
      summary={companies.length ? `${companies.length} spółek · ${companies.reduce((n, c) => n + c.count, 0)} okresów` : undefined}
    >
      <form onSubmit={run} className="space-y-2" aria-label="Nowa analiza wyników">
        <input value={query} onChange={(e) => setQuery(e.target.value)} list="earnings-tickers" maxLength={80} placeholder="Spółka / ticker (opcjonalnie), np. DIG, PKO, KTY" aria-label="Ticker lub nazwa spółki" className={inputCls} />
        <datalist id="earnings-tickers">
          {[...new Set([...companies.map((c) => c.ticker || c.company), ...tickers])].filter(Boolean).map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={MAX_TEXT} placeholder="Wklej komunikat / tabelę z wynikami (możesz dopisać konsensus, np. „konsensus zysku netto 120 mln”)" aria-label="Wklejone wyniki" className={`${inputCls} h-auto py-2`} />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input ref={fileRef} type="file" multiple accept="image/*,application/pdf,.pdf,.txt,.csv,.tsv,.md,.json,.html,.htm,.xml,text/*" className="hidden" onChange={addFiles} aria-label="Pliki z wynikami" />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-stone-200 px-3 font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-white/10 dark:text-stone-200 dark:hover:bg-white/5">
            <Paperclip size={14} /> Dodaj pliki (PDF, zrzuty, tekst)
          </button>
          {files.map((f) => (
            <span key={f.id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-blue-800 dark:bg-blue-500/10 dark:text-blue-200">
              {f.kind === 'image' ? <ImageIcon size={12} /> : <FileText size={12} />}
              <span className="max-w-[10rem] truncate">{f.name}</span>
              <span className="text-blue-500/80">· {f.note || kb(f.size)}</span>
              <button type="button" onClick={() => setFiles((all) => all.filter((x) => x.id !== f.id))} aria-label={`Usuń plik ${f.name}`}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="submit" disabled={!!busy || (!text.trim() && !files.length)} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:text-neutral-950">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Analizuj i zapisz
          </button>
          {busy && (
            <span className="text-xs text-violet-600 dark:text-violet-300" aria-live="polite">
              {busy}
            </span>
          )}
        </div>
        <p className="text-[11px] text-stone-500 dark:text-stone-400">Analityk korzysta wyłącznie z Twoich materiałów (bez wyszukiwania w internecie). Duże raporty PDF są zamieniane na tekst w przeglądarce.</p>
      </form>

      {companies.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">Moje spółki</div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Moje spółki">
            {companies.map((c) => (
              <button key={c.key} type="button" onClick={() => setCompany(c.key)} aria-pressed={c.key === company} className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${c.key === company ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500 dark:text-neutral-950' : 'border-stone-200 text-stone-700 hover:bg-stone-50 dark:border-white/10 dark:text-stone-200 dark:hover:bg-white/5'}`}>
                {c.ticker || c.company}
                <span className={`rounded-full px-1.5 text-[10px] ${c.key === company ? 'bg-white/25' : 'bg-stone-100 dark:bg-white/10'}`}>{c.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {sel && <CompanyHistory company={sel} />}

      {sel && entries.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5" role="group" aria-label="Analizy spółki">
            {entries.map((e) => (
              <span key={e.key} className={`inline-flex h-7 items-center gap-1 rounded-full border pr-1 pl-2.5 text-[11px] ${open?.key === e.key ? 'border-violet-400 bg-violet-50 dark:border-violet-400/40 dark:bg-violet-500/10' : 'border-stone-200 dark:border-white/10'}`}>
                <button type="button" onClick={() => setOpenKey(e.key)} className="inline-flex items-center gap-1 font-semibold" aria-label={`Otwórz analizę ${e.analysis.company} ${e.analysis.quarter}`}>
                  {e.analysis.quarter} <Verdict v={e.analysis.verdict} />
                </button>
                <button type="button" onClick={() => removeEntry(e.key)} className="inline-flex h-5 w-5 items-center justify-center rounded text-stone-400 hover:text-red-600" aria-label={`Usuń analizę ${e.analysis.company} ${e.analysis.quarter}`}>
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
          {open && <Analysis entry={open} />}
        </div>
      )}
      {sel && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-400">
          <span>Historia liczb spółki jest zapisywana bezterminowo (Twoje konto); pełne analizy – {Math.round(RETENTION_DAYS / 30)} mies. Ponowna analiza tego samego okresu nadpisuje wpis.</span>
          <button type="button" onClick={removeCompany} className="inline-flex items-center gap-1 font-semibold text-stone-500 hover:text-red-600 dark:text-stone-400">
            <Trash2 size={12} /> Usuń historię spółki
          </button>
        </div>
      )}
    </Card>
  );
}

// Historia spółki: wyniki kwartalne (przychody, zysk netto, EBITDA) i wybrany wskaźnik branżowy w czasie
function CompanyHistory({ company }) {
  const { isDark } = useApp();
  const chrome = chartChrome(isDark);
  const c = (i) => seriesColor(i, isDark);
  const periods = companyPeriods(company);
  const has = (f) => periods.some((p) => p[f] !== null && p[f] !== undefined);
  const metricNames = useMemo(() => {
    const count = {};
    for (const p of periods) for (const n of Object.keys(p.metrics || {})) count[n] = (count[n] || 0) + 1;
    return Object.entries(count)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pl'))
      .map(([n]) => n);
  }, [periods]);
  const [metric, setMetric] = useState(null);
  const m = metric && metricNames.includes(metric) ? metric : metricNames[0];
  const mData = periods.filter((p) => p.metrics?.[m]).map((p) => ({ quarter: p.quarter, value: p.metrics[m].value }));
  const mUnit = periods.find((p) => p.metrics?.[m])?.metrics[m].unit || '';
  const lowerBetter = periods.find((p) => p.metrics?.[m])?.metrics[m].lowerIsBetter;
  const right = has('revenue') && (has('netIncome') || has('ebitda'));
  return (
    <section className="mt-4 space-y-3" aria-label={`Historia ${company.company}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">
          {company.company} {company.ticker && <span className="text-stone-400">({company.ticker})</span>}
        </h3>
        <span className="text-xs text-stone-500 dark:text-stone-400">
          {company.industry ? `${company.industry} · ` : ''}
          {periods.length} {periods.length === 1 ? 'okres' : 'okresów'} w historii{company.unit ? ` · ${company.unit}` : ''}
        </span>
      </div>
      {(has('revenue') || has('netIncome') || has('ebitda')) && (
        <div>
          <div className="mb-1 text-[11px] font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">Wyniki kwartalne</div>
          <div className="h-56" aria-label="Wykres historii wyników">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={periods} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={chrome.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="quarter" tick={{ fill: chrome.muted, fontSize: 11 }} axisLine={{ stroke: chrome.axis }} tickLine={false} minTickGap={8} />
                <YAxis yAxisId="l" tick={{ fill: chrome.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => nf(v, 0)} />
                {right && <YAxis yAxisId="r" orientation="right" tick={{ fill: chrome.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => nf(v, 0)} />}
                <Tooltip content={<ChartTooltip formatter={(v) => nf(v)} />} />
                {has('revenue') && <Bar yAxisId="l" dataKey="revenue" name="Przychody" fill={c(0)} radius={[4, 4, 0, 0]} maxBarSize={34} />}
                {has('netIncome') && <Line yAxisId={right ? 'r' : 'l'} dataKey="netIncome" name="Zysk netto" stroke={c(1)} strokeWidth={2} dot={{ r: 3 }} connectNulls />}
                {has('ebitda') && <Line yAxisId={right ? 'r' : 'l'} dataKey="ebitda" name="EBITDA" stroke={c(2)} strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3 }} connectNulls />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <Legend
            items={[
              ...(has('revenue') ? [{ key: 'rev', label: 'Przychody', color: c(0), bar: true }] : []),
              ...(has('netIncome') ? [{ key: 'net', label: `Zysk netto${right ? ' (oś prawa)' : ''}`, color: c(1) }] : []),
              ...(has('ebitda') ? [{ key: 'ebitda', label: `EBITDA${right ? ' (oś prawa)' : ''}`, color: c(2), dashed: true }] : []),
            ]}
          />
        </div>
      )}
      {metricNames.length > 0 && (
        <div>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">Wskaźnik branżowy w czasie</span>
            <select value={m} onChange={(e) => setMetric(e.target.value)} aria-label="Wybór wskaźnika" className="h-8 max-w-[14rem] rounded-lg border border-stone-200 bg-white px-2 text-xs dark:border-white/10 dark:bg-neutral-800">
              {metricNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="h-44" aria-label="Wykres wskaźnika">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mData} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={chrome.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="quarter" tick={{ fill: chrome.muted, fontSize: 11 }} axisLine={{ stroke: chrome.axis }} tickLine={false} />
                <YAxis tick={{ fill: chrome.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => nf(v, 1)} />
                <Tooltip content={<ChartTooltip formatter={(v) => `${nf(v)}${mUnit ? ` ${mUnit}` : ''}`} />} />
                <Bar dataKey="value" name={m} radius={[4, 4, 0, 0]} maxBarSize={34}>
                  {mData.map((d, i) => (
                    <Cell key={d.quarter} fill={i === mData.length - 1 ? c(3) : c(4)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-stone-500 dark:text-stone-400">
            {m}
            {mUnit ? ` (${mUnit})` : ''} – {mData.length} {mData.length === 1 ? 'okres' : 'okresów'}
            {lowerBetter ? ' · niższa wartość = lepiej' : ''}
            {mData.length < 2 ? ' · wgrywaj kolejne raporty, aby zobaczyć trend' : ''}
          </p>
        </div>
      )}
    </section>
  );
}

function Analysis({ entry }) {
  const a = entry.analysis;
  const hasCons = a.metrics.some((m) => m.consensus !== null && m.consensus !== undefined);
  const hasPrev = a.metrics.some((m) => m.previous !== null && m.previous !== undefined);
  const refCol = hasCons ? 'consensus' : hasPrev ? 'previous' : null;
  return (
    <article className="mt-2 space-y-3 rounded-xl border border-stone-200 p-3 dark:border-white/10" aria-label={`Analiza ${a.company} ${a.quarter}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">
            {a.quarter}
            {a.periodEnd ? <span className="font-normal text-stone-400"> · do {formatDate(a.periodEnd)}</span> : ''}
          </h4>
          <p className="text-sm text-stone-600 dark:text-stone-300">{a.headline}</p>
        </div>
        <Verdict v={a.verdict} big />
      </div>

      {a.metrics.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-white/10">
          <table className="w-full text-[13px] tabular" aria-label="Wskaźniki vs konsensus">
            <thead>
              <tr className="bg-stone-50 text-left text-[11px] text-stone-500 dark:bg-white/[0.03] dark:text-stone-400">
                <th className="px-2.5 py-2 font-medium">Wskaźnik</th>
                <th className="px-2 py-2 text-right font-medium">Wynik</th>
                {refCol && <th className="px-2 py-2 text-right font-medium">{refCol === 'consensus' ? 'Konsensus' : 'Rok wcześniej'}</th>}
                <th className="px-2 py-2 text-right font-medium">Ocena</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-white/5">
              {a.metrics.map((m) => {
                const ref = refCol ? m[refCol] : null;
                const s = surprise(m.actual, ref ?? null);
                return (
                  <tr key={m.name}>
                    <td className="px-2.5 py-1.5 break-words">
                      {m.name}
                      {m.unit && <span className="block text-[10px] text-stone-400">{m.unit}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right font-medium">{nf(m.actual)}</td>
                    {refCol && <td className="px-2 py-1.5 text-right text-stone-500 dark:text-stone-400">{nf(ref)}</td>}
                    {/* Kolor odchylenia wg oceny (np. wyższe koszty = MISS), nie wg znaku */}
                    <td className="px-2 py-1.5 text-right">
                      <Verdict v={m.verdict} />
                      <span className={`mt-0.5 block text-[11px] ${m.verdict === 'beat' ? 'text-emerald-700 dark:text-emerald-400' : m.verdict === 'miss' ? 'text-red-600 dark:text-red-400' : 'text-stone-500 dark:text-stone-400'}`}>{s === null ? '' : `${s >= 0 ? '+' : ''}${nf(s, 1)}%`}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(a.highlights.length > 0 || a.risks.length > 0 || a.outlook) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {a.highlights.length > 0 && (
            <div className="rounded-xl bg-emerald-50/60 p-3 text-[13px] dark:bg-emerald-500/[0.06]">
              <div className="mb-1 text-[11px] font-bold tracking-wide text-emerald-800 uppercase dark:text-emerald-300">Najważniejsze</div>
              <ul className="list-disc space-y-0.5 pl-4">
                {a.highlights.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          )}
          {(a.risks.length > 0 || a.outlook) && (
            <div className="rounded-xl bg-amber-50/60 p-3 text-[13px] dark:bg-amber-500/[0.06]">
              {a.risks.length > 0 && (
                <>
                  <div className="mb-1 text-[11px] font-bold tracking-wide text-amber-800 uppercase dark:text-amber-300">Ryzyka</div>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {a.risks.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </>
              )}
              {a.outlook && (
                <p className={a.risks.length ? 'mt-2' : ''}>
                  <strong>Perspektywy:</strong> {a.outlook}
                </p>
              )}
            </div>
          )}
        </div>
      )}
      <p className="text-[11px] text-stone-500 dark:text-stone-400">
        {refCol === 'consensus' ? 'Ocena względem podanego konsensusu' : refCol === 'previous' ? 'Ocena względem tego samego okresu rok wcześniej' : 'Brak punktu odniesienia – dopisz konsensus albo wgraj raport z danymi porównawczymi'}. Na podstawie Twoich materiałów – AI może się mylić. Zapisano {new Date(entry.at).toLocaleString('pl-PL')}.
      </p>
    </article>
  );
}
