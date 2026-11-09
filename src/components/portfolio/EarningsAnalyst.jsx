import { useMemo, useRef, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ExternalLink, ImagePlus, Loader2, Search, Sparkles, Trash2, X } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { requestEarnings } from '../../lib/newsAi.js';
import { compressImage } from '../../lib/receipts.js';
import { RETENTION_DAYS, deleteEarnings, readEarnings, saveEarnings, surprise } from '../../lib/earnings.js';
import { chartChrome, seriesColor } from '../../lib/colors.js';
import { formatDate } from '../../lib/format.js';
import { BetaBadge, Card, ChartTooltip } from '../ui.jsx';
import { Legend } from '../charts/chartUtils.jsx';

const VERDICT = {
  beat: { label: 'BEAT', title: 'Pobił konsensus', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' },
  miss: { label: 'MISS', title: 'Poniżej konsensusu', cls: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300' },
  inline: { label: 'ZGODNIE', title: 'Zgodnie z konsensusem', cls: 'bg-stone-200 text-stone-700 dark:bg-white/10 dark:text-stone-200' },
  mixed: { label: 'MIESZANE', title: 'Część pozycji powyżej, część poniżej konsensusu', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
  unknown: { label: 'BRAK KONS.', title: 'Brak konsensusu do porównania', cls: 'bg-stone-100 text-stone-500 dark:bg-white/5 dark:text-stone-400' },
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
const inputCls = 'h-10 w-full min-w-0 rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 dark:border-white/10 dark:bg-neutral-800';

// Analityk wyników spółek (BETA): ticker / wklejony komunikat / zrzut ekranu → AI z wyszukiwarką Google ustala
// najnowszy kwartał, konsensus analityków i do 3 poprzednich kwartałów → Beat/Miss, wskaźniki, wykres kwartalny.
// Archiwum 12 miesięcy, unikalny klucz [Spółka + Kwartał] (lib/earnings.js).
export default function EarningsAnalyst() {
  const { state, actions } = useApp();
  const [query, setQuery] = useState('');
  const [text, setText] = useState('');
  const [image, setImage] = useState(null); // { base64, mime, name }
  const [busy, setBusy] = useState('');
  const [list, setList] = useState(readEarnings);
  const [openKey, setOpenKey] = useState(() => readEarnings()[0]?.key || null);
  const fileRef = useRef(null);
  const tickers = useMemo(() => [...new Set((state.instruments || []).map((i) => i.ticker || i.name).filter(Boolean))].sort(), [state.instruments]);
  const open = list.find((e) => e.key === openKey) || null;

  const onImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('Przygotowanie zrzutu…');
    try {
      const img = await compressImage(file);
      setImage({ base64: img.base64, mime: img.mime, name: file.name });
    } catch (err) {
      actions.notify(`Zrzut ekranu: ${err.message}`, 'warn');
    } finally {
      setBusy('');
    }
  };
  const run = async (e) => {
    e?.preventDefault();
    if (!query.trim() && !text.trim() && !image) return;
    setBusy('AI szuka wyników i konsensusu…');
    try {
      const res = await requestEarnings({ query: query.trim(), text: text.trim(), image: image?.base64 || '', mime: image?.mime });
      if (!res.analysis) throw new Error(res.error || 'Brak analizy');
      const entry = saveEarnings(res);
      setList(readEarnings());
      setOpenKey(entry.key);
      setText('');
      setImage(null);
      actions.notify(`Analiza ${entry.analysis.company} ${entry.analysis.quarter}: ${(VERDICT[entry.analysis.verdict] || VERDICT.unknown).title.toLowerCase()}${res.searchNote === 'limit' ? ' (bez wyszukiwarki – limit Google wyczerpany)' : ''}`, res.searchNote === 'limit' ? 'warn' : 'success');
    } catch (err) {
      actions.notify(`Analityk wyników: ${err.message}`, 'warn');
    } finally {
      setBusy('');
    }
  };
  const remove = (key) => {
    deleteEarnings(key);
    const next = readEarnings();
    setList(next);
    if (openKey === key) setOpenKey(next[0]?.key || null);
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
      subtitle="Wyniki kwartalne vs konsensus analityków (Beat/Miss) i 3 poprzednie kwartały"
      summary={list.length ? `${list.length} analiz` : undefined}
    >
      <form onSubmit={run} className="space-y-2" aria-label="Nowa analiza wyników">
        <div className="flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} list="earnings-tickers" maxLength={80} placeholder="Ticker lub spółka, np. PKO, KTY, AAPL" aria-label="Ticker lub nazwa spółki" className={inputCls} />
          <datalist id="earnings-tickers">
            {tickers.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <button type="submit" disabled={!!busy || (!query.trim() && !text.trim() && !image)} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:text-neutral-950">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Analizuj
          </button>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={20000} placeholder="Opcjonalnie: wklej komunikat / tabelę z wynikami" aria-label="Wklejone wyniki" className={`${inputCls} h-auto py-2`} />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onImage} aria-label="Zrzut ekranu z wynikami" />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-stone-200 px-3 font-semibold text-stone-700 hover:bg-stone-50 dark:border-white/10 dark:text-stone-200 dark:hover:bg-white/5">
            <ImagePlus size={14} /> Zrzut ekranu
          </button>
          {image && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-blue-800 dark:bg-blue-500/10 dark:text-blue-200">
              {image.name}
              <button type="button" onClick={() => setImage(null)} aria-label="Usuń zrzut ekranu">
                <X size={12} />
              </button>
            </span>
          )}
          {busy && <span className="text-violet-600 dark:text-violet-300" aria-live="polite">{busy}</span>}
        </div>
      </form>

      {open && <Analysis entry={open} />}

      {list.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-[11px] font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">Archiwum analiz</div>
          <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 dark:divide-white/5 dark:border-white/10" aria-label="Archiwum analiz">
            {list.map((e) => (
              <li key={e.key} className={`flex items-center gap-2 px-3 py-2 text-sm ${e.key === openKey ? 'bg-blue-50/60 dark:bg-blue-500/10' : ''}`}>
                <button type="button" onClick={() => setOpenKey(e.key)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-label={`Otwórz analizę ${e.analysis.company} ${e.analysis.quarter}`}>
                  <Verdict v={e.analysis.verdict} />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {e.analysis.company} {e.analysis.ticker && <span className="text-stone-400">({e.analysis.ticker})</span>} · {e.analysis.quarter}
                  </span>
                  <span className="shrink-0 text-[11px] text-stone-400">{formatDate(e.at.slice(0, 10))}</span>
                </button>
                <button type="button" onClick={() => remove(e.key)} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-stone-400 hover:text-red-600" aria-label={`Usuń analizę ${e.analysis.company} ${e.analysis.quarter}`}>
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-stone-400">Analizy są przechowywane {Math.round(RETENTION_DAYS / 30)} miesięcy (potem usuwane automatycznie); ponowna analiza tego samego kwartału nadpisuje wpis.</p>
        </div>
      )}
    </Card>
  );
}

function Analysis({ entry }) {
  const { isDark } = useApp();
  const a = entry.analysis;
  const chrome = chartChrome(isDark);
  const c = (i) => seriesColor(i, isDark);
  const hasNet = a.quarters.some((q) => q.netIncome !== null);
  const hasRev = a.quarters.some((q) => q.revenue !== null);
  const data = a.quarters.map((q) => ({ ...q }));
  return (
    <article className="mt-4 space-y-3" aria-label={`Analiza ${a.company} ${a.quarter}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">
            {a.company} {a.ticker && <span className="text-stone-400">({a.ticker})</span>} · {a.quarter}
          </h3>
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
                <th className="px-2 py-2 text-right font-medium">Konsensus</th>
                <th className="px-2 py-2 text-right font-medium">Ocena</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-white/5">
              {a.metrics.map((m) => {
                const s = surprise(m.actual, m.consensus);
                return (
                  <tr key={m.name}>
                    <td className="px-2.5 py-1.5 break-words">
                      {m.name}
                      {m.unit && <span className="block text-[10px] text-stone-400">{m.unit}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right font-medium">{nf(m.actual)}</td>
                    <td className="px-2 py-1.5 text-right text-stone-500 dark:text-stone-400">{nf(m.consensus)}</td>
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

      {data.length > 0 && (hasRev || hasNet) && (
        <div>
          <div className="mb-1 text-[11px] font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">Ostatnie kwartały {a.unit ? `(${a.unit})` : ''}</div>
          <div className="h-56" aria-label="Wykres kwartalny">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={chrome.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="quarter" tick={{ fill: chrome.muted, fontSize: 11 }} axisLine={{ stroke: chrome.axis }} tickLine={false} />
                <YAxis yAxisId="l" tick={{ fill: chrome.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => nf(v, 0)} />
                {hasNet && hasRev && <YAxis yAxisId="r" orientation="right" tick={{ fill: chrome.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => nf(v, 0)} />}
                <Tooltip content={<ChartTooltip formatter={(v) => nf(v)} />} />
                {hasRev && <Bar yAxisId="l" dataKey="revenue" name="Przychody" fill={c(0)} radius={[4, 4, 0, 0]} maxBarSize={36} />}
                {hasRev && <Line yAxisId="l" dataKey="revenueConsensus" name="Konsensus przychodów" stroke={c(0)} strokeDasharray="4 3" dot={{ r: 3 }} connectNulls />}
                {hasNet && <Bar yAxisId={hasRev ? 'r' : 'l'} dataKey="netIncome" name="Zysk netto" fill={c(1)} radius={[4, 4, 0, 0]} maxBarSize={36} />}
                {hasNet && <Line yAxisId={hasRev ? 'r' : 'l'} dataKey="netIncomeConsensus" name="Konsensus zysku" stroke={c(1)} strokeDasharray="4 3" dot={{ r: 3 }} connectNulls />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <Legend
            items={[
              ...(hasRev ? [{ key: 'rev', label: 'Przychody', color: c(0), bar: true }] : []),
              ...(hasNet ? [{ key: 'net', label: `Zysk netto${hasRev ? ' (oś prawa)' : ''}`, color: c(1), bar: true }] : []),
              { key: 'cons', label: 'Konsensus', color: chrome.muted, dashed: true },
            ]}
          />
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
              {a.outlook && <p className={a.risks.length ? 'mt-2' : ''}>
                <strong>Perspektywy:</strong> {a.outlook}
              </p>}
            </div>
          )}
        </div>
      )}

      <div className="text-[11px] text-stone-500 dark:text-stone-400">
        {entry.sources?.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Źródła:</span>
            {entry.sources.map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noreferrer noopener" className="inline-flex max-w-[14rem] items-center gap-0.5 truncate text-blue-600 hover:underline dark:text-blue-400">
                {s.title} <ExternalLink size={10} className="shrink-0" />
              </a>
            ))}
          </div>
        ) : (
          <span>
            {entry.grounded
              ? 'Wyszukiwarka nie zwróciła listy źródeł.'
              : entry.searchNote === 'limit'
                ? 'Limit wyszukiwarki Google w darmowym planie Gemini jest wyczerpany – analiza bez internetu (wiedza modelu i wklejony komunikat). Dla dokładnych liczb wklej komunikat lub zrzut z wynikami; wyszukiwanie wróci po odnowieniu limitu.'
                : 'Analiza bez wyszukiwania w internecie (dane z komunikatu i wiedzy modelu) – konsensus może być niepełny.'}
          </span>
        )}
        <p className="mt-1">AI może się mylić – zweryfikuj liczby w raporcie spółki. Przygotowano {new Date(entry.at).toLocaleString('pl-PL')}.</p>
      </div>
    </article>
  );
}
