// Naliczanie odsetek konta oszczędnościowego (bez zależności od silnika – używane przez engine.js i savings.js).
// Odsetki narosłe na dziś: od początku bieżącego okresu kapitalizacji (albo od ostatniego zaksięgowania odsetek,
// jeśli było później) do dnia wyceny, od zaksięgowanego salda – netto po podatku Belki wg konta.
// Doliczane do bieżącej wartości konta (Poduszka, Majątek Całkowity), zanim bank formalnie je dopisze.
import { belkaRateForAccount } from './tax.js';

const parse = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);

// Granice okresów kapitalizacji (data dopisania odsetek). Kapitalizacja dzienna księgowana zbiorczo co miesiąc.
export function nextCapitalizationDate(iso, capitalization) {
  const d = parse(iso);
  const y = d.getFullYear();
  const m = d.getMonth();
  if (capitalization === 'YEARLY') return isoDay(new Date(y + 1, 0, 1));
  if (capitalization === 'QUARTERLY') return isoDay(new Date(y, Math.floor(m / 3) * 3 + 3, 1));
  return isoDay(new Date(y, m + 1, 1));
}

export function periodStartFor(iso, capitalization) {
  const d = parse(iso);
  const y = d.getFullYear();
  const m = d.getMonth();
  if (capitalization === 'YEARLY') return isoDay(new Date(y, 0, 1));
  if (capitalization === 'QUARTERLY') return isoDay(new Date(y, Math.floor(m / 3) * 3, 1));
  return isoDay(new Date(y, m, 1));
}

// Odsetki brutto za okres [start, end) od salda `balance`
export function grossInterest(balance, ratePct, capitalization, start, end) {
  const r = (Number(ratePct) || 0) / 100;
  const days = Math.max(0, daysBetween(start, end));
  if (balance <= 0 || r <= 0 || days === 0) return 0;
  if (capitalization === 'DAILY') return balance * (Math.pow(1 + r / 365, days) - 1);
  return balance * r * (days / 365);
}

// Odsetki narosłe (niezaksięgowane) na dzień `day`; lastPosted – data ostatniego wpisu odsetek konta (≤ day)
export function accruedSavingsInterest(account, balance, day, lastPosted = null) {
  const cap = account?.capitalization || 'MONTHLY';
  const periodStart = periodStartFor(day, cap);
  const from = lastPosted && lastPosted > periodStart && lastPosted <= day ? lastPosted : periodStart;
  const gross = grossInterest(balance, account?.interestRate, cap, from, day);
  const rate = belkaRateForAccount(account);
  return { gross, net: gross * (1 - rate), from, periodStart };
}
