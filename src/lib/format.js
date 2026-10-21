const plnFormatter = new Intl.NumberFormat('pl-PL', {
  style: 'currency',
  currency: 'PLN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const plnCompact = new Intl.NumberFormat('pl-PL', {
  style: 'currency',
  currency: 'PLN',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatPLN(value, { compact = false, sign = false } = {}) {
  const v = Number.isFinite(value) ? value : 0;
  const text = compact ? plnCompact.format(v) : plnFormatter.format(v);
  if (sign && v > 0) return `+${text}`;
  return text;
}

export function formatMoney(value, currency = 'PLN', digits = 2) {
  const v = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);
}

// Krótki format osi wykresów: 950 · 12 tys. · 1,2 mln
export function formatAxisPLN(value) {
  const v = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${(v / 1e6).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} mln`;
  if (abs >= 1e3) return `${Math.round(v / 1e3).toLocaleString('pl-PL')} tys.`;
  return Math.round(v).toLocaleString('pl-PL');
}

export function formatPercent(value, { digits = 2, sign = false } = {}) {
  if (!Number.isFinite(value)) return '—';
  const text = new Intl.NumberFormat('pl-PL', {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
  if (sign && value > 0) return `+${text}`;
  return text;
}

export function formatNumber(value, digits = 2) {
  const v = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(v);
}

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function toISODate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO() {
  return toISODate(new Date());
}

export function signClass(value) {
  if (!Number.isFinite(value) || Math.abs(value) < 1e-9) return 'text-stone-500 dark:text-stone-400';
  return value > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
