import { useMemo, useState } from 'react';
import { ArrowRightLeft, BookOpen, Hash, Link2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { formatDate, formatNumber, formatPLN, todayISO } from '../lib/format.js';
import { Badge, Button, Card, EmptyState, Field, IconButton, Input, Modal, Select } from '../components/ui.jsx';

const SUGGESTED_TAGS = ['#zakup', '#sprzedaż', '#strategia', '#emocje', '#rebalancing', '#dywidenda', '#podatki', '#lekcja'];

function normalizeTag(t) {
  const clean = t.trim().toLowerCase().replace(/\s+/g, '-');
  if (!clean) return '';
  return clean.startsWith('#') ? clean : `#${clean}`;
}

function tradeLabel(t, instById, accById) {
  const inst = instById[t.instrumentId];
  return `${formatDate(t.date)} · ${t.side === 'BUY' ? 'Kupno' : 'Sprzedaż'} ${inst?.ticker || '?'} ${formatNumber(t.quantity, 4)} szt. · ${accById[t.accountId]?.name || ''}`;
}

const emptyEntry = () => ({ date: todayISO(), title: '', instrumentId: '', accountId: '', tradeId: '', tags: [], body: '' });

export default function JournalView() {
  const { state, actions } = useApp();
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState(null);
  const [instFilter, setInstFilter] = useState('');
  const [form, setForm] = useState(null);
  const [tagInput, setTagInput] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  const instById = useMemo(() => Object.fromEntries(state.instruments.map((i) => [i.id, i])), [state.instruments]);
  const accById = useMemo(() => Object.fromEntries(state.accounts.map((a) => [a.id, a])), [state.accounts]);
  const tradeById = useMemo(() => Object.fromEntries(state.trades.map((t) => [t.id, t])), [state.trades]);
  const trades = useMemo(() => [...state.trades].sort((a, b) => (a.date < b.date ? 1 : -1)), [state.trades]);

  const tagCounts = useMemo(() => {
    const m = new Map();
    for (const e of state.journal) for (const t of e.tags || []) m.set(t, (m.get(t) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [state.journal]);

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...state.journal]
      .filter((e) => !tagFilter || (e.tags || []).includes(tagFilter))
      .filter((e) => !instFilter || e.instrumentId === instFilter)
      .filter((e) => {
        if (!q) return true;
        const hay = [e.title, e.body, ...(e.tags || []), instById[e.instrumentId]?.ticker, instById[e.instrumentId]?.name, accById[e.accountId]?.name].join(' ').toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [state.journal, query, tagFilter, instFilter, instById, accById]);

  const addTag = (raw) => {
    const t = normalizeTag(raw);
    if (!t || form.tags.includes(t)) return;
    setForm({ ...form, tags: [...form.tags, t] });
    setTagInput('');
  };

  const linkTrade = (id) => {
    const t = tradeById[id];
    if (!t) {
      setForm({ ...form, tradeId: '' });
      return;
    }
    const sideTag = t.side === 'BUY' ? '#zakup' : '#sprzedaż';
    setForm({
      ...form,
      tradeId: id,
      instrumentId: t.instrumentId,
      accountId: t.accountId,
      date: form.title ? form.date : t.date,
      tags: form.tags.includes(sideTag) ? form.tags : [...form.tags, sideTag],
    });
  };

  const save = () => {
    const pending = normalizeTag(tagInput);
    const tags = pending && !form.tags.includes(pending) ? [...form.tags, pending] : form.tags;
    actions.upsert('journal', { ...form, title: form.title.trim(), body: form.body.trim(), tags });
    actions.notify(form.id ? 'Zapisano wpis' : 'Dodano wpis do dziennika', 'success');
    setForm(null);
    setTagInput('');
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card
        title="Dziennik decyzji inwestycyjnych"
        subtitle={`${state.journal.length} wpisów · zapisuj, dlaczego podejmujesz decyzje – i ucz się na nich`}
        icon={BookOpen}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setForm(emptyEntry())}>
            Nowy wpis
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Szukaj w tytułach, treści, tagach…" className="pl-8" aria-label="Szukaj w dzienniku" />
          </div>
          <Select value={instFilter} onChange={(e) => setInstFilter(e.target.value)} className="w-auto" aria-label="Filtr instrumentu">
            <option value="">Wszystkie instrumenty</option>
            {state.instruments.map((i) => (
              <option key={i.id} value={i.id}>
                {i.ticker}
              </option>
            ))}
          </Select>
        </div>
        {tagCounts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tagCounts.map(([t, n]) => (
              <button
                key={t}
                type="button"
                onClick={() => setTagFilter(tagFilter === t ? null : t)}
                aria-pressed={tagFilter === t}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                  tagFilter === t ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-300' : 'border-stone-200 text-stone-600 hover:bg-stone-100 dark:border-white/10 dark:text-stone-300 dark:hover:bg-white/5'
                }`}
              >
                {t} <span className="opacity-60">{n}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {entries.length === 0 ? (
        <Card>
          <EmptyState icon={BookOpen} title={state.journal.length ? 'Brak wpisów dla filtrów' : 'Dziennik jest pusty'} description="Dodaj wpis przy każdej transakcji lub zmianie strategii." />
        </Card>
      ) : (
        <ol className="relative space-y-3 border-l-2 border-stone-200 pl-4 sm:pl-6 dark:border-white/10">
          {entries.map((e) => {
            const trade = e.tradeId ? tradeById[e.tradeId] : null;
            const open = expanded === e.id;
            const long = (e.body || '').length > 220;
            return (
              <li key={e.id} className="relative">
                <span className="absolute top-5 -left-[23px] h-3 w-3 rounded-full border-2 border-white bg-blue-600 sm:-left-[31px] dark:border-neutral-950 dark:bg-blue-400" />
                <article className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-stone-500 tabular dark:text-stone-400">{formatDate(e.date)}</div>
                      <h3 className="text-base font-semibold">{e.title}</h3>
                    </div>
                    <IconButton icon={Pencil} label="Edytuj wpis" onClick={() => setForm({ ...emptyEntry(), ...e, tags: e.tags || [] })} />
                    <IconButton icon={Trash2} label="Usuń wpis" onClick={() => setToDelete(e)} className="hover:text-red-600" />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {e.instrumentId && <Badge tone="blue">{instById[e.instrumentId]?.ticker || '?'}</Badge>}
                    {e.accountId && <Badge>{accById[e.accountId]?.name || 'konto'}</Badge>}
                    {(e.tags || []).map((t) => (
                      <button key={t} type="button" onClick={() => setTagFilter(t)} className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                        {t}
                      </button>
                    ))}
                  </div>
                  {trade && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
                      <ArrowRightLeft size={12} /> {tradeLabel(trade, instById, accById)} · {formatPLN(trade.quantity * trade.price * (trade.fxRate || 1))}
                    </div>
                  )}
                  {e.body && (
                    <p className={`mt-2 text-sm whitespace-pre-line text-stone-700 dark:text-stone-300 ${!open && long ? 'line-clamp-3' : ''}`}>{e.body}</p>
                  )}
                  {long && (
                    <button type="button" className="mt-1 text-xs text-blue-600 hover:underline dark:text-blue-400" onClick={() => setExpanded(open ? null : e.id)}>
                      {open ? 'Zwiń' : 'Czytaj dalej'}
                    </button>
                  )}
                </article>
              </li>
            );
          })}
        </ol>
      )}

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? 'Edytuj wpis' : 'Nowy wpis w dzienniku'}
        footer={
          <>
            <Button onClick={() => setForm(null)}>Anuluj</Button>
            <Button variant="primary" onClick={save} disabled={!form?.title?.trim() || !form?.date}>
              Zapisz
            </Button>
          </>
        }
      >
        {form && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <Field label="Data">
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </Field>
              <Field label="Tytuł">
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="np. Dokupienie VWCE po korekcie" autoFocus />
              </Field>
            </div>
            <Field label="Powiązana transakcja (opcjonalnie)">
              <Select value={form.tradeId || ''} onChange={(e) => linkTrade(e.target.value)}>
                <option value="">— ogólna zmiana w portfelu —</option>
                {trades.map((t) => (
                  <option key={t.id} value={t.id}>
                    {tradeLabel(t, instById, accById)}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Instrument">
                <Select value={form.instrumentId || ''} onChange={(e) => setForm({ ...form, instrumentId: e.target.value })}>
                  <option value="">—</option>
                  {state.instruments.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.ticker}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Konto">
                <Select value={form.accountId || ''} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
                  <option value="">—</option>
                  {state.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Tagi">
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-stone-200 px-2 py-1.5 dark:border-white/10">
                {form.tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                    {t}
                    <button type="button" aria-label={`Usuń tag ${t}`} onClick={() => setForm({ ...form, tags: form.tags.filter((x) => x !== t) })}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                      e.preventDefault();
                      addTag(tagInput);
                    }
                  }}
                  placeholder="#tag + Enter"
                  className="min-w-[6rem] flex-1 bg-transparent text-sm outline-none"
                  aria-label="Nowy tag"
                />
              </div>
            </Field>
            <div className="flex flex-wrap gap-1">
              {SUGGESTED_TAGS.filter((t) => !form.tags.includes(t)).map((t) => (
                <button key={t} type="button" onClick={() => addTag(t)} className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-stone-300 px-2 py-0.5 text-[11px] text-stone-600 hover:bg-stone-100 dark:border-white/15 dark:text-stone-300 dark:hover:bg-white/5">
                  <Hash size={10} />
                  {t.slice(1)}
                </button>
              ))}
            </div>
            <Field label="Dlaczego podjąłem tę decyzję?">
              <textarea
                rows={6}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Teza inwestycyjna, emocje, plan wyjścia, czego się spodziewam…"
                className="w-full resize-y rounded-lg border border-stone-200 bg-white p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-neutral-800"
              />
            </Field>
            {form.tradeId && (
              <p className="flex items-center gap-1 text-xs text-stone-500">
                <Link2 size={12} /> Instrument i konto uzupełnione z transakcji.
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Usunąć wpis?"
        footer={
          <>
            <Button onClick={() => setToDelete(null)}>Anuluj</Button>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={() => {
                actions.remove('journal', toDelete.id);
                setToDelete(null);
              }}
            >
              Usuń
            </Button>
          </>
        }
      >
        <p className="text-sm text-stone-600 dark:text-stone-300">„{toDelete?.title}” zostanie trwale usunięty.</p>
      </Modal>
    </div>
  );
}
