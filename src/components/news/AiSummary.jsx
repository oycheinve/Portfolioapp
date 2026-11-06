import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { cachedSummary, requestSummary } from '../../lib/newsAi.js';

const SENTIMENT = {
  pozytywny: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  negatywny: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
  mieszany: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  neutralny: 'bg-stone-100 text-stone-600 dark:bg-white/[0.06] dark:text-stone-300',
};
const DIRECTION = {
  pozytywny: { label: '▲ pozytywny', cls: 'text-emerald-700 dark:text-emerald-300' },
  negatywny: { label: '▼ negatywny', cls: 'text-red-700 dark:text-red-300' },
  neutralny: { label: '• neutralny', cls: 'text-stone-500 dark:text-stone-400' },
  niepewny: { label: '? niepewny', cls: 'text-amber-700 dark:text-amber-300' },
};
const RELEVANCE = {
  bezpośredni: { label: 'Bezpośredni wpływ', cls: 'border-violet-300 bg-violet-50/80 dark:border-violet-400/30 dark:bg-violet-500/10' },
  pośredni: { label: 'Pośredni wpływ', cls: 'border-blue-200 bg-blue-50/70 dark:border-blue-400/25 dark:bg-blue-500/10' },
  brak: { label: 'Brak istotnego wpływu', cls: 'border-stone-200 bg-stone-50 dark:border-white/10 dark:bg-white/[0.03]' },
};

