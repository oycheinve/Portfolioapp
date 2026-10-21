// Etap 2: alokacja (wagi bieżące vs docelowe), odchylenia, alerty oraz algorytm water-filling dla dopłat.
import { ASSET_CLASSES } from './constants.js';
import { fxConversionPct, fxToPLN, isoDay, livePriceLookup, resolveAccountIds, valuePortfolio } from './engine.js';

export const ALLOCATION_CLASSES = ['STOCKS', 'ETF', 'BONDS', 'CASH'];

// Cena jednostkowa w PLN: notowanie z modułu cen, a w razie jego braku cena ręczna/mock instrumentu
export function unitPricePLN(state, instrument) {
  const { quotes = {}, fx } = state.prices || {};
  const q = quotes[instrument.id];
  if (q && Number.isFinite(q.price) && q.price > 0) {
    const currency = q.currency || instrument.currency;
    return { pricePLN: q.price * fxToPLN(fx, currency), price: q.price, currency, source: 'quote' };
  }
  const manual = Number(instrument.mockPrice);
  if (Number.isFinite(manual) && manual > 0) {
    return { pricePLN: manual * fxToPLN(fx, instrument.currency), price: manual, currency: instrument.currency, source: 'manual' };
  }
  return { pricePLN: null, price: null, currency: instrument.currency, source: 'none' };
}

function sumTargets(obj) {
  return Object.values(obj || {}).reduce((s, v) => s + (Number(v) || 0), 0);
}

function deviationRow({ key, label, value, total, targetPct }) {
  const weight = total > 0 ? value / total : 0;
  const target = (Number(targetPct) || 0) / 100;
  const devPP = (weight - target) * 100;
  const devPLN = value - target * total;
  return { key, label, value, weight, target, devPP, devPLN };
}

// Pełna analiza alokacji dla zakresu kont (scope)
export function computeAllocation(state, scopeOverride) {
  const alloc = state.settings.allocation;
  const scope = scopeOverride || alloc.scope || 'INVEST';
  const accountIds = resolveAccountIds(state, scope);
  const valuation = valuePortfolio(state, { asOf: isoDay(new Date()), accountIds, priceLookup: livePriceLookup(state) });
  const t = valuation.totals;
  const threshold = Number(alloc.driftThreshold) || 0;

  // Klasy aktywów – udział w całym portfelu (bez nieruchomości)
  const classValues = { STOCKS: t.stocks, ETF: t.etf, BONDS: t.bonds, CASH: t.cash };
  const classes = ALLOCATION_CLASSES.map((key) =>
    deviationRow({ key, label: ASSET_CLASSES[key].label, value: classValues[key], total: t.total, targetPct: alloc.classTargets?.[key] }),
  );

  // Instrumenty – udział w części akcje + ETF
  // + koszty przewalutowania: zapłacone przy zakupach oraz szacunek przy sprzedaży całej pozycji
  const accountsById = Object.fromEntries(state.accounts.map((a) => [a.id, a]));
  const byInstrument = new Map();
  for (const p of valuation.positions) {
    if (!p.instrument) continue;
    const prev = byInstrument.get(p.instrumentId) || { value: 0, quantity: 0, cost: 0, fxFees: 0, fxSellFee: 0 };
    prev.value += p.value;
    prev.quantity += p.quantity;
    prev.cost += p.costPLN;
    prev.fxFees += p.fxFeesPLN || 0;
    prev.fxSellFee += p.value * fxConversionPct(accountsById[p.accountId], p.instrument);
    byInstrument.set(p.instrumentId, prev);
  }
  const sleeveValue = t.market;
  const instrumentTargets = alloc.instrumentTargets || {};
  const instruments = state.instruments
    // Tylko aktywa faktycznie posiadane (wartość > 0 zł) – bez pozycji sprzedanych, wyczyszczonych i historycznych
    .filter((inst) => (byInstrument.get(inst.id)?.value || 0) > 0.005)
    .map((inst) => {
      const held = byInstrument.get(inst.id) || { value: 0, quantity: 0, cost: 0, fxFees: 0, fxSellFee: 0 };
      return {
        ...deviationRow({ key: inst.id, label: inst.ticker, value: held.value, total: sleeveValue, targetPct: instrumentTargets[inst.id] }),
        instrument: inst,
        quantity: held.quantity,
        cost: held.cost,
        fxFees: held.fxFees,
        fxSellFee: held.fxSellFee,
        price: unitPricePLN(state, inst),
      };
    })
    .sort((a, b) => b.value - a.value || b.target - a.target);

  const classTargetSum = sumTargets(alloc.classTargets);
  const instrumentTargetSum = sumTargets(Object.fromEntries(instruments.map((i) => [i.key, instrumentTargets[i.key]])));
  const classTargetsSet = classTargetSum > 0;
  const instrumentTargetsSet = instrumentTargetSum > 0;

  const alerts = [];
  if (classTargetsSet) {
    for (const c of classes) {
      if (Math.abs(c.devPP) > threshold) alerts.push({ level: 'class', ...c });
    }
  }
  if (instrumentTargetsSet) {
    for (const i of instruments) {
      if (Math.abs(i.devPP) > threshold) alerts.push({ level: 'instrument', ...i });
    }
  }

  return {
    scope,
    accountIds,
    valuation,
    total: t.total,
    sleeveValue,
    classes,
    instruments,
    classTargetSum,
    instrumentTargetSum,
    classTargetsSet,
    instrumentTargetsSet,
    threshold,
    alerts,
  };
}

