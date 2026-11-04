import { useEffect, useRef, useState } from 'react';
import { Bitcoin, Coins, Gem, RefreshCw, Settings2 } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { TROY_OZ_G, altQuotesStale, altSettings, alternativesValue, fetchAltQuotes } from '../lib/alternatives.js';
import { formatDateTime, formatPLN } from '../lib/format.js';
import { BetaBadge, Button, Card, Field, Input, Segmented, Toggle } from '../components/ui.jsx';

const ICONS = { gold: Coins, silver: Coins, btc: Bitcoin, eth: Gem };
const TONE = { gold: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300', silver: 'bg-stone-200 text-stone-600 dark:bg-white/10 dark:text-stone-300', btc: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300', eth: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' };
const pctTxt = (v) => (v === null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);
const signPLN = (v) => `${v > 0 ? '+' : ''}${formatPLN(v)}`;
const tone = (v) => (v > 0.005 ? 'text-emerald-600 dark:text-emerald-400' : v < -0.005 ? 'text-red-600 dark:text-red-400' : 'text-stone-500 dark:text-stone-400');
const money = (v, ccy) => `${(Number(v) || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ccy === 'USD' ? '$' : ccy}`;
const qtyTxt = (p) => `${p.qty.toLocaleString('pl-PL', { maximumFractionDigits: p.digits })} ${p.unit}`;

// Surowce i Krypto (BETA): złoto, srebro, BTC, ETH – ilość wpisywana przez użytkownika, ceny na żywo z Yahoo Finance
// (USD → PLN po kursie USDPLN=X), zmiana dzienna (cena i kurs), doliczanie do Majątku Całkowitego.
export default function AlternativesView() {
  const { state, actions } = useApp();
  const alt = altSettings(state);
  const v = alternativesValue(state);
  const latest = useRef(state);
  latest.current = state;
  const [busy, setBusy] = useState(false);
  const save = (patch) => actions.updateSettings({ alternatives: { ...altSettings(latest.current), ...patch } });
  const setHolding = (id, patch) => {
    const cur = altSettings(latest.current).holdings || {};
    save({ holdings: { ...cur, [id]: { ...(cur[id] || {}), ...patch } } });
  };

  const refresh = async (silent = false) => {
    setBusy(true);
    try {
      const r = await fetchAltQuotes(latest.current, { fresh: !silent });
      if (r.ok) save({ quotes: r.quotes });
      if (!silent && r.errors.length) actions.notify(`Surowce i Krypto: ${r.errors.join('; ')}`, 'warn');
      else if (!silent && r.ok) actions.notify('Notowania surowców i krypto odświeżone', 'success');
      if (!r.ok && !silent) actions.notify('Nie udało się pobrać notowań – spróbuj ponownie', 'warn');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (altQuotesStale(latest.current)) refresh(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const usd = alt.quotes?.fx?.USD;
  const fxDay = usd?.price && usd?.prevClose ? usd.price / usd.prevClose - 1 : null;

  return (
    <div className="space-y-3 sm:space-y-4">
      <section className="min-w-0 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5 dark:border-white/10 dark:bg-neutral-900" aria-label="Surowce i Krypto">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              <Gem size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold">
                Surowce i Krypto
                <BetaBadge />
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">Złoto, srebro, Bitcoin i Ethereum – ceny na żywo z Yahoo Finance</p>
            </div>
          </div>
          <Button size="sm" icon={RefreshCw} onClick={() => refresh(false)} disabled={busy} aria-label="Odśwież notowania surowców i krypto">
            {busy ? 'Pobieranie…' : 'Odśwież'}
          </Button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <div className="min-w-0 rounded-xl bg-stone-50 px-3 py-2.5 dark:bg-white/[0.03]">
            <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">Wartość łącznie</div>
            <div className="truncate text-xl font-semibold tabular">{formatPLN(v.value)}</div>
            <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">{v.inNetWorth ? 'w Majątku Całkowitym' : 'poza Majątkiem Całkowitym'}</div>
          </div>
          <div className="min-w-0 rounded-xl bg-stone-50 px-3 py-2.5 dark:bg-white/[0.03]">
            <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">Zmiana dzienna (1D)</div>
            <div className={`truncate text-xl font-semibold tabular ${tone(v.dayChange)}`}>{signPLN(v.dayChange)}</div>
            <div className={`truncate text-[11px] tabular ${tone(v.dayChange)}`}>{pctTxt(v.dayPct)}</div>
          </div>
          <div className={`col-span-2 min-w-0 rounded-xl px-3 py-2.5 ${v.pl === null ? 'bg-stone-50 dark:bg-white/[0.03]' : v.pl >= 0 ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-red-50 dark:bg-red-500/10'}`}>
            <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">Zysk / strata od zakupu</div>
            {v.pl === null ? (
              <div className="text-sm text-stone-500 dark:text-stone-400">Wpisz średnią cenę zakupu w karcie aktywa</div>
            ) : (
              <>
                <div className={`truncate text-xl font-semibold tabular ${tone(v.pl)}`}>
                  {signPLN(v.pl)} <span className="text-base">({pctTxt(v.plPct)})</span>
                </div>
                <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">koszt zakupu {formatPLN(v.cost)}{v.plCount < v.held.length ? ` · ${v.plCount} z ${v.held.length} pozycji z ceną zakupu` : ''}</div>
              </>
            )}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-stone-500 dark:text-stone-400">
          {v.quotesAt ? `Notowania: ${formatDateTime(v.quotesAt)} · ${alt.quotes?.source || 'Yahoo'}` : 'Brak notowań – odśwież'}
          {usd?.price ? ` · USD/PLN ${usd.price.toLocaleString('pl-PL', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} (${pctTxt(fxDay)})` : ''}
          {v.missingPrices.length ? ` · brak ceny: ${v.missingPrices.join(', ')}` : ''}
        </p>
      </section>

      {v.positions.map((p) => {
        const Icon = ICONS[p.id];
        const holding = alt.holdings?.[p.id] || {};
        const summary = p.qty > 0 ? `${qtyTxt(p)} · ${formatPLN(p.value)}${p.pl !== null ? ` · wynik ${pctTxt(p.plPct)}` : ''} · 1D ${pctTxt(p.dayPct)}` : p.hasPrice ? `${formatPLN(p.unitPricePLN)} / ${p.metal ? (p.unit === 'g' ? 'g' : 'oz') : 'szt.'} · brak pozycji` : 'brak pozycji';
        return (
          <Card
            key={p.id}
            collapsible
            defaultOpen={p.qty > 0}
            storageKey={`fintrack-alt-open-${p.id}`}
            title={
              <>
                {p.label} <span className="font-normal text-stone-400">({p.short})</span>
              </>
            }
            summary={summary}
            icon={Icon}
          >
            <div className="flex items-center gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE[p.id]}`}>
                <Icon size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-stone-500 dark:text-stone-400">Cena rynkowa{p.metal ? ` (${p.unit === 'g' ? '1 g' : '1 uncja trojańska'})` : ''}</div>
                <div className="text-lg font-semibold tabular">{p.hasPrice ? formatPLN(p.unitPricePLN) : '—'}</div>
                <div className="text-[11px] text-stone-500 tabular dark:text-stone-400">
                  {p.hasPrice ? `${money(p.unitPrice, p.currency)}${p.metal && p.unit === 'g' ? ` · ${money(p.unitPrice * TROY_OZ_G, p.currency)} / oz` : ''} · ` : ''}
                  <span className={tone(p.priceDayPct || 0)}>1D {pctTxt(p.priceDayPct)}</span> · {p.symbol}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <Field label={`Ilość (${p.metal ? (p.unit === 'g' ? 'gramy' : 'uncje') : 'szt.'})`} className="w-40">
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step={p.metal ? '0.01' : '0.00000001'}
                  placeholder="0"
                  value={holding.qty ?? ''}
                  onChange={(e) => setHolding(p.id, { qty: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) })}
                  aria-label={`Ilość – ${p.label}`}
                />
              </Field>
              {p.metal && (
                <Segmented
                  size="sm"
                  value={p.unit}
                  onChange={(u) => {
                    // Zmiana jednostki przelicza wpisaną ilość (ta sama masa kruszcu)
                    const q = Number(holding.qty) || 0;
                    const next = u === p.unit || !q ? holding.qty : u === 'oz' ? +(q / TROY_OZ_G).toFixed(6) : +(q * TROY_OZ_G).toFixed(4);
                    // …i średnią cenę zakupu (cena za gram ↔ za uncję – ten sam koszt całkowity)
                    const a = Number(holding.avgPrice) || 0;
                    const avg = u === p.unit || !a ? holding.avgPrice : u === 'oz' ? +(a * TROY_OZ_G).toFixed(4) : +(a / TROY_OZ_G).toFixed(6);
                    setHolding(p.id, { unit: u, qty: next ?? '', ...(a ? { avgPrice: avg } : {}) });
                  }}
                  ariaLabel={`Jednostka – ${p.label}`}
                  options={[
                    { value: 'g', label: 'gramy' },
                    { value: 'oz', label: 'uncje' },
                  ]}
                />
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <Field label={`Średnia cena zakupu (za ${p.metal ? (p.unit === 'g' ? '1 g' : '1 oz') : '1 szt.'})`} className="w-44">
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder={p.hasPrice ? (p.avgCurrency === 'USD' ? p.unitPrice : p.unitPricePLN).toFixed(2) : '0'}
                  value={holding.avgPrice ?? ''}
                  onChange={(e) => setHolding(p.id, { avgPrice: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) })}
                  aria-label={`Średnia cena zakupu – ${p.label}`}
                />
              </Field>
              <Segmented
                size="sm"
                value={p.avgCurrency}
                onChange={(c) => setHolding(p.id, { avgCurrency: c })}
                ariaLabel={`Waluta ceny zakupu – ${p.label}`}
                options={[
                  { value: 'PLN', label: 'PLN' },
                  { value: 'USD', label: 'USD' },
                ]}
              />
              {p.avgCurrency === 'USD' && (
                <Field label="Kurs USD/PLN przy zakupie" className="w-40" hint={p.avgFxIsCurrent ? 'puste = bieżący kurs' : undefined}>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.0001"
                    placeholder={p.avgFx ? p.avgFx.toFixed(4) : '4.0000'}
                    value={holding.avgFx ?? ''}
                    onChange={(e) => setHolding(p.id, { avgFx: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) })}
                    aria-label={`Kurs USD/PLN przy zakupie – ${p.label}`}
                  />
                </Field>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <div className={`col-span-2 min-w-0 rounded-xl px-3 py-2.5 ${p.pl === null ? 'bg-stone-50 dark:bg-white/[0.03]' : p.pl >= 0 ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-red-50 dark:bg-red-500/10'}`} aria-label={`Zysk / strata – ${p.label}`}>
                <div className="text-[11px] text-stone-500 dark:text-stone-400">Zysk / strata</div>
                {p.pl === null ? (
                  <div className="text-sm text-stone-500 dark:text-stone-400">{p.qty > 0 ? 'Wpisz średnią cenę zakupu' : 'Wpisz ilość i średnią cenę zakupu'}</div>
                ) : (
                  <>
                    <div className={`truncate text-lg font-semibold tabular ${tone(p.pl)}`}>
                      {signPLN(p.pl)} <span className="text-sm">({pctTxt(p.plPct)})</span>
                    </div>
                    <div className="truncate text-[11px] text-stone-500 tabular dark:text-stone-400">
                      koszt {formatPLN(p.costPLN)} · teraz {formatPLN(p.value)}
                      {p.avgCurrency === 'USD' ? ` · kurs zakupu ${p.avgFx.toFixed(4)}${p.avgFxIsCurrent ? ' (bieżący)' : ''}` : ''}
                    </div>
                  </>
                )}
              </div>
              <div className="min-w-0 rounded-xl bg-stone-50 px-3 py-2.5 dark:bg-white/[0.03]">
                <div className="text-[11px] text-stone-500 dark:text-stone-400">Wartość (PLN)</div>
                <div className="truncate text-base font-semibold tabular">{formatPLN(p.value)}</div>
                <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">{qtyTxt(p)}</div>
              </div>
              <div className="min-w-0 rounded-xl bg-stone-50 px-3 py-2.5 dark:bg-white/[0.03]">
                <div className="text-[11px] text-stone-500 dark:text-stone-400">Zmiana dzienna (1D)</div>
                <div className={`truncate text-base font-semibold tabular ${tone(p.dayChange)}`}>{signPLN(p.dayChange)}</div>
                <div className={`truncate text-[11px] tabular ${tone(p.dayChange)}`}>{pctTxt(p.dayPct)} w PLN</div>
              </div>
            </div>
          </Card>
        );
      })}

      <Card collapsible storageKey="fintrack-alt-open-settings" title="Ustawienia modułu" summary={v.inNetWorth ? 'wliczane do Majątku Całkowitego' : 'poza Majątkiem Całkowitym'} icon={Settings2}>
        <Toggle checked={v.inNetWorth} onChange={(on) => save({ includeInNetWorth: on })} label="Doliczaj do Majątku Całkowitego" description="Pulpit (Net Worth), cele majątku i udział poduszki. W zakładce Portfel pozycje można ukryć filtrem kategorii „Surowce i krypto”." />
        <p className="mt-3 text-[11px] text-stone-500 dark:text-stone-400">
          Źródło: Yahoo Finance – złoto GC=F i srebro SI=F (COMEX, USD za uncję trojańską = {TROY_OZ_G.toLocaleString('pl-PL')} g), Bitcoin BTC-USD, Ethereum ETH-USD; przeliczenie po kursie USDPLN=X. Notowania odświeżają się po otwarciu modułu i przy starcie aplikacji (co najmniej co 15 min). Zmiana dzienna w PLN uwzględnia ruch ceny i kursu USD/PLN. Ilości i notowania zapisują się na urządzeniu i w chmurze.
        </p>
      </Card>
    </div>
  );
}
