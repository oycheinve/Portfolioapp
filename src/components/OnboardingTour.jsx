import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, GraduationCap, X } from 'lucide-react';

// Samouczek (przewodnik po aplikacji): po pierwszym wejściu (po zalogowaniu albo „Kontynuuj jako gość”) pytanie,
// czy pokazać samouczek. „Tak” – kolejne kroki: przejście do danego ekranu, podświetlenie miejsca (płynnie
// przesuwająca się „latarka”) i karta z opisem, postępem i przyciskami Wstecz / Dalej / Pomiń. „Nie” – Pulpit.
// Zapis wyboru per użytkownik (`wealth-app-tour-v1`, urządzenie + chmura) – pytanie pojawia się raz; ponownie:
// Ustawienia → Aplikacja i dane → Samouczek (zdarzenie `fintrack-start-tour`).
export const TOUR_KEY = 'wealth-app-tour-v1';
export const START_TOUR_EVENT = 'fintrack-start-tour';

const STEPS = [
  {
    view: 'dashboard',
    emoji: '👋',
    title: 'Witaj w FinTrack!',
    text: 'Portfel inwestycyjny, budżet, zakupy, zadania i newsy w jednym miejscu. W minutę pokażę Ci, gdzie co jest i jak z tego korzystać.',
  },
  {
    view: 'dashboard',
    target: ['nav-dashboard'],
    emoji: '📊',
    title: 'Pulpit – Twój majątek w skrócie',
    text: 'Wartość całego majątku, zmiana dnia i zysk, struktura portfela na wykresie, najbliższe dywidendy i cele. To ekran startowy – zawsze tu wrócisz jednym dotknięciem.',
  },
  {
    view: 'portfolio',
    target: ['nav-portfolio'],
    emoji: '💼',
    title: 'Portfel',
    text: 'Wszystkie walory z zyskiem, stopą zwrotu i zmianą dnia. „Filtruj portfel” wybiera kategorie i konta (zapamiętuje wybór). Na dole: Przegląd tygodnia od AI i Analityk wyników spółek – wklejasz wyniki albo raport PDF, a AI porównuje je z konsensusem i historią.',
  },
  {
    view: 'shopping',
    target: ['tour-shopping-add', 'nav-shopping'],
    emoji: '🛒',
    title: 'Zakupy',
    text: 'Dopisz produkt i ilość – w sztukach albo w kg / g. Produkty same układają się w kategorie sklepowe, a przy każdym widać szacowaną cenę z Twoich paragonów (albo od AI) i sumę całej listy.',
  },
  {
    view: 'budget',
    target: ['nav-budget'],
    emoji: '🧾',
    title: 'Budżet',
    text: 'Plan na miesiąc w kategoriach i to, ile już wydano. „Dodaj zakup” dopisuje wydatek, „Skanuj paragon” odczytuje paragon ze zdjęcia i rozkłada go na kategorie. Kafelek „Na co dzień” podpowiada, ile możesz wydawać dziennie, a na początku miesiąca AI podsumuje poprzedni.',
  },
  {
    view: 'tasks',
    target: ['nav-tasks'],
    emoji: '✅',
    title: 'Zadania',
    text: 'Zadania na dziś, tydzień i miesiąc oraz nawyki z passą (jeden opuszczony dzień jej nie zeruje). Wieczorem możesz dostać przypomnienie o tym, co zostało.',
  },
  {
    view: 'news',
    target: ['nav-news'],
    emoji: '📰',
    title: 'Newsy',
    text: 'Wiadomości o spółkach z Twojego portfela – bez szumu (promocje, gazetki są odfiltrowane). AI streści najważniejsze artykuły i cały dzień.',
  },
  {
    view: 'dashboard',
    target: ['nav-more', 'nav-charts'],
    emoji: '🧭',
    title: 'Więcej',
    text: 'Tu są pozostałe moduły: Wykresy, Dywidendy (kalendarz i prognoza), Cele i kamienie milowe, Poduszka finansowa (obligacje, oszczędności, PPK), Surowce i krypto oraz Symulacje i kalkulatory.',
  },
  {
    view: 'settings',
    target: ['nav-settings'],
    emoji: '⚙️',
    title: 'Ustawienia',
    text: 'Konta i import historii (np. z XTB), profile spółek dla Analityka, powiadomienia, włączanie funkcji AI i Zużycie AI z limitami, wygląd, konto w chmurze i kopia zapasowa.',
  },
  {
    view: 'dashboard',
    emoji: '🎉',
    title: 'Gotowe!',
    text: 'Zacznij od dodania kont i transakcji (albo importu w Ustawieniach) i planu budżetu. Samouczek uruchomisz ponownie w Ustawieniach → Aplikacja i dane → Samouczek.',
  },
];

