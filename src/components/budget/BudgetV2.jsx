import { useEffect, useState } from 'react';
import { Bus, Car, ChevronLeft, ChevronRight, Check, Copy, Dumbbell, Gift, GraduationCap, HeartPulse, Home, PawPrint, Pencil, PiggyBank, Plane, Receipt, Shirt, ShoppingCart, Sparkles, Train, TrendingUp, Tv, UtensilsCrossed, Wallet, Zap } from 'lucide-react';
import { isTransferRow, rowLeft } from '../../lib/budget.js';

// Budżet 2 (BETA): ten sam budżet miesięczny w lżejszej formie – duża kwota „zostało do wydania”, kafelki kategorii
// z paskami zużycia i szybkie dodawanie wydatku (duże cyfry, przyciski kategorii). Całą logikę (zapis wydatku,
// „Z oszczędności” odejmowane z konta, cofanie wpisów, paragony, podsumowanie AI) dostarcza widok budżetu (props).

// Kwoty: pełne złote bez groszy („1139 zł”), w pozostałych przypadkach dwa miejsca („14,50 zł”)
const NF0 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
const NF2 = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const zl = (v) => {
  const r = Math.round((Number(v) || 0) * 100) / 100;
  return `${(Number.isInteger(r) ? NF0 : NF2).format(r).replace(/\u00a0|\u202f/g, ' ')} zł`;
};
const num = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

// Ikona i kolor kategorii z nazwy (bez sztywnej listy kategorii – dowolne nazwy dostają ikonę domyślną)
const ICONS = [
  [/jedzen|spożyw|spozyw|żywno|zywno|zakupy|market/i, ShoppingCart],
  [/mieści|miesci|restaur|knajp|kawa|obiad|lunch|jedzenie na/i, UtensilsCrossed],
  [/uber|taxi|taksów|bolt/i, Car],
  [/pociąg|pociag|pkp|kolej/i, Train],
  [/karta miejska|bilet|autobus|komunika|mpk|ztm/i, Bus],
  [/paliw|auto|samoch|benzyn/i, Car],
  [/rachun|czynsz|prąd|prad|gaz|media|internet|telefon/i, Receipt],
  [/mieszka|dom|remont/i, Home],
  [/zdrow|lek|apteka|lekarz|soczew|dentyst/i, HeartPulse],
  [/kosmet|chemia|higien/i, Sparkles],
  [/inwest|s\s*&\s*p|sp\s?500|etf|akcj|obligac|\bik(e|ze)\b/i, TrendingUp],
  [/wakac|podróż|podroz|urlop|wyjazd/i, Plane],
  [/canal|netflix|spotify|subskr|hbo|disney|youtube/i, Tv],
  [/oszczęd|oszczed|fundusz|poduszk/i, PiggyBank],
  [/ubran|odzież|odziez|buty/i, Shirt],
  [/sport|siłown|silown|fitness/i, Dumbbell],
  [/prezent|urodzin|święt|swiet/i, Gift],
  [/kurs|nauka|szkoł|szkol|książ|ksiaz/i, GraduationCap],
  [/zwierz|pies|kot|weteryn/i, PawPrint],
  [/nieprzewidz|inne|awaryj/i, Zap],
];
const iconOf = (name) => (ICONS.find(([re]) => re.test(String(name || ''))) || [null, Wallet])[1];
const PALETTE = ['#3b6fd8', '#2f8f5b', '#c08a1e', '#d0702c', '#8a5cc7', '#2a9aa8', '#c24d6a', '#6b7f3a'];
const colorOf = (i) => PALETTE[i % PALETTE.length];