// Wpływ wiadomości na spółki z portfela (gdy podsumowanie powstało z kontekstem portfela)
function PortfolioImpact({ p }) {
  if (!p || (p.relevance === 'brak' && !p.note && !p.affected?.length)) return null;
  const r = RELEVANCE[p.relevance] || RELEVANCE.brak;
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${r.cls}`} aria-label="Wpływ na Twój portfel">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h4 className="text-[11px] font-bold tracking-wide text-violet-700 uppercase dark:text-violet-300">Wpływ na Twój portfel</h4>
        <span className="rounded-md bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold text-stone-700 dark:bg-white/10 dark:text-stone-200">{r.label}</span>
      </div>
      {p.affected?.length > 0 && (
        <ul className="space-y-1.5">
          {p.affected.map((a) => (
            <li key={`${a.ticker}-${a.effect}`} className="flex gap-2">
              <span className="mt-px shrink-0 self-start rounded-md bg-stone-800 px-1.5 py-0.5 text-[10px] font-bold text-white dark:bg-white/15">{a.ticker}</span>
              <span className="min-w-0">
                <span className={`mr-1 text-[11px] font-semibold ${(DIRECTION[a.direction] || DIRECTION.niepewny).cls}`}>{(DIRECTION[a.direction] || DIRECTION.niepewny).label}</span>
                {a.effect}
              </span>
            </li>
          ))}
        </ul>
      )}
      {p.note && <p className={`${p.affected?.length ? 'mt-1.5' : ''} text-[12px] text-stone-600 dark:text-stone-300`}>{p.note}</p>}
    </div>
  );
}

const BASIS = { lead: 'na podstawie zajawki artykułu', headlines: 'na podstawie nagłówków z wczoraj i dziś', title: 'tylko na podstawie tytułu' };

// „Nazwa: wartość (kontekst)” – nazwa pogrubiona dla szybkiego czytania na telefonie
function NumberLine({ text }) {
  const i = text.indexOf(':');
  if (i <= 0 || i > 60) return <>{text}</>;
  return (
    <>
      <strong className="font-semibold text-stone-800 dark:text-stone-100">{text.slice(0, i)}:</strong>
      {text.slice(i + 1)}
    </>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h4 className="mb-1 text-[11px] font-bold tracking-wide text-violet-700 uppercase dark:text-violet-300">{title}</h4>
      {children}
    </div>
  );
}

export function SummaryBody({ value }) {
  const { summary, basis, period, note, via } = value;
  return (
    <div className="space-y-3 text-[13px] leading-relaxed text-stone-700 dark:text-stone-300">
      {basis === 'title' && (
        <p className="rounded-lg border border-amber-200/70 bg-amber-50/70 px-2.5 py-1.5 text-[12px] text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200">
          Treść artykułu niedostępna{note ? ` – ${note}` : ''}. Poniżej skrót z samego tytułu; pełną treść otworzysz w przeglądarce.
        </p>
      )}
      {period?.label && (
        <p className="rounded-lg bg-white/70 px-2.5 py-1.5 text-[12px] font-semibold text-stone-800 dark:bg-white/[0.05] dark:text-stone-100">
          Podsumowanie z okresu: <span className="font-normal text-stone-600 tabular dark:text-stone-300">{period.label}</span>
        </p>
      )}
      <PortfolioImpact p={summary.portfolio} />
      <Section title="Główne wydarzenie">
        <p className="font-medium text-stone-800 dark:text-stone-100">{summary.event}</p>
      </Section>
      {summary.numbers.length > 0 && (
        <Section title="Kluczowe liczby i dane">
          <ul className="space-y-1">
            {summary.numbers.map((n) => (
              <li key={n} className="flex gap-2">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" aria-hidden="true" />
                <span className="min-w-0">
                  <NumberLine text={n} />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {summary.impact.length > 0 && (
        <Section title="Wpływ na spółkę / inwestora">
          <ul className="space-y-1">
            {summary.impact.map((n) => (
              <li key={n} className="flex gap-2">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" aria-hidden="true" />
                <span className="min-w-0">{n}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <p className="flex flex-wrap items-center gap-2 text-[11px] text-stone-400 dark:text-stone-500">
        {summary.sentiment && <span className={`rounded-md px-1.5 py-0.5 font-semibold ${SENTIMENT[summary.sentiment] || SENTIMENT.neutralny}`}>wydźwięk: {summary.sentiment}</span>}
        <span>Podsumowanie AI{BASIS[basis] ? ` ${BASIS[basis]}` : ''}{via ? ` · treść: ${via}` : ''} – sprawdź szczegóły w źródle</span>
      </p>
    </div>
  );
}

// Blok podsumowania: od razu z pamięci (jeśli było), inaczej po kliknięciu; wyraźny stan ładowania i błędu.
// autoLoad – zapytanie od razu po wyświetleniu (rozwinięty artykuł); allowRefresh – przycisk „Odśwież podsumowanie”
// (tylko podsumowanie dnia – treść pojedynczego artykułu się nie zmienia).
export default function AiSummary({ cacheKey, payload, loadingText = 'AI analizuje artykuł…', autoLoad = false, allowRefresh = false, className = '' }) {
  const [state, setState] = useState(() => {
    const hit = cachedSummary(cacheKey);
    return hit ? { status: 'done', value: hit } : { status: 'idle' };
  });
  const payloadRef = useRef(payload);
  payloadRef.current = payload;
  const run = async (force = false) => {
    setState({ status: 'loading' });
    try {
      const p = typeof payloadRef.current === 'function' ? payloadRef.current() : payloadRef.current;
      setState({ status: 'done', value: await requestSummary(cacheKey, p, { force }) });
    } catch (e) {
      setState({ status: 'error', error: e.message });
    }
  };
  useEffect(() => {
    const hit = cachedSummary(cacheKey);
    if (hit) setState({ status: 'done', value: hit });
    else if (autoLoad) run();
    else setState({ status: 'idle' });
  }, [cacheKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`rounded-xl border border-violet-200/70 bg-violet-50/40 p-3 dark:border-violet-400/15 dark:bg-violet-500/[0.05] ${className}`} aria-live="polite" aria-busy={state.status === 'loading'}>
      {state.status === 'idle' && (
        <button type="button" onClick={() => run()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-violet-600 px-3 text-sm font-semibold text-white hover:bg-violet-700 dark:bg-violet-500 dark:text-neutral-950 dark:hover:bg-violet-400">
          <Sparkles size={15} /> Podsumuj z AI
        </button>
      )}
      {state.status === 'loading' && (
        <div className="flex items-center gap-2.5 py-1 text-sm font-medium text-violet-700 dark:text-violet-300" role="status">
          <Loader2 size={18} className="animate-spin" />
          {loadingText}
        </div>
      )}
      {state.status === 'error' && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-red-700 dark:text-red-300" role="alert">
          <AlertCircle size={16} className="shrink-0" />
          <span className="min-w-0 flex-1">{state.error}</span>
          <button type="button" onClick={() => run(true)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 px-2.5 text-xs font-semibold hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10">
            <RefreshCw size={13} /> Spróbuj ponownie
          </button>
        </div>
      )}
      {state.status === 'done' && (
        <>
          <SummaryBody value={state.value} />
          {allowRefresh && <button type="button" onClick={() => run(true)} className="mt-2 inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-stone-500 hover:bg-white/60 dark:text-stone-400 dark:hover:bg-white/5">
            <RefreshCw size={12} /> Odśwież podsumowanie
          </button>}
        </>
      )}
    </div>
  );
}