const readTour = () => {
  try {
    return JSON.parse(localStorage.getItem(TOUR_KEY) || 'null');
  } catch {
    return null;
  }
};
const saveTour = (status) => {
  try {
    localStorage.setItem(TOUR_KEY, JSON.stringify({ status, at: new Date().toISOString() }));
    window.dispatchEvent(new CustomEvent('wealth-app-prefs-changed', { detail: { key: TOUR_KEY } }));
  } catch {
    // brak localStorage – pytanie może pojawić się ponownie
  }
};
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// Widoczny element o danym data-tour (np. pasek boczny na komputerze albo dolny pasek na telefonie)
const findTarget = (ids = []) => {
  for (const id of ids) {
    for (const el of document.querySelectorAll(`[data-tour="${id}"]`)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
};

export default function OnboardingTour({ onNavigate }) {
  const [phase, setPhase] = useState(() => (readTour() ? 'off' : 'ask')); // ask | tour | off
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);
  const [visible, setVisible] = useState(false); // płynne pojawianie się karty
  const cardRef = useRef(null);
  const s = STEPS[step];

  useEffect(() => {
    const start = () => {
      setStep(0);
      setPhase('tour');
    };
    window.addEventListener(START_TOUR_EVENT, start);
    return () => window.removeEventListener(START_TOUR_EVENT, start);
  }, []);
  useEffect(() => {
    if (phase === 'off') return undefined;
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, [phase]);

  // Krok: przejście do ekranu, odszukanie podświetlanego miejsca (po wyrenderowaniu widoku)
  const measure = useCallback(() => {
    const el = s?.target ? findTarget(s.target) : null;
    if (!el) return setRect(null);
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    return undefined;
  }, [s]);
  useLayoutEffect(() => {
    if (phase !== 'tour' || !s) return undefined;
    onNavigate?.(s.view);
    let tries = 0;
    let raf = 0;
    const seek = () => {
      const el = s.target ? findTarget(s.target) : null;
      if (el || tries > 40) {
        if (el && el.getBoundingClientRect().bottom > window.innerHeight) el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
        setTimeout(measure, el ? 250 : 0);
        return;
      }
      tries += 1;
      raf = requestAnimationFrame(seek);
    };
    raf = requestAnimationFrame(seek);
    return () => cancelAnimationFrame(raf);
  }, [phase, step]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (phase !== 'tour') return undefined;
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [phase, measure]);
  // Klawiatura: strzałki, Esc
  useEffect(() => {
    if (phase !== 'tour') return undefined;
    const on = (e) => {
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') back();
      else if (e.key === 'Escape') finish('skipped');
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = (status) => {
    saveTour(status);
    setVisible(false);
    setTimeout(() => {
      setPhase('off');
      setRect(null);
      onNavigate?.('dashboard');
    }, reducedMotion() ? 0 : 220);
  };
  const go = (n) => {
    setVisible(false); // karta znika, „latarka” przesuwa się, karta wraca na nowym miejscu
    setTimeout(() => {
      setStep(n);
      setVisible(true);
    }, reducedMotion() ? 0 : 180);
  };
  const next = () => (step < STEPS.length - 1 ? go(step + 1) : finish('done'));
  const back = () => step > 0 && go(step - 1);

  if (phase === 'off') return null;
  const fade = `transition-all duration-300 ease-out motion-reduce:transition-none ${visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-[0.98]'}`;

  if (phase === 'ask') {
    return (
      <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px] transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`} role="dialog" aria-modal="true" aria-labelledby="tour-ask-title">
        <div className={`w-full max-w-sm rounded-2xl bg-white p-5 text-center shadow-2xl dark:bg-neutral-900 ${fade}`}>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
            <GraduationCap size={24} />
          </div>
          <h2 id="tour-ask-title" className="mt-3 text-lg font-semibold">
            Chcesz krótki samouczek?
          </h2>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">Ok. 1 minuta – pokażę Ci wszystkie moduły aplikacji i jak z nich korzystać.</p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              autoFocus
              onClick={() => {
                setVisible(false);
                setTimeout(() => {
                  setStep(0);
                  setPhase('tour');
                }, reducedMotion() ? 0 : 200);
              }}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:text-neutral-950"
            >
              Tak, pokaż mi <ArrowRight size={16} />
            </button>
            <button type="button" onClick={() => finish('skipped')} className="h-10 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-white/5">
              Nie, dziękuję
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Karta: pod podświetlonym miejscem albo nad nim (dolny pasek na telefonie); bez miejsca – na środku
  const pad = 6;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 400;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const cardW = Math.min(360, vw - 32);
  let cardStyle = { width: cardW, left: (vw - cardW) / 2, top: Math.max(16, vh / 2 - 150) };
  if (rect) {
    const below = rect.top + rect.height + pad + 12;
    const placeBelow = below + 230 < vh;
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - cardW / 2), vw - cardW - 16);
    // pasek boczny (komputer): karta obok elementu
    if (rect.left < 280 && rect.width < 280 && vw >= 768) cardStyle = { width: cardW, left: rect.left + rect.width + 20, top: Math.min(Math.max(16, rect.top - 40), vh - 260) };
    else cardStyle = placeBelow ? { width: cardW, left, top: below } : { width: cardW, left, bottom: vh - rect.top + pad + 12 };
  }

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label={`Samouczek: ${s.title}`}>
      {/* Przyciemnienie z „latarką” – płynne przejście pozycji między krokami */}
      {rect ? (
        <div
          className="pointer-events-none fixed rounded-xl ring-2 ring-blue-400/80 transition-all duration-500 ease-in-out motion-reduce:transition-none"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }}
        />
      ) : (
        <div className="fixed inset-0 bg-black/55 transition-opacity duration-500" />
      )}
      <div ref={cardRef} className={`fixed rounded-2xl bg-white p-4 shadow-2xl dark:bg-neutral-900 ${fade}`} style={cardStyle}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-2xl leading-none" aria-hidden="true">
              {s.emoji}
            </span>
            <h2 className="text-base font-semibold">{s.title}</h2>
          </div>
          <button type="button" onClick={() => finish('skipped')} className="-mt-1 -mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 dark:hover:bg-white/5" aria-label="Zakończ samouczek">
            <X size={16} />
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">{s.text}</p>
        {/* Postęp */}
        <div className="mt-3 flex items-center gap-1" aria-label={`Krok ${step + 1} z ${STEPS.length}`}>
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-5 bg-blue-600 dark:bg-blue-400' : i < step ? 'w-1.5 bg-blue-300 dark:bg-blue-500/50' : 'w-1.5 bg-stone-200 dark:bg-white/15'}`} />
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" onClick={() => (step > 0 ? back() : finish('skipped'))} className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-white/5">
            {step > 0 ? (
              <>
                <ArrowLeft size={15} /> Wstecz
              </>
            ) : (
              'Pomiń'
            )}
          </button>
          <button type="button" autoFocus onClick={next} className="inline-flex h-9 items-center gap-1 rounded-lg bg-blue-600 px-3.5 text-sm font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:text-neutral-950">
            {step < STEPS.length - 1 ? (
              <>
                Dalej <ArrowRight size={15} />
              </>
            ) : (
              <>
                <Check size={15} /> Zaczynamy
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
