import { useMemo, useState } from 'react';
import { ChevronDown, Plus, Trash2, Wand2 } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { MAX_PROFILE_TEXT, hasContent, makeProfile, parseKpis, readProfiles, writeProfiles } from '../../lib/companyProfiles.js';
import { companyKey, companyPeriods, readHistory } from '../../lib/earnings.js';
import { Card, Field, Input } from '../ui.jsx';

const area = 'w-full min-w-0 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 dark:border-white/10 dark:bg-neutral-800';

// Ustawienia → Profile spółek: opis, profil i notatki do spółek (kontekst biznesowy dla Analityka wyników).
// Każda spółka zwinięta w jednym wierszu; rozwinięcie pokazuje pola edycji (zapis od razu).
export default function CompanyProfilesCard() {
  const { state } = useApp();
  const [list, setList] = useState(readProfiles);
  const [open, setOpen] = useState(null);
  const [draft, setDraft] = useState('');
  const save = (next) => {
    setList(next);
    writeProfiles(next);
  };
  // Nazwy wskaźników z historii Analityka dla danej spółki – podpowiedzi do pola KPI
  const hist = useMemo(readHistory, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const metricsOf = (p) => {
    const h = hist[companyKey({ ticker: p.ticker })] || hist[companyKey({ company: p.name })];
    const count = {};
    for (const per of h ? companyPeriods(h) : []) for (const n of Object.keys(per.metrics || {})) count[n] = (count[n] || 0) + 1;
    return Object.entries(count)
      .sort((a, b) => b[1] - a[1])
      .map(([n]) => n);
  };
  const update = (id, patch) => save(list.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p)));
  // Spółki z portfela (akcje, które masz) jeszcze bez profilu – szybkie dodanie
  const held = useMemo(() => {
    const have = new Set(list.map((p) => p.ticker));
    return (state.instruments || []).filter((i) => i.ticker && i.kind === 'STOCK' && !have.has(String(i.ticker).toUpperCase()));
  }, [state.instruments, list]);
  const add = (e) => {
    e?.preventDefault();
    const t = draft.trim();
    if (!t) return;
    const inst = (state.instruments || []).find((i) => String(i.ticker || '').toUpperCase() === t.toUpperCase() || String(i.name || '').toLowerCase() === t.toLowerCase());
    const p = { ...makeProfile(inst ? { ticker: inst.ticker, name: inst.name } : /^[A-Z0-9.]{1,8}$/i.test(t) ? { ticker: t } : { name: t }), industry: inst?.sector || '' };
    save([...list, p]);
    setOpen(p.id);
    setDraft('');
  };
  const addHeld = () => {
    const next = [...list, ...held.map((i) => ({ ...makeProfile({ ticker: i.ticker, name: i.name }), industry: i.sector || '' }))];
    save(next);
  };
  return (
    <Card title="Profile spółek" subtitle="Opis działalności, profil i notatki – kontekst dla Analityka wyników" icon={Wand2}>
      <p className="mb-3 text-[12px] text-stone-500 dark:text-stone-400">
        Wklej opis spółki (segmenty, model biznesowy), wybierz kluczowe wskaźniki (KPI) i dopisz notatki (teza inwestycyjna, na co patrzeć). Analityk wyników skupia na profilu omówienie AI i ocenę względem Twojej tezy, a Twoje KPI oznacza ★ i zbiera na dodatkowych wykresach – wszystkie pozostałe wyniki są nadal pokazywane. Liczby zawsze pochodzą z Twoich materiałów.
      </p>
      <form onSubmit={add} className="flex gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} list="profile-tickers" placeholder="Ticker lub nazwa, np. PKO, Grupa Kęty" aria-label="Nowa spółka – ticker lub nazwa" />
        <datalist id="profile-tickers">
          {(state.instruments || []).map((i) => (
            <option key={i.id} value={i.ticker || i.name} />
          ))}
        </datalist>
        <button type="submit" disabled={!draft.trim()} className="inline-flex h-10 shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:text-neutral-950">
          <Plus size={16} /> Dodaj
        </button>
      </form>
      {held.length > 0 && (
        <button type="button" onClick={addHeld} className="mt-2 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
          + Dodaj spółki z portfela bez profilu ({held.map((i) => i.ticker).join(', ')})
        </button>
      )}
      <ul className="mt-3 divide-y divide-stone-100 rounded-xl border border-stone-200 dark:divide-white/5 dark:border-white/10" aria-label="Profile spółek">
        {list.length === 0 && <li className="px-3 py-4 text-center text-sm text-stone-500">Brak profili – dodaj spółkę powyżej.</li>}
        {list.map((p) => {
          const isOpen = open === p.id;
          return (
            <li key={p.id}>
              <button type="button" onClick={() => setOpen(isOpen ? null : p.id)} aria-expanded={isOpen} className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-stone-50 dark:hover:bg-white/[0.03]">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {p.ticker || p.name}
                  {p.ticker && p.name ? <span className="font-normal text-stone-400"> · {p.name}</span> : null}
                </span>
                <span className={`shrink-0 text-[11px] ${hasContent(p) ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-400'}`}>{hasContent(p) ? 'uzupełniony' : p.industry ? 'tylko branża' : 'pusty'}</span>
                <ChevronDown size={16} className={`shrink-0 text-stone-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="space-y-3 border-t border-stone-100 bg-stone-50/50 px-3 py-3 dark:border-white/5 dark:bg-white/[0.015]">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Ticker">
                      <Input value={p.ticker} onChange={(e) => update(p.id, { ticker: e.target.value.toUpperCase().slice(0, 16) })} aria-label={`Ticker – ${p.ticker || p.name}`} />
                    </Field>
                    <Field label="Nazwa">
                      <Input value={p.name} onChange={(e) => update(p.id, { name: e.target.value.slice(0, 80) })} aria-label={`Nazwa – ${p.ticker || p.name}`} />
                    </Field>
                  </div>
                  <Field label="Branża">
                    <Input value={p.industry || ''} onChange={(e) => update(p.id, { industry: e.target.value.slice(0, 80) })} placeholder="np. bank, handel detaliczny, produkcja aluminium" aria-label={`Branża – ${p.ticker || p.name}`} />
                  </Field>
                  <Field label="Opis i profil działalności" hint={`${(p.profile || '').length} / ${MAX_PROFILE_TEXT} znaków`}>
                    <textarea rows={5} maxLength={MAX_PROFILE_TEXT} value={p.profile || ''} onChange={(e) => update(p.id, { profile: e.target.value })} placeholder="Segmenty, źródła przychodów, model biznesowy, sezonowość, kluczowe wskaźniki branży…" aria-label={`Profil – ${p.ticker || p.name}`} className={area} />
                  </Field>
                  <Field label="Kluczowe wskaźniki (KPI)" hint="Po przecinku, w kolejności ważności – AI skupi na nich omówienie, a w tabelach i wykresach oznaczy je ★ (pozostałe wyniki zostają)">
                    <Input value={p.kpis || ''} onChange={(e) => update(p.id, { kpis: e.target.value.slice(0, 600) })} placeholder="np. Marża EBITDA, Przychody LFL, Dług netto / EBITDA" aria-label={`KPI – ${p.ticker || p.name}`} />
                  </Field>
                  {(() => {
                    const have = new Set(parseKpis(p.kpis).map((k) => k.toLowerCase()));
                    const sug = metricsOf(p).filter((n) => !have.has(n.toLowerCase())).slice(0, 14);
                    return sug.length ? (
                      <div className="-mt-1 flex flex-wrap gap-1.5" aria-label="Podpowiedzi KPI z historii spółki">
                        {sug.map((n) => (
                          <button key={n} type="button" onClick={() => update(p.id, { kpis: [...parseKpis(p.kpis), n].join(', ') })} className="rounded-full border border-stone-200 px-2 py-0.5 text-[11px] text-stone-600 hover:border-blue-400 hover:text-blue-700 dark:border-white/10 dark:text-stone-300">
                            + {n}
                          </button>
                        ))}
                      </div>
                    ) : null;
                  })()}
                  <Field label="Moje notatki" hint={`${(p.notes || '').length} / ${MAX_PROFILE_TEXT} znaków`}>
                    <textarea rows={3} maxLength={MAX_PROFILE_TEXT} value={p.notes || ''} onChange={(e) => update(p.id, { notes: e.target.value })} placeholder="Teza inwestycyjna, ryzyka, na co patrzeć w kolejnych wynikach…" aria-label={`Notatki – ${p.ticker || p.name}`} className={area} />
                  </Field>
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm(`Usunąć profil ${p.ticker || p.name}?`)) return;
                      save(list.filter((x) => x.id !== p.id));
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-red-600 dark:text-stone-400"
                  >
                    <Trash2 size={13} /> Usuń profil
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-stone-400">Zapis na Twoim koncie (urządzenie i chmura) – bez limitu liczby spółek.</p>
    </Card>
  );
}
