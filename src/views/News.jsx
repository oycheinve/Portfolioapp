import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Newspaper, Plus, RefreshCw, X } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { computeHoldings, isoDay } from '../lib/engine.js';
import { fetchNews, fetchNewsMany, readTopics, timeAgo, writeTopics } from '../lib/news.js';
import { Card, EmptyState } from '../components/ui.jsx';

const ALL = '__all';
const MAX_ALL = 10; // „Wszystkie moje spółki” – najwyżej tyle tematów naraz
const LIST_LIMIT = 40;

// Nazwa do wyszukiwania: pełna nazwa spółki bez dopisków typu „S.A.” (trafniejsze wyniki niż sam ticker)
const searchName = (inst) =>
  String(inst.name || inst.ticker || '')
    .replace(/\s+(S\.?A\.?|SA|ASA|AG|NV|PLC|Inc\.?|Ltd\.?)$/i, '')
    .trim();

// Wiadomości giełdowe: pigułki z posiadanymi spółkami / ETF-ami i własnymi tematami, lista artykułów od najnowszych
export default function NewsView() {
  const { state } = useApp();
  const held = useMemo(() => {
    const ids = new Set(computeHoldings(state, isoDay(new Date()), null).filter((h) => h.quantity > 1e-9).map((h) => h.instrumentId));
    return state.instruments
      .filter((i) => ids.has(i.id))
      .map((i) => ({ id: `inst:${i.id}`, label: i.ticker || i.name, query: searchName(i), symbol: i.yahooSymbol || null, title: i.name }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pl'));
  }, [state]);
  const [custom, setCustom] = useState(readTopics);
  const topics = useMemo(() => [...held, ...custom.map((t) => ({ id: `custom:${t}`, label: t, query: t, symbol: null, custom: true }))], [held, custom]);
  const [selected, setSelected] = useState(ALL);
  const active = selected === ALL ? null : topics.find((t) => t.id === selected) || null;
  const [result, setResult] = useState({ items: [], errors: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState('');

  const load = useCallback(
    async (force = false) => {
      const list = selected === ALL ? topics.slice(0, MAX_ALL) : active ? [active] : [];
      if (!list.length) {
        setResult({ items: [], errors: [] });
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const r = list.length === 1 && selected !== ALL ? await fetchNews(list[0], { force }) : await fetchNewsMany(list, { force });
        setResult(r);
      } catch (e) {
        setError(e.message);
        setResult({ items: [], errors: [] });
      } finally {
        setLoading(false);
      }
    },
    [selected, active, topics],
  );

  // Wybrany temat zniknął (sprzedana spółka, usunięty temat) – powrót do „Wszystkie”
  useEffect(() => {
    if (selected !== ALL && !active) setSelected(ALL);
  }, [selected, active]);

  const topicsKey = topics.map((t) => t.id).join('|');
  useEffect(() => {
    load(false);
  }, [selected, topicsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const addTopic = (e) => {
    e.preventDefault();
    const t = draft.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!t) return;
    if (!custom.some((c) => c.toLowerCase() === t.toLowerCase())) {
      const next = [...custom, t];
      setCustom(next);
      writeTopics(next);
    }
    setDraft('');
    setSelected(`custom:${t}`);
  };
  const removeTopic = (t) => {
    const next = custom.filter((c) => c !== t);
    setCustom(next);
    writeTopics(next);
  };

  const pill = (on) =>
    `inline-flex h-8 max-w-full items-center gap-1 rounded-full border px-3 text-xs font-semibold transition-colors ${
      on ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500 dark:text-neutral-950' : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-white/10 dark:bg-neutral-800 dark:text-stone-200 dark:hover:bg-neutral-700'
    }`;
  const items = result.items.slice(0, LIST_LIMIT);

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card
        title="Newsy giełdowe"
        subtitle="Google News i Yahoo Finance · Twoje spółki i własne tematy"
        icon={Newspaper}
        actions={
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60 dark:border-white/10 dark:bg-neutral-800 dark:text-stone-200 dark:hover:bg-neutral-700"
            title="Odśwież wiadomości"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Odśwież</span>
          </button>
        }
        bodyClassName="p-4 sm:p-5"
      >
        <div className="flex flex-wrap gap-2" role="group" aria-label="Spółki i tematy">
          <button type="button" className={pill(selected === ALL)} aria-pressed={selected === ALL} onClick={() => setSelected(ALL)}>
            Wszystkie moje spółki
          </button>
          {topics.map((t) => (
            <span key={t.id} className="inline-flex max-w-full items-center">
              <button type="button" className={pill(selected === t.id)} aria-pressed={selected === t.id} onClick={() => setSelected(t.id)} title={t.title || t.query}>
                <span className="truncate">{t.label}</span>
              </button>
              {t.custom && (
                <button
                  type="button"
                  onClick={() => removeTopic(t.label)}
                  aria-label={`Usuń temat ${t.label}`}
                  title="Usuń temat"
                  className="-ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                >
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
        <form onSubmit={addTopic} className="mt-3 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={60}
            placeholder="Własny temat, np. WIG20, stopy procentowe, Orlen"
            aria-label="Nowy temat"
            className="h-9 min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 dark:border-white/10 dark:bg-neutral-800"
          />
          <button type="submit" disabled={!draft.trim()} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:text-neutral-950">
            <Plus size={16} /> <span className="hidden sm:inline">Dodaj temat / spółkę</span>
            <span className="sm:hidden">Dodaj</span>
          </button>
        </form>
        {selected === ALL && topics.length > MAX_ALL && <p className="mt-2 text-[11px] text-stone-500 dark:text-stone-400">„Wszystkie” pokazuje wiadomości dla pierwszych {MAX_ALL} tematów – pozostałe wybierz z listy.</p>}
      </Card>

      <section aria-label="Artykuły" aria-busy={loading} className="space-y-2.5">
        {error && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">Nie udało się pobrać wiadomości ({error}). Spróbuj odświeżyć za chwilę.</p>}
        {!error && !loading && topics.length === 0 && <Card><EmptyState icon={Newspaper} title="Brak spółek do śledzenia" description="Dodaj transakcje w portfelu albo wpisz własny temat powyżej." /></Card>}
        {!error && !loading && topics.length > 0 && items.length === 0 && (
          <Card>
            <EmptyState icon={Newspaper} title="Brak wiadomości" description={result.errors.length ? `Źródła chwilowo niedostępne: ${result.errors.slice(0, 2).join('; ')}` : 'Dla tego tematu nie znaleziono artykułów.'} />
          </Card>
        )}
        {loading && !items.length && Array.from({ length: 4 }, (_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-stone-100 dark:bg-white/[0.04]" />)}
        {items.map((it) => (
          <a
            key={it.link}
            href={it.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group block min-w-0 rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/40 dark:border-white/10 dark:bg-neutral-900 dark:hover:border-blue-500/40 dark:hover:bg-blue-500/5"
          >
            <span className="flex items-start gap-2">
              <span className="min-w-0 flex-1 text-sm leading-snug font-semibold break-words text-stone-800 group-hover:text-blue-700 dark:text-stone-100 dark:group-hover:text-blue-300">{it.title}</span>
              <ExternalLink size={14} className="mt-0.5 shrink-0 text-stone-400" aria-hidden="true" />
            </span>
            <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
              <span className="font-medium text-stone-600 dark:text-stone-300">{it.source}</span>
              {it.pubDate && (
                <time dateTime={it.pubDate} title={new Date(it.pubDate).toLocaleString('pl-PL')}>
                  · {timeAgo(it.pubDate)}
                </time>
              )}
              {it.topic && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600 dark:bg-white/[0.06] dark:text-stone-300">{it.topic}</span>}
            </span>
          </a>
        ))}
      </section>
    </div>
  );
}