// Water-filling: alokacja kwoty C bez sprzedaży tak, by wyrównać relację wartość/waga docelowa.
// Szukamy poziomu L takiego, że Σ max(0, w_i·L − v_i) = C (funkcja monotoniczna – bisekcja).
function fillLevel(items, amount) {
  const f = (L) => items.reduce((s, it) => s + Math.max(0, it.w * L - it.v), 0);
  let lo = 0;
  let hi = items.reduce((s, it) => s + it.v, 0) + amount;
  while (f(hi) < amount) hi *= 2;
  for (let k = 0; k < 100; k += 1) {
    const mid = (lo + hi) / 2;
    if (f(mid) < amount) lo = mid;
    else hi = mid;
  }
  return items.map((it) => ({ ...it, a: Math.max(0, it.w * hi - it.v) }));
}

/**
 * Plan zakupów.
 * items: [{ id, value (PLN, bieżąca wartość pozycji), target (ułamek), pricePLN }]
 * Pozycje bez wagi docelowej wliczają się do wartości portfela, ale nie są dokupowane.
 */
export function planContribution({ items, amount, minOrder = 0, fractional = false }) {
  const C = Math.max(0, Number(amount) || 0);
  const totalBefore = items.reduce((s, it) => s + it.value, 0);
  const totalAfter = totalBefore + C;
  const targetSum = items.reduce((s, it) => s + (it.target > 0 ? it.target : 0), 0);
  const skipped = [];

  let eligible = items
    .filter((it) => it.target > 0)
    .filter((it) => {
      if (!Number.isFinite(it.pricePLN) || it.pricePLN <= 0) {
        skipped.push({ id: it.id, reason: 'Brak kursu – odśwież notowania' });
        return false;
      }
      return true;
    })
    .map((it) => ({ id: it.id, v: it.value, w: it.target / (targetSum || 1), price: it.pricePLN }));

  if (C <= 0 || eligible.length === 0) {
    return buildResult({ items, orders: [], C, skipped, totalBefore, totalAfter, targetSum });
  }
  if (minOrder > 0 && C < minOrder) {
    skipped.push({ id: null, reason: `Kwota wpłaty jest mniejsza niż minimalne zlecenie (${minOrder} zł)` });
    return buildResult({ items, orders: [], C, skipped, totalBefore, totalAfter, targetSum });
  }

  // 1) Water-filling z wykluczaniem zleceń poniżej minimum
  let alloc = [];
  for (let guard = 0; guard < 200; guard += 1) {
    const sumW = eligible.reduce((s, e) => s + e.w, 0);
    const norm = eligible.map((e) => ({ ...e, w: e.w / sumW }));
    alloc = fillLevel(norm, C);
    const tooSmall = alloc.filter((a) => a.a > 1e-9 && a.a < minOrder);
    if (tooSmall.length === 0 || eligible.length <= 1) break;
    const smallest = tooSmall.reduce((m, a) => (a.a < m.a ? a : m));
    skipped.push({ id: smallest.id, reason: `Kwota ${smallest.a.toFixed(2)} zł poniżej minimum zlecenia` });
    eligible = eligible.filter((e) => e.id !== smallest.id);
  }
  const idealById = Object.fromEntries(alloc.map((a) => [a.id, a.a]));

  // 2) Ułamkowe jednostki: kwota idealna = kwota zlecenia
  if (fractional) {
    const orders = alloc
      .filter((a) => a.a > 1e-6)
      .map((a) => ({ id: a.id, ideal: a.a, qty: Math.floor((a.a / a.price) * 1e4) / 1e4, price: a.price }))
      .filter((o) => o.qty > 0);
    return buildResult({ items, orders, C, skipped, totalBefore, totalAfter, targetSum });
  }

  // 3) Całe sztuki – zachłanne dokupowanie po jednej sztuce:
  //    a) najpierw tam, gdzie pozostała kwota idealna ≥ połowy ceny (zaokrąglanie do najbliższej sztuki),
  //    b) potem reszta gotówki do pozycji o największym niedoborze względem wagi docelowej.
  const targetById = Object.fromEntries(items.map((it) => [it.id, it.target / (targetSum || 1)]));
  const valueById = Object.fromEntries(items.map((it) => [it.id, it.value]));
  const pool = alloc.map((a) => ({ id: a.id, price: a.price }));
  const qty = Object.fromEntries(pool.map((p) => [p.id, 0]));
  let leftover = C;
  const excluded = new Set();

  const runGreedy = (scoreFn) => {
    for (let guard = 0; guard < 100000; guard += 1) {
      let best = null;
      for (const p of pool) {
        if (excluded.has(p.id) || p.price > leftover + 1e-9) continue;
        const score = scoreFn(p);
        if (score === null) continue;
        if (!best || score > best.score) best = { p, score };
      }
      if (!best) break;
      qty[best.p.id] += 1;
      leftover -= best.p.price;
    }
  };

  runGreedy((p) => {
    const remaining = (idealById[p.id] || 0) - qty[p.id] * p.price;
    return remaining >= p.price * 0.5 ? remaining : null;
  });
  const deficit = (p) => targetById[p.id] * totalAfter - (valueById[p.id] + qty[p.id] * p.price);
  const fillRest = () =>
    runGreedy((p) => {
      const d = deficit(p);
      return d >= p.price * 0.5 ? d : null;
    });
  fillRest();

  // Minimalne zlecenie: usuń za małe zlecenia i rozdysponuj zwolnioną gotówkę ponownie
  if (minOrder > 0) {
    for (let guard = 0; guard < pool.length; guard += 1) {
      const small = pool.filter((p) => !excluded.has(p.id) && qty[p.id] > 0 && qty[p.id] * p.price < minOrder);
      if (small.length === 0) break;
      for (const p of small) {
        leftover += qty[p.id] * p.price;
        qty[p.id] = 0;
        excluded.add(p.id);
        skipped.push({ id: p.id, reason: `Zlecenie poniżej minimum (${minOrder} zł)` });
      }
      fillRest();
    }
  }

  const orders = pool
    .filter((p) => qty[p.id] > 0)
    .map((p) => ({ id: p.id, ideal: idealById[p.id] || 0, qty: qty[p.id], price: p.price }));
  for (const p of pool) {
    if (qty[p.id] === 0 && (idealById[p.id] || 0) > 1e-6 && !excluded.has(p.id) && !skipped.some((s) => s.id === p.id)) {
      skipped.push({ id: p.id, reason: `Idealnie ${(idealById[p.id] || 0).toFixed(2)} zł – za mało na 1 szt. (${p.price.toFixed(2)} zł)` });
    }
  }
  return buildResult({ items, orders, C, skipped, totalBefore, totalAfter, targetSum });
}

