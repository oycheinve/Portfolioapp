// Logotypy spółek na karcie raportu X. Kolejność: 1) ręczny słownik LOGO_DICTIONARY (ticker → adres grafiki) –
// obowiązkowy dla instrumentów z portfela; 2) domena firmy (z instrumentu lub wbudowanej listy) → ikona strony;
// 3) monogram tickera. Grafika pobierana jako data URI (osadzona w SVG, więc eksport PNG działa): pliki aplikacji
// z /logos/ bezpośrednio, adresy zewnętrzne przez /api/logo (serwer aplikacji) lub publiczne proxy CORS.
// Wyniki z zewnętrznych adresów w localStorage na 30 dni.

const CACHE_KEY = 'wealth-app-logos';
const TTL_MS = 30 * 86400000;
const MISS_TTL_MS = 2 * 86400000;

const favicon = (domain) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
const ISHARES = { url: '/logos/ishares.png' };

// Ręczny słownik logotypów instrumentów z portfela (ticker bez końcówki giełdy → grafika).
// url – adres grafiki (pliki w public/logos lub zewnętrzny); fit – 'slice' (wypełnij koło) / 'meet' (cała grafika);
// bg – tło koła dla grafik prostokątnych.
export const LOGO_DICTIONARY = {
  // GPW
  DIG: { url: '/logos/dig.png', fit: 'slice' },
  CBF: { url: '/logos/cbf.png', fit: 'meet', bg: '#FFD200' },
  LPP: { url: favicon('lpp.com') },
  XTB: { url: favicon('xtb.com') },
  SNT: { url: favicon('synektik.com.pl') },
  KTY: { url: favicon('grupakety.com') },
  KRU: { url: favicon('kruk.eu') },
  ACP: { url: favicon('asseco.com') },
  DIA: { url: favicon('diag.pl') },
  NEU: { url: favicon('neuca.pl') },
  PZU: { url: favicon('pzu.pl') },
  PKO: { url: favicon('pkobp.pl') },
  PKN: { url: favicon('orlen.pl') },
  CDR: { url: favicon('cdprojekt.com') },
  DNP: { url: favicon('grupadino.pl') },
  // ETF-y iShares
  CSPX: { ...ISHARES, fit: 'slice' },
  EIMI: { ...ISHARES, fit: 'slice' },
  IWDA: { ...ISHARES, fit: 'slice' },
  SXR8: { ...ISHARES, fit: 'slice' },
  EUNL: { ...ISHARES, fit: 'slice' },
  // Pozostałe
  VWCE: { url: favicon('vanguard.com') },
  VWRA: { url: favicon('vanguard.com') },
  ETFBW20TR: { url: favicon('betaetf.pl') },
  CTRE: { url: favicon('caretrustreit.com') },
};

export function dictionaryLogoFor(instrument) {
  const ticker = String(instrument?.ticker || '').toUpperCase().replace(/\..*$/, '');
  return LOGO_DICTIONARY[ticker] || null;
}

// Najpopularniejsze spółki GPW i zagraniczne (ticker bez końcówki giełdy → domena)
const TICKER_DOMAINS = {
  PKO: 'pkobp.pl',
  PZU: 'pzu.pl',
  PEO: 'pekao.com.pl',
  KGH: 'kghm.com',
  PKN: 'orlen.pl',
  CDR: 'cdprojekt.com',
  LPP: 'lpp.com',
  DNP: 'grupadino.pl',
  ALE: 'allegro.eu',
  XTB: 'xtb.com',
  KRU: 'kruk.eu',
  ACP: 'asseco.com',
  DIA: 'diag.pl',
  KTY: 'grupakety.com',
  SNT: 'synektik.com.pl',
  CBF: 'cyberfolks.pl',
  SPL: 'santander.pl',
  MBK: 'mbank.pl',
  ING: 'ing.pl',
  MIL: 'bankmillennium.pl',
  ALR: 'aliorbank.pl',
  BHW: 'citibank.pl',
  OPL: 'orange.pl',
  CPS: 'grupapolsat.pl',
  PGE: 'gkpge.pl',
  TPE: 'tauron.pl',
  ENA: 'enea.pl',
  JSW: 'jsw.pl',
  BDX: 'budimex.pl',
  PCO: 'pepco.eu',
  ZAB: 'zabka.pl',
  NEU: 'neuca.pl',
  CCC: 'ccc.eu',
  ATT: 'grupaazoty.com',
  LWB: 'lw.com.pl',
  AMC: 'amica.pl',
  TXT: 'text.com',
  ASB: 'asbis.com',
  DOM: 'domd.pl',
  GPW: 'gpw.pl',
  '11B': '11bitstudios.com',
  PLW: 'playway.com',
  TEN: 'tsgames.pl',
  HUG: 'huuuge.com',
  MBR: 'mo-bruk.pl',
  AAPL: 'apple.com',
  MSFT: 'microsoft.com',
  NVDA: 'nvidia.com',
  GOOGL: 'google.com',
  GOOG: 'google.com',
  AMZN: 'amazon.com',
  META: 'meta.com',
  TSLA: 'tesla.com',
  NFLX: 'netflix.com',
  KO: 'coca-cola.com',
  PEP: 'pepsico.com',
  JNJ: 'jnj.com',
  V: 'visa.com',
  MA: 'mastercard.com',
  JPM: 'jpmorganchase.com',
  O: 'realtyincome.com',
  CTRE: 'caretrustreit.com',
  ASML: 'asml.com',
};

