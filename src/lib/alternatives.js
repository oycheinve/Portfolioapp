// Surowce i Krypto (BETA): złoto, srebro, Bitcoin i Ethereum z cenami z Yahoo Finance.
// Dane w state.settings.alternatives (synchronizacja z Supabase razem z portfelem + localStorage):
//   holdings: { gold: { qty, unit: 'g' | 'oz', avgPrice, avgCurrency: 'PLN' | 'USD', avgFx }, silver: {…}, btc: { qty, avgPrice, … }, eth: {…} }
//     avgPrice – średnia cena zakupu za jednostkę użytkownika (1 g / 1 oz / 1 szt.); avgFx – kurs USD/PLN zakupu (dla USD;
//     puste = bieżący kurs)
//   quotes:   { gold: { price, prevClose, currency }, …, fx: { USD: { price, prevClose } }, at, source }
//   includeInNetWorth (domyślnie tak) – doliczanie do Majątku Całkowitego; Portfel – filtr kategorii „Surowce i krypto”.
// Złoto i srebro: kontrakty COMEX (GC=F, SI=F) w USD za uncję trojańską; krypto: BTC-USD, ETH-USD; kurs USDPLN=X.
export const TROY_OZ_G = 31.1034768;

export const ALT_ASSETS = [
  { id: 'gold', label: 'Złoto', short: 'XAU', symbol: 'GC=F', metal: true, digits: 2 },
  { id: 'silver', label: 'Srebro', short: 'XAG', symbol: 'SI=F', metal: true, digits: 2 },
  { id: 'btc', label: 'Bitcoin', short: 'BTC', symbol: 'BTC-USD', metal: false, digits: 8 },
  { id: 'eth', label: 'Ethereum', short: 'ETH', symbol: 'ETH-USD', metal: false, digits: 6 },
];
export const ALT_FX_SYMBOL = 'USDPLN=X';
export const ALT_QUOTES_TTL = 15 * 60 * 1000;

