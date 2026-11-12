import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ExternalLink, Newspaper, Plus, RefreshCw, Sparkles, X } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { computeHoldings, isoDay } from '../lib/engine.js';
import { GENERAL_KEY, companyQuery, fetchNewsMany, readOff, readTopics, timeAgo, writeOff, writeTopics } from '../lib/news.js';
import { GENERAL_ID, classifyArticle } from '../lib/newsSubject.js';
import { Card, EmptyState } from '../components/ui.jsx';
import AiSummary from '../components/news/AiSummary.jsx';
import { articleKey, digestKey } from '../lib/newsAi.js';
import { portfolioContext, portfolioKey } from '../lib/aiContext.js';
import { aiOn } from '../lib/aiFeatures.js';

const MAX_TOPICS = 15; // najwyżej tyle zaznaczonych tematów pobieranych naraz
const LIST_LIMIT = 60;
const DIGEST_LIMIT = 60;
// Początek wczorajszego dnia (północ czasu lokalnego)
const startOfYesterday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
}; // najwyżej tyle nagłówków z wczoraj i dziś w podsumowaniu dnia
const DIGEST_COLLAPSED_KEY = 'fintrack-news-digest-collapsed';

// Nazwa do wyszukiwania: pełna nazwa spółki bez dopisków typu „S.A.” (trafniejsze wyniki niż sam ticker)
const searchName = (inst) =>
  String(inst.name || inst.ticker || '')
    .replace(/\s+(S\.?A\.?|SA|ASA|AG|NV|PLC|Inc\.?|Ltd\.?)$/i, '')
    .trim();

