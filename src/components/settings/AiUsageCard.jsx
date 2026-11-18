import { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import { USAGE_EVENT, clearUsage, estimateCostUsd, monthUsage, readUsage, setDailyLimit, todayCalls, usageMonthKey } from '../../lib/aiUsage.js';
import { Card } from '../ui.jsx';

const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const fmt = (n) => Number(n || 0).toLocaleString('pl-PL');
const tok = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} mln` : n >= 1000 ? `${(n / 1000).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} tys.` : fmt(n));
const usd = (v) => `${v < 0.01 && v > 0 ? '< 0,01' : v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
const DEFAULT_LIMIT = 250;

function Bar({ value, tone = 'bg-stone-400 dark:bg-stone-500' }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-white/10">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  );
}

function Tile({ label, value, sub }) {
  return (
    <div className="min-w-0 rounded-xl border border-stone-200 p-2.5 dark:border-white/10">
      <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">{label}</div>
      <div className="text-base font-semibold tabular">{value}</div>
      {sub && <div className="truncate text-[11px] text-stone-400">{sub}</div>}
    </div>
  );
}

// Ustawienia → Zużycie AI: zapytania i tokeny w bieżącym miesiącu (na tym urządzeniu), podział na funkcje,
// wykorzystanie dziennego limitu darmowego klucza i orientacyjny koszt przy płatnym planie
export default function AiUsageCard() {
  const [u, setU] = useState(readUsage);
  useEffect(() => {
    const on = () => setU(readUsage());
    window.addEventListener(USAGE_EVENT, on);
    return () => window.removeEventListener(USAGE_EVENT, on);
  }, []);
  const now = new Date();
  const month = usageMonthKey(now);
  const { total, byCat, models } = monthUsage(u, month);
  const prev = monthUsage(u, usageMonthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))).total;
  const limit = u.limit || DEFAULT_LIMIT;
  const today = todayCalls(u, now);
  const tokens = total.in + total.out;
  const maxTok = Math.max(1, ...byCat.map((c) => c.in + c.out));
  const topModels = Object.entries(models)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m, n]) => `${m.split(':').slice(1).join(':') || m} (${n})`);
  return (
    <Card title="Zużycie AI" subtitle={`${MONTHS[now.getMonth()]} ${now.getFullYear()} · na tym urządzeniu`} icon={Gauge}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Zapytania" value={fmt(total.requests)} sub={`${total.cached ? `+${fmt(total.cached)} z pamięci · ` : ''}${total.errors ? `${fmt(total.errors)} nieudanych` : 'bez błędów'}`} />
        <Tile label="Tokeny wejściowe" value={tok(total.in)} sub={total.requests ? `śr. ${tok(Math.round(total.in / Math.max(1, total.requests)))} / zapytanie` : '—'} />
        <Tile label="Tokeny wyjściowe" value={tok(total.out)} sub={prev.in + prev.out ? `poprz. miesiąc: ${tok(prev.in + prev.out)} łącznie` : 'z „myśleniem” modelu'} />
        <Tile label="Koszt" value="0 zł" sub={`płatnie ok. ${usd(estimateCostUsd(total))}`} />
      </div>

      <div className="mt-4 space-y-1">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="font-medium text-stone-600 dark:text-stone-300">Dziś: {fmt(today)} z {fmt(limit)} wywołań modelu</span>
          <label className="flex items-center gap-1 text-[11px] text-stone-400">
            limit dzienny
            <input
              type="number"
              min="1"
              inputMode="numeric"
              defaultValue={limit}
              onBlur={(e) => setDailyLimit(e.target.value)}
              aria-label="Dzienny limit zapytań darmowego klucza"
              className="h-6 w-16 rounded-md border border-stone-200 bg-white px-1.5 text-right text-[11px] dark:border-white/10 dark:bg-neutral-800"
            />
          </label>
        </div>
        <Bar value={today / limit} tone={today / limit > 0.9 ? 'bg-amber-500' : 'bg-emerald-500/70'} />
      </div>

      <ul className="mt-4 space-y-2.5" aria-label="Zużycie według funkcji">
        {byCat.map((c) => (
          <li key={c.id} className={c.requests + c.cached + c.errors ? '' : 'opacity-50'}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-medium">{c.label}</span> <span className="hidden text-[11px] text-stone-400 sm:inline">{c.hint}</span>
              </span>
              <span className="shrink-0 text-xs text-stone-500 tabular dark:text-stone-400">
                {fmt(c.requests)} zap. · {tok(c.in + c.out)} tok.
              </span>
            </div>
            <div className="mt-1">
              <Bar value={(c.in + c.out) / maxTok} />
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3 text-[11px] text-stone-500 dark:border-white/5 dark:text-stone-400">
        <span>
          Tokeny z odpowiedzi modeli{tokens ? '' : ' (pojawią się po kolejnych zapytaniach)'}. Darmowy klucz – koszt 0 zł; „płatnie” – orientacyjnie wg stawek Gemini 2.5 Flash (0,30 $ / 2,50 $ za 1 mln tokenów wej. / wyj.). Limit dzienny ustaw wg Google AI Studio.
          {topModels.length ? ` Modele: ${topModels.join(', ')}.` : ''}
        </span>
        <button type="button" onClick={() => window.confirm('Wyczyścić statystyki zużycia AI na tym urządzeniu?') && clearUsage()} className="shrink-0 font-semibold text-stone-500 hover:text-red-600 dark:text-stone-400">
          Wyczyść
        </button>
      </div>
    </Card>
  );
}