function buildResult({ items, orders, C, skipped, totalBefore, totalAfter, targetSum }) {
  const amounts = Object.fromEntries(orders.map((o) => [o.id, o.qty * o.price]));
  const spent = orders.reduce((s, o) => s + o.qty * o.price, 0);
  const investedTotal = totalBefore + spent;
  const rows = items.map((it) => {
    const target = targetSum > 0 ? it.target / targetSum : 0;
    const before = totalBefore > 0 ? it.value / totalBefore : 0;
    const afterValue = it.value + (amounts[it.id] || 0);
    const after = investedTotal > 0 ? afterValue / investedTotal : 0;
    return { id: it.id, target, before, after, devBeforePP: (before - target) * 100, devAfterPP: (after - target) * 100 };
  });
  const maxAbs = (key) => rows.reduce((m, r) => Math.max(m, Math.abs(r[key])), 0);
  const sumSq = (key) => Math.sqrt(rows.reduce((s, r) => s + r[key] * r[key], 0));
  return {
    amount: C,
    orders: orders.map((o) => ({ ...o, amount: o.qty * o.price })).sort((a, b) => b.amount - a.amount),
    spent,
    leftover: Math.max(0, C - spent),
    skipped,
    rows,
    maxDevBefore: maxAbs('devBeforePP'),
    maxDevAfter: maxAbs('devAfterPP'),
    trackingBefore: sumSq('devBeforePP'),
    trackingAfter: sumSq('devAfterPP'),
    totalAfter,
  };
}