const TOPICS_OPEN_KEY = 'fintrack-news-topics-open';
// Newsy: pigułki wielokrotnego wyboru (spółki / ETF-y z portfela + własne frazy), wspólna lista artykułów
// zaznaczonych tematów od najnowszych; wybór zapamiętany (lista odznaczonych – nowe tematy domyślnie włączone)
export default function NewsView() {
  const { state } = useApp();
  // Spółki z portfela dla podsumowań AI (wpływ newsa na posiadane aktywa); klucz pamięci zależy od składu portfela
  const aiPortfolio = useMemo(() => portfolioContext(state), [state.trades, state.instruments, state.accounts, state.prices, state.dividendSchedule]); // eslint-disable-line react-hooks/exhaustive-deps
  const aiKeySuffix = aiPortfolio.length ? `|p${portfolioKey(aiPortfolio)}` : '';
  const held = useMemo(() => {
    const ids = new Set(computeHoldings(state, isoDay(new Date()), null).filter((h) => h.quantity > 1e-9).map((h) => h.instrumentId));
    return state.instruments
      .filter((i) => ids.has(i.id))
      .map((i) => {
        const name = searchName(i);
        // Google News: dokładna nazwa spółki + słowa rynkowe (OR) – zob. companyQuery
        return { id: `inst:${i.id}`, label: i.ticker || name, query: companyQuery(name), symbol: i.yahooSymbol || null, title: i.name };
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'pl'));
  }, [state]);
  const [custom, setCustom] = useState(readTopics);
  const topics = useMemo(() => [...held, ...custom.map((t) => ({ id: `custom:${t}`, label: t, query: t, symbol: null, custom: true }))], [held, custom]);
  const [off, setOffState] = useState(() => new Set(readOff()));
  const setOff = (next) => {
    setOffState(next);
    writeOff([...next]);
  };
  const selected = useMemo(() => topics.filter((t) => !off.has(t.id)), [topics, off]);
  const [topicsOpen, setTopicsOpenState] = useState(() => {
    try {
      return localStorage.getItem(TOPICS_OPEN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const setTopicsOpen = (v) => {
    setTopicsOpenState(v);
    try {
      localStorage.setItem(TOPICS_OPEN_KEY, v ? '1' : '0');
    } catch {
      // brak localStorage
    }
  };
  const toggle = (id) => {
    const next = new Set(off);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOff(next);
  };
  const selectAll = () => setOff(new Set());
  const selectNone = () => setOff(new Set(topics.map((t) => t.id)));

  // „Analizy ogólne” – artykuły bez spółki z portfela w tytule (np. komentarze makro analityków XTB)
  const [generalOn, setGeneralOn] = useState(() => {
    try {
      return localStorage.getItem(GENERAL_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleGeneral = () => {
    setGeneralOn((v) => {
      try {
        localStorage.setItem(GENERAL_KEY, v ? '0' : '1');
      } catch {
        // brak localStorage
      }
      return !v;
    });
  };

  const [result, setResult] = useState({ items: [], errors: [] });
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchList = selected.slice(0, MAX_TOPICS);
  const fetchKey = fetchList.map((t) => t.id).join('|');
  const load = useCallback(
    async (force = false) => {
      if (!fetchList.length) {
        setResult({ items: [], errors: [] });
        return;
      }
      setLoading(true);
      try {
        setResult(await fetchNewsMany(fetchList, { force }));
      } finally {
        setLoading(false);
      }
    },
    [fetchKey], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    load(false);
  }, [load]);

  const addTopic = (e) => {
    e.preventDefault();
    const t = draft.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!t) return;
    if (!custom.some((c) => c.toLowerCase() === t.toLowerCase())) {
      const next = [...custom, t];
      setCustom(next);
      writeTopics(next);
    }
    if (off.has(`custom:${t}`)) toggle(`custom:${t}`);
    setDraft('');
    setAdding(false);
  };
  const removeTopic = (t) => {
    const next = custom.filter((c) => c !== t);
    setCustom(next);
    writeTopics(next);
    if (off.has(`custom:${t}`)) {
      const o = new Set(off);
      o.delete(`custom:${t}`);
      setOff(o);
    }
  };

  const pill = (on) =>
    `inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border pl-2 pr-3 text-xs font-semibold transition-colors ${
      on ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500 dark:text-neutral-950' : 'border-stone-200 bg-white text-stone-500 hover:bg-stone-50 dark:border-white/10 dark:bg-neutral-800 dark:text-stone-400 dark:hover:bg-neutral-700'
    }`;
  const smallBtn = 'inline-flex h-7 items-center rounded-md px-2 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-40 dark:text-blue-300 dark:hover:bg-blue-500/10';
  // Główny podmiot artykułu zamiast tematu zapytania: tekst o Orlenie znaleziony przy XTB trafia do Orlenu,
  // analiza makro autorstwa XTB – do „Analiz ogólnych”; frazy własne bez filtrowania
  const classified = useMemo(() => {
    const byId = Object.fromEntries(topics.map((t) => [t.id, t]));
    return result.items.map((it) => {
      if (it.custom) return { ...it, mainId: it.topicId, mentions: [], authorIds: [] };
      return { ...it, ...classifyArticle(it, held) };
    }).map((it) => ({
      ...it,
      tag: it.mainId === GENERAL_ID ? 'Analiza ogólna' : byId[it.mainId]?.label || it.topic,
      also: it.mentions.filter((id) => id !== it.mainId).map((id) => byId[id]?.label).filter(Boolean),
      authors: it.authorIds.filter((id) => id !== it.mainId).map((id) => byId[id]?.label).filter(Boolean),
    }));
  }, [result.items, held, topics]);
  const selectedIds = useMemo(() => new Set(selected.map((t) => t.id)), [selected]);
  const generalCount = classified.filter((it) => it.mainId === GENERAL_ID).length;
  const visible = classified.filter((it) => (it.mainId === GENERAL_ID ? generalOn : selectedIds.has(it.mainId)));
  const items = visible.slice(0, LIST_LIMIT);
  const allErrors = result.errors.length > 0 && result.items.length === 0;
  // Podsumowanie dnia (AI): artykuły z wczoraj i dziś (od północy wczoraj do teraz) z zaznaczonych tematów
  const today = isoDay(new Date());
  const yesterday = isoDay(new Date(Date.now() - 86400000));
  const dayItems = useMemo(() => {
    const from = startOfYesterday().getTime();
    return visible.filter((it) => it.pubDate && new Date(it.pubDate).getTime() >= from).slice(0, DIGEST_LIMIT);
  }, [visible, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const fmtDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('pl-PL', { day: 'numeric', month: 'numeric', year: 'numeric' });
  const [aiOpen, setAiOpen] = useState(() => new Set());
  // Zwinięte podsumowanie dnia – wybór zapamiętany w przeglądarce
  const [digestCollapsed, setDigestCollapsed] = useState(() => {
    try {
      return localStorage.getItem(DIGEST_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleDigest = () =>
    setDigestCollapsed((v) => {
      try {
        localStorage.setItem(DIGEST_COLLAPSED_KEY, v ? '0' : '1');
      } catch {
        // brak localStorage – tylko do końca sesji
      }
      return !v;
    });
  const toggleAi = (link) =>
    setAiOpen((prev) => {
      const next = new Set(prev);
      if (next.has(link)) next.delete(link);
      else next.add(link);
      return next;
    });

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="min-w-0 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm sm:p-4 dark:border-white/10 dark:bg-neutral-900">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600 dark:bg-white/5 dark:text-stone-300">
            <Newspaper size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">Newsy</h2>
            {/* Pasek spółek zwijany – domyślnie ukryty, wybór zapamiętany */}
            <button type="button" onClick={() => setTopicsOpen(!topicsOpen)} aria-expanded={topicsOpen} aria-controls="news-topics" className="inline-flex max-w-full items-center gap-1 truncate text-xs font-medium text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100">
              Spółki i frazy: {selected.length} z {topics.length}
              <ChevronDown size={14} className={`shrink-0 transition-transform ${topicsOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading || !fetchList.length}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60 dark:border-white/10 dark:bg-neutral-800 dark:text-stone-200 dark:hover:bg-neutral-700"
            title="Odśwież wiadomości"
            aria-label="Odśwież wiadomości"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Odśwież</span>
          </button>
        </div>
        {topicsOpen && (
        <div id="news-topics" className="mt-3">
        <div className="mb-2 flex flex-wrap items-center gap-1">
          <button type="button" className={smallBtn} onClick={selectAll} disabled={!off.size || !topics.length}>
            Zaznacz wszystkie
          </button>
          <button type="button" className={smallBtn} onClick={selectNone} disabled={!selected.length}>
            Odznacz wszystkie
          </button>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Obserwowane spółki i frazy">
          {topics.map((t) => {
            const on = !off.has(t.id);
            return (
              <span key={t.id} className="inline-flex max-w-full items-center">
                <button type="button" className={pill(on)} aria-pressed={on} onClick={() => toggle(t.id)} title={t.title || t.query}>
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border ${on ? 'border-white/80 bg-white/20 dark:border-neutral-900/50' : 'border-stone-300 dark:border-white/20'}`}
                    aria-hidden="true"
                  >
                    {on && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="truncate">{t.label}</span>
                </button>
                {t.custom && (
                  <button
                    type="button"
                    onClick={() => removeTopic(t.label)}
                    aria-label={`Usuń frazę ${t.label}`}
                    title="Usuń frazę"
                    className="-ml-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                  >
                    <X size={12} />
                  </button>
                )}
              </span>
            );
          })}
          {held.length > 0 && (
            <button type="button" className={pill(generalOn)} aria-pressed={generalOn} onClick={toggleGeneral} title="Artykuły bez konkretnej spółki z portfela w tytule – np. komentarze makro analityków XTB">
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border ${generalOn ? 'border-white/80 bg-white/20 dark:border-neutral-900/50' : 'border-stone-300 dark:border-white/20'}`} aria-hidden="true">
                {generalOn && <Check size={11} strokeWidth={3} />}
              </span>
              <span className="truncate">Analizy ogólne{generalCount ? ` (${generalCount})` : ''}</span>
            </button>
          )}
          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-stone-300 px-3 text-xs font-semibold text-stone-600 hover:bg-stone-50 dark:border-white/20 dark:text-stone-300 dark:hover:bg-white/5"
            >
              <Plus size={14} /> Własna spółka / fraza
            </button>
          )}
        </div>
        {adding && (
          <form onSubmit={addTopic} className="mt-3 flex gap-2">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
              maxLength={60}
              placeholder="np. Grupa Kęty, WIG20, stopy procentowe"
              aria-label="Własna spółka lub fraza"
              className="h-9 min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 dark:border-white/10 dark:bg-neutral-800"
            />
            <button type="submit" disabled={!draft.trim()} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:text-neutral-950">
              <Plus size={16} /> Dodaj
            </button>
            <button type="button" onClick={() => setAdding(false)} aria-label="Anuluj" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-white/5">
              <X size={16} />
            </button>
          </form>
        )}
        {selected.length > MAX_TOPICS && <p className="mt-2 text-[11px] text-stone-500 dark:text-stone-400">Pobierane są wiadomości dla pierwszych {MAX_TOPICS} zaznaczonych tematów – odznacz część, aby zobaczyć pozostałe.</p>}
        <p className="mt-2 text-[11px] text-stone-400">Źródła: Google News i Yahoo Finance</p>
        </div>
        )}
      </section>

      <section aria-label="Artykuły" aria-busy={loading} className="space-y-2.5">
        {!loading && topics.length === 0 && (
          <Card>
            <EmptyState icon={Newspaper} title="Brak spółek do obserwowania" description="Dodaj transakcje w portfelu albo własną frazę przyciskiem „+ Własna spółka / fraza”." />
          </Card>
        )}
        {!loading && topics.length > 0 && selected.length === 0 && (
          <Card>
            <EmptyState icon={Newspaper} title="Nic nie jest zaznaczone" description="Kliknij pigułki spółek albo „Zaznacz wszystkie”, aby zobaczyć wiadomości." />
          </Card>
        )}
        {!loading && selected.length > 0 && items.length === 0 && (
          <Card>
            <EmptyState
              icon={Newspaper}
              title={allErrors ? 'Nie udało się pobrać wiadomości' : 'Brak wiadomości'}
              description={allErrors ? `Źródła chwilowo niedostępne (${result.errors.slice(0, 2).join('; ')}). Spróbuj odświeżyć za chwilę.` : 'Dla zaznaczonych tematów nie znaleziono artykułów.'}
            />
          </Card>
        )}
        {!loading && dayItems.length > 0 && aiOn(state.settings, 'newsSummary') && (
          <section aria-label="Podsumowanie dnia" className="min-w-0 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
            <button
              type="button"
              onClick={toggleDigest}
              aria-expanded={!digestCollapsed}
              aria-controls="news-digest-body"
              className={`-m-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2.5 rounded-xl p-1.5 text-left transition-colors hover:bg-stone-50 dark:hover:bg-white/[0.03] ${digestCollapsed ? '' : 'mb-1'}`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                <Sparkles size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold">Podsumowanie dnia (AI)</h2>
                <p className="truncate text-xs text-stone-500 dark:text-stone-400">
                  {dayItems.length} {dayItems.length === 1 ? 'artykuł' : dayItems.length % 10 >= 2 && dayItems.length % 10 <= 4 && (dayItems.length % 100 < 12 || dayItems.length % 100 > 14) ? 'artykuły' : 'artykułów'} · wczoraj i dziś ({fmtDay(yesterday)} – {fmtDay(today)})
                </p>
              </div>
              <span className="shrink-0 text-[11px] font-medium text-stone-400 dark:text-stone-500">{digestCollapsed ? 'Pokaż' : 'Zwiń'}</span>
              <ChevronDown size={18} className={`shrink-0 text-stone-400 transition-transform duration-300 ${digestCollapsed ? '' : 'rotate-180'}`} aria-hidden="true" />
            </button>
            {/* Zwinięte – ukryte, ale zamontowane: wynik i trwające zapytanie zostają */}
            <div id="news-digest-body" hidden={digestCollapsed} className="mt-1.5">
              <AiSummary
                allowRefresh
                cacheKey={`${digestKey(today, dayItems)}${aiKeySuffix}`}
                payload={() => ({
                  mode: 'digest',
                  portfolio: aiPortfolio,
                  label: 'wczoraj i dziś',
                  period: { from: startOfYesterday().toISOString(), to: new Date().toISOString() },
                  items: dayItems.map((it) => ({ title: it.title, source: it.source, pubDate: it.pubDate, topic: it.tag })),
                })}
                loadingText="AI analizuje wiadomości dnia…"
              />
            </div>
          </section>
        )}
        {loading && !items.length && Array.from({ length: 4 }, (_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-stone-100 dark:bg-white/[0.04]" />)}
        {items.map((it) => (
          <article key={it.link} className="min-w-0 rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-neutral-900">
            <div className="mb-1.5 flex items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold ${it.mainId === GENERAL_ID ? 'bg-stone-100 text-stone-600 dark:bg-white/[0.06] dark:text-stone-300' : 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'}`}>{it.tag}</span>
                {it.also.map((l) => (
                  <span key={l} className="inline-block rounded-md border border-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:border-blue-500/20 dark:text-blue-300">
                    {l}
                  </span>
                ))}
              </div>
              {/* Dyskretny znaczek AI w prawym górnym rogu karty – rozwija / generuje podsumowanie artykułu */}
              {aiOn(state.settings, 'newsSummary') && (
              <button
                type="button"
                onClick={() => toggleAi(it.link)}
                aria-expanded={aiOpen.has(it.link)}
                aria-label={aiOpen.has(it.link) ? 'Ukryj podsumowanie AI' : 'Podsumowanie AI'}
                title={aiOpen.has(it.link) ? 'Ukryj podsumowanie AI' : 'Podsumowanie AI'}
                className={`-mt-0.5 -mr-1 inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-bold transition-colors ${
                  aiOpen.has(it.link)
                    ? 'bg-violet-600 text-white dark:bg-violet-500 dark:text-neutral-950'
                    : 'bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20'
                }`}
              >
                <Sparkles size={12} aria-hidden="true" /> AI
              </button>
              )}
            </div>
            <a href={it.link} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-2">
              <span className="min-w-0 flex-1 text-sm leading-snug font-semibold break-words text-stone-800 group-hover:text-blue-700 group-hover:underline dark:text-stone-100 dark:group-hover:text-blue-300">{it.title}</span>
              <ExternalLink size={14} className="mt-0.5 shrink-0 text-stone-400" aria-hidden="true" />
            </a>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
              <span className="font-medium text-stone-600 dark:text-stone-300">{it.source}</span>
              {it.authors.length > 0 && <span title="Spółka jest tu autorem / źródłem komentarza, nie tematem artykułu">· autor: {it.authors.join(', ')}</span>}
              {it.pubDate && (
                <time dateTime={it.pubDate} title={new Date(it.pubDate).toLocaleString('pl-PL')}>
                  · {timeAgo(it.pubDate)}
                </time>
              )}
            </p>
            {aiOpen.has(it.link) && aiOn(state.settings, 'newsSummary') && (
              <AiSummary
                className="mt-2"
                autoLoad
                cacheKey={`${articleKey(it.link)}${aiKeySuffix}`}
                payload={{ mode: 'article', link: it.link, title: it.title, source: it.source, pubDate: it.pubDate, topic: it.tag, portfolio: aiPortfolio }}
              />
            )}
          </article>
        ))}
        {result.errors.length > 0 && result.items.length > 0 && <p className="px-1 text-[11px] text-stone-400">Część źródeł nie odpowiedziała: {result.errors.slice(0, 2).join('; ')}</p>}
      </section>
    </div>
  );
}
