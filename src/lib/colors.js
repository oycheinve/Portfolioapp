// Paleta wykresów (kategoryczna, stała kolejność) oraz skala rozbieżna dla mapy cieplnej.

export const SERIES = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};

export function seriesColor(index, isDark) {
  const p = isDark ? SERIES.dark : SERIES.light;
  return p[index % p.length];
}

// Kolory klas aktywów – przypisane na stałe do klasy (nie do kolejności w danych)
export const ASSET_CLASS_SLOT = { STOCKS: 0, ETF: 1, BONDS: 2, CASH: 3, OTHER: 4, FREE_CASH: 5 };

export function assetClassColor(cls, isDark) {
  return seriesColor(ASSET_CLASS_SLOT[cls] ?? 7, isDark);
}

export function chartChrome(isDark) {
  return isDark
    ? { grid: '#2c2c2a', axis: '#383835', muted: '#898781', text: '#c3c2b7', surface: '#1a1a19', primary: '#f0efec' }
    : { grid: '#e1e0d9', axis: '#c3c2b7', muted: '#898781', text: '#52514e', surface: '#fcfcfb', primary: '#0b0b0b' };
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}

// Skala rozbieżna: spadek (czerwień) <- neutralna szarość -> wzrost (zieleń); nasycenie do ±maxAbs
export function divergingColor(change, isDark, maxAbs = 0.03) {
  const mid = isDark ? '#383835' : '#e1e0d9';
  const up = isDark ? '#16a34a' : '#15803d';
  const down = isDark ? '#dc2626' : '#c42b2b';
  if (!Number.isFinite(change)) return mid;
  const t = Math.min(1, Math.abs(change) / maxAbs);
  const eased = Math.pow(t, 0.75);
  return mix(mid, change >= 0 ? up : down, eased);
}

export function readableTextOn(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.35 ? '#0b0b0b' : '#ffffff';
}