// ETF-y: logo emitenta (po nazwie albo znanym tickerze)
const ETF_ISSUERS = [
  [/ishares|^(CSPX|IWDA|EIMI|SXR8|EUNL|IS3N|CNDX|IUSQ|SSAC|IUIT|IBTS|IGLN)$/i, 'ishares.com'],
  [/vanguard|^(VWCE|VWRA|VWRL|VUSA|VUAA|VFEM|VEVE|VHYL|VAGF)$/i, 'vanguard.com'],
  [/xtrackers|^(XDWD|XDEM|XMME|XDWT)$/i, 'dws.com'],
  [/amundi/i, 'amundi.com'],
  [/spdr/i, 'ssga.com'],
  [/invesco|^EQQQ$/i, 'invesco.com'],
  [/beta|^ETFB/i, 'betaetf.pl'],
];

export function logoDomainFor(instrument) {
  if (!instrument) return null;
  const own = String(instrument.logoDomain || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  if (own) return own.toLowerCase();
  const ticker = String(instrument.ticker || '').toUpperCase().replace(/\..*$/, '');
  if (TICKER_DOMAINS[ticker]) return TICKER_DOMAINS[ticker];
  if (instrument.kind === 'ETF') {
    for (const [re, domain] of ETF_ISSUERS) if (re.test(ticker) || re.test(instrument.name || '')) return domain;
  }
  return null;
}

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // brak miejsca – logotypy będą pobierane ponownie
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

async function fetchImage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    if (!/^image\//.test(blob.type) || blob.size < 200) throw new Error('to nie jest logo');
    return await blobToDataUrl(blob);
  } finally {
    clearTimeout(timer);
  }
}

// Grafika ze słownika: plik aplikacji – bezpośrednio; adres zewnętrzny – bezpośrednio (gdy serwer pozwala na CORS),
// przez serwer aplikacji albo publiczne proxy
async function fetchUrlDataUrl(url) {
  const routes = url.startsWith('/')
    ? [url]
    : [url, `/api/logo?url=${encodeURIComponent(url)}`, `https://corsproxy.io/?url=${encodeURIComponent(url)}`, `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`];
  for (const r of routes) {
    try {
      return await fetchImage(r);
    } catch {
      // następna trasa
    }
  }
  return null;
}

async function fetchLogoDataUrl(domain) {
  const google = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  const routes = [`/api/logo?domain=${encodeURIComponent(domain)}`, `https://corsproxy.io/?url=${encodeURIComponent(google)}`, `https://api.allorigins.win/raw?url=${encodeURIComponent(google)}`];
  for (const url of routes) {
    try {
      return await fetchImage(url);
    } catch {
      // następna trasa
    }
  }
  return null;
}

const inflight = {};

// Źródło logo instrumentu: słownik (obowiązkowo, gdy ticker w nim jest) albo domena
function logoSource(inst) {
  const dict = dictionaryLogoFor(inst);
  if (dict) return { key: `url:${dict.url}`, load: () => fetchUrlDataUrl(dict.url), fit: dict.fit || 'meet', bg: dict.bg || '#ffffff', local: dict.url.startsWith('/') };
  const domain = logoDomainFor(inst);
  if (!domain) return null;
  return { key: domain, load: () => fetchLogoDataUrl(domain), fit: 'meet', bg: '#ffffff', local: false };
}

// instrumenty → { [instrumentId]: { href (data URI), fit, bg } } (tylko znalezione logotypy)
export async function loadLogos(instruments) {
  const cache = readCache();
  const now = Date.now();
  const out = {};
  const sources = new Map();
  const todo = new Map();
  for (const inst of instruments) {
    const src = logoSource(inst);
    if (!src) continue;
    sources.set(inst.id, src);
    const hit = !src.local && cache[src.key];
    if (hit && now - hit.at < (hit.data ? TTL_MS : MISS_TTL_MS)) {
      if (hit.data) out[inst.id] = { href: hit.data, fit: src.fit, bg: src.bg };
    } else todo.set(src.key, src);
  }
  if (todo.size) {
    const fresh = {};
    await Promise.all(
      [...todo.values()].map(async (src) => {
        inflight[src.key] ||= src.load().finally(() => delete inflight[src.key]);
        fresh[src.key] = { data: await inflight[src.key], at: Date.now(), local: src.local };
      }),
    );
    // Pliki aplikacji nie trafiają do pamięci podręcznej (zawsze aktualne, ładują się natychmiast)
    writeCache({ ...readCache(), ...Object.fromEntries(Object.entries(fresh).filter(([, v]) => !v.local).map(([k, v]) => [k, { data: v.data, at: v.at }])) });
    for (const [id, src] of sources) {
      const data = fresh[src.key]?.data;
      if (data && !out[id]) out[id] = { href: data, fit: src.fit, bg: src.bg };
    }
  }
  return out;
}