export default function BudgetV2({ monthLabel, monthShort, month, onPrev, onNext, onPickMonth, rows, totals, daysLeft, past, savingsAcc, savingsSpent, savingsId, purchaseRows, onAdd, onEdit, isTemplate, prevLabel, onCopyPrev, receiptScanner, monthSummary, receiptsHistory, recentEntries, footerNote }) {
  const cats = rows.filter((r) => String(r.name || '').trim() && !isTransferRow(r));
  const left = totals.left;
  const perDay = daysLeft > 0 ? Math.max(0, left) / daysLeft : 0;
  // Pasek: wydane w kolejnych kategoriach (kolory kafelków) na tle planu
  const base = Math.max(totals.planned, totals.spent, 1);
  const segs = cats.map((r, i) => ({ id: r.id, w: (Math.max(0, num(r.spent)) / base) * 100, c: colorOf(i) })).filter((s) => s.w > 0.2);

  // ── Nowy wydatek ──
  const options = purchaseRows.filter((r) => String(r.name || '').trim());
  const [amount, setAmount] = useState('');
  const [cat, setCat] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState(null);
  const selected = options.some((r) => r.id === cat) ? cat : (options.find((r) => /jedzeni/i.test(r.name)) || options[0])?.id || '';
  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);
  const save = (e) => {
    e.preventDefault();
    const v = Math.round(num(amount) * 100) / 100;
    if (!(v > 0)) return setMsg({ error: true, text: 'Wpisz kwotę większą od zera.' });
    if (!selected) return setMsg({ error: true, text: 'Najpierw dodaj kategorie w „Edytuj”.' });
    const res = onAdd([{ id: selected, amount: v }], null, note);
    if (!res) return setMsg({ error: true, text: 'Nie udało się dodać wydatku.' });
    setAmount('');
    setNote('');
    setMsg({ error: false, text: `${zl(v)} → ${res.name}${res.left !== null && res.left !== undefined ? ` · zostało ${zl(res.left)}` : ''}${res.transfer ? ' · odjęto z konta oszczędnościowego' : ''}` });
    return undefined;
  };

  const card = 'rounded-3xl bg-[#faf7f0] p-4 dark:bg-white/[0.04]';
  return (
    <div className="space-y-3" aria-label="Budżet 2">
      {/* Miesiąc i edycja */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="-ml-1.5 flex items-center">
          <button type="button" onClick={onPrev} aria-label="Poprzedni miesiąc" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-white/5">
            <ChevronLeft size={18} />
          </button>
          <label className="relative cursor-pointer">
            <span className="text-sm font-semibold whitespace-nowrap text-stone-700 sm:text-base dark:text-stone-200">{monthLabel}</span>
            <input type="month" value={month} onChange={(e) => e.target.value && onPickMonth(e.target.value)} aria-label="Miesiąc budżetu" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
          </label>
          <button type="button" onClick={onNext} aria-label="Następny miesiąc" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-white/5">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          {receiptScanner}
          <button type="button" onClick={onEdit} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-stone-200 px-3 text-xs font-semibold text-stone-600 hover:bg-stone-50 dark:border-white/10 dark:text-stone-300 dark:hover:bg-white/5">
            <Pencil size={13} /> Edytuj
          </button>
        </div>
      </div>

      {/* Hero: zostało do wydania */}
      <section className="rounded-3xl bg-[#3f5a4c] p-5 text-[#f6f1e6] shadow-sm dark:bg-[#2c4237]" aria-label="Zostało do wydania">
        <p className="text-sm text-[#e9e2d0]/90">{left < -0.004 ? `Przekroczono budżet w ${monthShort}` : `Zostało do wydania w ${monthShort}`}</p>
        <p className={`mt-1 text-5xl font-bold tracking-tight tabular ${left < -0.004 ? 'text-[#ffb4a2]' : ''}`}>{zl(Math.abs(left))}</p>
        <p className="mt-2 text-sm text-[#e9e2d0]/90">
          {past ? (
            'Miesiąc zakończony'
          ) : left > 0 && daysLeft > 0 ? (
            <>
              To ok. <strong className="font-semibold text-[#f0b45a]">{zl(Math.round(perDay))} dziennie</strong> do końca miesiąca
            </>
          ) : (
            `Wydano ${zl(totals.spent)} z ${zl(totals.planned)}`
          )}
        </p>
        <div className="mt-4 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-[#5c7568]" role="img" aria-label={`Wydano ${zl(totals.spent)} z ${zl(totals.planned)}`}>
          {segs.map((s) => (
            <span key={s.id} style={{ width: `${s.w}%`, background: s.c }} className="h-full first:rounded-l-full" />
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-[#e9e2d0]/70 tabular">
          Wydano {zl(totals.spent)} z {zl(totals.planned)}
        </p>
      </section>

      {isTemplate && prevLabel && (
        <button type="button" onClick={onCopyPrev} className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-stone-300 px-3 py-2.5 text-xs font-semibold text-stone-600 hover:bg-stone-50 dark:border-white/15 dark:text-stone-300 dark:hover:bg-white/5">
          <Copy size={14} /> Kopiuj plan z: {prevLabel}
        </button>
      )}

      {/* Ile zostało w kategoriach */}
      <section className={card} aria-label="Ile zostało w kategoriach">
        <h3 className="text-base font-semibold text-[#3f5a4c] dark:text-[#b9d3c4]">Ile zostało w kategoriach</h3>
        <ul className="mt-2 space-y-3">
          {savingsAcc && (
            <li className="flex items-center gap-3" aria-label="Z oszczędności">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white" style={{ background: '#2f8f5b' }}>
                <PiggyBank size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold">Z oszczędności</span>
                  <span className="text-sm font-semibold tabular">{zl(savingsSpent)}</span>
                </div>
                <p className="text-[11px] text-stone-500 dark:text-stone-400">wydano z konta „{savingsAcc.name}” · poza budżetem</p>
              </div>
            </li>
          )}
          {cats.map((r, i) => {
            const Icon = iconOf(r.name);
            const planned = num(r.planned);
            const l = rowLeft(r);
            const over = l < -0.004;
            const pct = planned > 0 ? Math.max(0, Math.min(1, l / planned)) : 0;
            return (
              <li key={r.id} className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white" style={{ background: colorOf(i) }}>
                  <Icon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{r.name}</span>
                    <span className={`shrink-0 text-sm font-semibold tabular ${over ? 'text-red-600 dark:text-red-400' : ''}`}>{over ? `−${zl(-l)}` : zl(l)}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#e3ebe5] dark:bg-white/10">
                    <div className={`h-full rounded-full ${over ? 'bg-red-500' : 'bg-[#3f5a4c] dark:bg-[#7fa894]'}`} style={{ width: `${over ? 100 : pct * 100}%` }} />
                  </div>
                  <p className="mt-0.5 text-[11px] text-stone-500 tabular dark:text-stone-400">{over ? `przekroczono plan ${zl(planned)}` : `zostało z ${zl(planned)}`}</p>
                </div>
              </li>
            );
          })}
          {!cats.length && <li className="py-3 text-center text-sm text-stone-500">Brak kategorii – dodaj je w „Edytuj”.</li>}
        </ul>
      </section>

      {/* Nowy wydatek */}
      <form onSubmit={save} className={card} aria-label="Nowy wydatek">
        <h3 className="text-base font-semibold text-[#3f5a4c] dark:text-[#b9d3c4]">Nowy wydatek</h3>
        <div className="mt-2 flex items-baseline gap-2 border-b-2 border-[#e6dcc6] pb-1 dark:border-white/10">
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,.]/g, ''))} inputMode="decimal" placeholder="0" aria-label="Kwota wydatku" className="w-full min-w-0 bg-transparent text-5xl font-bold tracking-tight text-stone-800 tabular outline-none placeholder:text-stone-300 dark:text-stone-100 dark:placeholder:text-stone-600" />
          <span className="text-2xl font-semibold text-stone-400">zł</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Kategoria wydatku">
          {options.map((r, i) => {
            const Icon = r.id === savingsId ? PiggyBank : iconOf(r.name);
            const on = r.id === selected;
            const color = r.id === savingsId ? '#2f8f5b' : colorOf(cats.findIndex((c) => c.id === r.id) >= 0 ? cats.findIndex((c) => c.id === r.id) : i);
            return (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setCat(r.id)}
                className={`inline-flex h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors ${on ? 'border-[#3f5a4c] bg-[#3f5a4c] text-white dark:border-[#7fa894] dark:bg-[#3f5a4c]' : 'border-[#e6dcc6] bg-white text-stone-700 hover:bg-stone-50 dark:border-white/10 dark:bg-neutral-900 dark:text-stone-200'}`}
              >
                <Icon size={16} style={on ? undefined : { color }} aria-hidden="true" />
                {r.name}
              </button>
            );
          })}
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} placeholder="Notatka (opcjonalnie)" aria-label="Notatka do wydatku" className="mt-3 h-10 w-full min-w-0 rounded-xl border border-[#e6dcc6] bg-white px-3 text-sm outline-none focus:border-[#3f5a4c] dark:border-white/10 dark:bg-neutral-900" />
        <button type="submit" className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#3f5a4c] text-base font-semibold text-white hover:bg-[#344b3f] dark:bg-[#4e6f5e] dark:hover:bg-[#5a7d6b]">
          <Check size={18} /> Zapisz wydatek
        </button>
        {msg && (
          <p role="status" className={`mt-2 text-center text-xs ${msg.error ? 'text-red-600 dark:text-red-400' : 'text-[#2f6b4a] dark:text-[#9fd0b4]'}`}>
            {msg.text}
          </p>
        )}
      </form>

      {monthSummary}
      <div className={card}>
        {receiptsHistory}
        {recentEntries}
      </div>
      {footerNote && <p className="text-right text-[11px] text-stone-400">{footerNote}</p>}
    </div>
  );
}