export function altSettings(state) {
  const a = state?.settings?.alternatives;
  return a && typeof a === 'object' ? a : {};
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fxOf = (quotes, ccy, field) => {
  if (!ccy || ccy === 'PLN') return 1;
  const q = quotes?.fx?.[ccy];
  return num(q?.[field]) || num(q?.price) || 0;
};

// Wycena jednej pozycji: cena za jednostkę użytkownika (gram / uncja / sztuka) w walucie i w PLN, wartość, zmiana 1D
export function valueAltPosition(asset, holding, quotes) {
  const qty = Math.max(0, num(holding?.qty));
  const q = quotes?.[asset.id];
  const unitFactor = asset.metal && (holding?.unit || 'g') === 'g' ? 1 / TROY_OZ_G : 1; // notowanie za uncję → za gram
  const price = num(q?.price);
  const prev = num(q?.prevClose) || price;
  const ccy = q?.currency || 'USD';
  const fx = fxOf(quotes, ccy, 'price');
  const fxPrev = fxOf(quotes, ccy, 'prevClose') || fx;
  const unitPrice = price * unitFactor;
  const unitPricePLN = unitPrice * fx;
  const value = qty * unitPricePLN;
  const prevValue = qty * prev * unitFactor * fxPrev;
  const hasPrice = price > 0 && fx > 0;
  // Koszt zakupu (średnia cena × ilość) w PLN i wynik na żywo: wartość bieżąca − koszt
  const avg = num(holding?.avgPrice);
  const avgCurrency = holding?.avgCurrency === 'USD' ? 'USD' : 'PLN';
  const usdNow = fxOf(quotes, 'USD', 'price');
  const avgFx = avgCurrency === 'USD' ? num(holding?.avgFx) || usdNow : 1;
  const costPLN = avg > 0 && qty > 0 && avgFx > 0 ? qty * avg * avgFx : null;
  const pl = costPLN !== null && hasPrice ? value - costPLN : null;
  return {
    avgPrice: avg > 0 ? avg : null,
    avgCurrency,
    avgFx: avgCurrency === 'USD' ? avgFx : null,
    avgFxIsCurrent: avgCurrency === 'USD' && !(num(holding?.avgFx) > 0),
    costPLN,
    pl,
    plPct: pl !== null && costPLN > 0 ? pl / costPLN : null,
    ...asset,
    qty,
    unit: asset.metal ? holding?.unit || 'g' : 'szt.',
    currency: ccy,
    unitPrice,
    unitPricePLN,
    value: hasPrice ? value : 0,
    hasPrice,
    dayChange: hasPrice && prevValue > 0 ? value - prevValue : 0,
    dayPct: hasPrice && prevValue > 0 ? value / prevValue - 1 : null,
    priceDayPct: price > 0 && prev > 0 ? price / prev - 1 : null,
  };
}

// Wszystkie pozycje + suma (wartość w PLN, zmiana dzienna); inNetWorth – czy doliczać do Majątku Całkowitego
// ── Rejestr zakupów (zakładka Wpłaty) ──
// purchases: [{ id, asset, date, qty, unit: 'g' | 'oz' | 'szt.', unitPrice, currency: 'PLN' | 'USD', fx }]
// Kwota w PLN = ilość × cena jednostkowa × kurs (USD; PLN – 1). Metale liczone w gramach (uncja = 31,1034768 g).
export function purchaseTotalPLN(p) {
  const fx = p?.currency === 'USD' ? num(p?.fx) : 1;
  return num(p?.qty) * num(p?.unitPrice) * fx;
}
const toGrams = (qty, unit) => (unit === 'oz' ? qty * TROY_OZ_G : qty);

// Średnia cena nabycia (średnia ważona ilością): Σ kwot PLN / Σ jednostek – w jednostce wyświetlanej (g / oz / szt.)
export function purchaseStats(state, assetId, displayUnit = 'g') {
  const asset = ALT_ASSETS.find((a) => a.id === assetId);
  const list = (altSettings(state).purchases || []).filter((p) => p.asset === assetId && num(p.qty) > 0);
  if (!asset || !list.length) return null;
  const total = list.reduce((sum, p) => sum + purchaseTotalPLN(p), 0);
  const base = list.reduce((sum, p) => sum + (asset.metal ? toGrams(num(p.qty), p.unit) : num(p.qty)), 0); // gramy / sztuki
  const qty = asset.metal && displayUnit === 'oz' ? base / TROY_OZ_G : base;
  return { count: list.length, totalPLN: total, qty, unit: asset.metal ? displayUnit : 'szt.', avgPricePLN: qty > 0 ? total / qty : 0, first: list.reduce((m, p) => (p.date < m ? p.date : m), list[0].date) };
}

// Pozycja efektywna: z rejestru zakupów (ilość i średnia cena nabycia w PLN), a bez zakupów – wpis ręczny
export function effectiveHolding(state, assetId) {
  const h = altSettings(state).holdings?.[assetId] || {};
  const st = purchaseStats(state, assetId, h.unit || 'g');
  if (!st) return { ...h, fromPurchases: false };
  return { ...h, qty: st.qty, avgPrice: st.avgPricePLN, avgCurrency: 'PLN', avgFx: null, fromPurchases: true, purchases: st };
}

export function alternativesValue(state) {
  const s = altSettings(state);
  const positions = ALT_ASSETS.map((a) => {
    const h = effectiveHolding(state, a.id);
    return { ...valueAltPosition(a, h, s.quotes), fromPurchases: h.fromPurchases, purchases: h.purchases || null };
  });
  const held = positions.filter((p) => p.qty > 0);
  const value = held.reduce((sum, p) => sum + p.value, 0);
  const dayChange = held.reduce((sum, p) => sum + p.dayChange, 0);
  const withCost = held.filter((p) => p.pl !== null);
  const cost = withCost.reduce((sum, p) => sum + p.costPLN, 0);
  const pl = withCost.reduce((sum, p) => sum + p.pl, 0);
  return {
    cost: withCost.length ? cost : null,
    pl: withCost.length ? pl : null,
    plPct: withCost.length && cost > 0 ? pl / cost : null,
    plCount: withCost.length,
    positions,
    held,
    value,
    dayChange,
    dayPct: value - dayChange > 0 ? dayChange / (value - dayChange) : null,
    inNetWorth: s.includeInNetWorth !== false,
    missingPrices: held.filter((p) => !p.hasPrice).map((p) => p.label),
    quotesAt: s.quotes?.at || null,
  };
}

// Pobranie notowań (Yahoo): aktywa z posiadanymi jednostkami (all – wszystkie) i kurs USD/PLN
export async function fetchAltQuotes(state, { all = true, fresh = false } = {}) {
  const { fetchYahooQuote } = await import('./prices.js');
  const s = altSettings(state);
  const list = ALT_ASSETS.filter((a) => all || num(effectiveHolding(state, a.id).qty) > 0);
  const prevQuotes = s.quotes || {};
  const next = { ...prevQuotes, fx: { ...(prevQuotes.fx || {}) } };
  const errors = [];
  let source = '';
  const results = await Promise.allSettled([fetchYahooQuote(ALT_FX_SYMBOL, undefined, { fresh }), ...list.map((a) => fetchYahooQuote(a.symbol, undefined, { fresh }))]);
  const [fxRes, ...assetRes] = results;
  if (fxRes.status === 'fulfilled') next.fx.USD = { price: fxRes.value.price, prevClose: fxRes.value.prevClose || fxRes.value.price };
  else errors.push(`USD/PLN: ${fxRes.reason?.message || 'błąd'}`);
  assetRes.forEach((r, i) => {
    const a = list[i];
    if (r.status === 'fulfilled' && r.value.price > 0) {
      next[a.id] = { price: r.value.price, prevClose: r.value.prevClose || r.value.price, currency: r.value.currency || 'USD', marketTime: r.value.marketTime || null };
      source = source || r.value.source;
    } else errors.push(`${a.label}: ${r.reason?.message || 'brak notowania'}`);
  });
  const ok = assetRes.some((r) => r.status === 'fulfilled') || fxRes.status === 'fulfilled';
  if (ok) {
    next.at = new Date().toISOString();
    next.source = source || prevQuotes.source || 'Yahoo';
  }
  return { quotes: next, errors, ok };
}

export const altQuotesStale = (state) => {
  const at = altSettings(state).quotes?.at;
  return !at || Date.now() - new Date(at).getTime() > ALT_QUOTES_TTL;
};
