import { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import { LIMITS_AS_OF, USAGE_EVENT, clearUsage, estimateCostUsd, modelStatus, monthUsage, readUsage, todayCalls, usageMonthKey } from '../../lib/aiUsage.js';
import { Card } from '../ui.jsx';

const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const fmt = (n) => Number(n || 0).toLocaleString('pl-PL');
const tok = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} mln` : n >= 1000 ? `${(n / 1000).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} tys.` : fmt(n));
const usd = (v) => `${v < 0.01 && v > 0 ? '< 0,01' : v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;

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
  const { total, byCat, models: monthModels } = monthUsage(u, month);
  const prev = monthUsage(u, usageMonthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))).total;
  const today = todayCalls(u, now);
  const models = modelStatus(u, now);
  const warn = models.filter((m) => m.hit || m.ratio >= 0.8);
  const tokens = total.in + total.out;
  const maxTok = Math.max(1, ...byCat.map((c) => c.in + c.out));
  const topModels = Object.entries(monthModels)
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

      {warn.length > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200" role="alert">
          ⚠️ {warn.map((m) => (m.hit ? `${m.label}: dzienny limit wyczerpany – działają kolejne modele` : `${m.label}: ${Math.round(m.ratio * 100)}% dziennego limitu`)).join(' · ')}
        </p>
      )}

      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">Darmowe limity modeli – dziś</span>
          <span className="text-[11px] text-stone-400">{fmt(today)} wywołań · doba od ok. 9:00</span>
        </div>
        {models.length ? (
          <ul className="space-y-2" aria-label="Limity modeli">
            {models.map((m) => (
              <li key={m.key}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium" title={m.key}>
                    {m.label}
                  </span>
                  <span className={`shrink-0 text-xs tabular ${m.hit || m.ratio >= 0.95 ? 'font-semibold text-red-600 dark:text-red-400' : m.ratio >= 0.8 ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-stone-500 dark:text-stone-400'}`}>
                    {m.hit ? 'limit wyczerpany' : m.rpd ? `${fmt(m.used)} / ${fmt(m.rpd)} dziennie` : `${fmt(m.used)} dziś`}
                  </span>
                </div>
                <div className="mt-1">
                  <Bar value={m.rpd ? m.ratio : 0} tone={m.hit || m.ratio >= 0.95 ? 'bg-red-500' : m.ratio >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500/70'} />
                </div>
                <div className="mt-0.5 text-[10px] text-stone-400">
                  {[m.rpm ? `${fmt(m.rpm)} / min` : '', m.tpm ? `${tok(m.tpm)} tok. / min` : '', m.tpd ? `${tok(m.tpd)} tok. / dobę (dziś ${tok(m.tokens)})` : '', `limit: ${m.source}`].filter(Boolean).join(' · ')}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-stone-500 dark:text-stone-400">Limity pojawią się po pierwszych zapytaniach AI.</p>
        )}
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
          Tokeny z odpowiedzi modeli{tokens ? '' : ' (pojawią się po kolejnych zapytaniach)'}. Darmowy klucz – koszt 0 zł; „płatnie” – orientacyjnie wg stawek Gemini 2.5 Flash (0,30 $ / 2,50 $ za 1 mln tokenów wej. / wyj.). Limity darmowe: wg zestawień z {LIMITS_AS_OF} – Google i Groq zmieniają je bez zapowiedzi; gdy dostawca poda rzeczywisty limit (nagłówki Groq, komunikat Google przy przekroczeniu), panel używa jego wartości. Ostrzeżenie w aplikacji przy 80% i 95% dziennego limitu.
          {topModels.length ? ` Modele: ${topModels.join(', ')}.` : ''}
        </span>
        <button type="button" onClick={() => window.confirm('Wyczyścić statystyki zużycia AI na tym urządzeniu?') && clearUsage()} className="shrink-0 font-semibold text-stone-500 hover:text-red-600 dark:text-stone-400">
          Wyczyść
        </button>
      </div>
    </Card>
  );
}
