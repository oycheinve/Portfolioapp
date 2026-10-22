// Logotypy spółek na karcie raportu X: domena firmy (z instrumentu lub wbudowanej listy) → ikona strony
// pobrana jako data URI (osadzona w SVG, więc eksport PNG działa). Trasy: /api/logo (serwer aplikacji),
// potem publiczne proxy CORS. Wyniki w localStorage na 30 dni; brak logo → monogram tickera.

const CACHE_KEY = 'wealth-app-logos';
const TTL_MS = 30 * 86400000;
const MISS_TTL_MS = 2 * 86400000;

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

// instrumenty → { [instrumentId]: dataUrl } (tylko znalezione logotypy)
export async function loadLogos(instruments) {
  const cache = readCache();
  const now = Date.now();
  const out = {};
  const todo = new Set();
  for (const inst of instruments) {
    const domain = logoDomainFor(inst);
    if (!domain) continue;
    const hit = cache[domain];
    if (hit && now - hit.at < (hit.data ? TTL_MS : MISS_TTL_MS)) {
      if (hit.data) out[inst.id] = hit.data;
    } else todo.add(domain);
  }
  if (todo.size) {
    await Promise.all(
      [...todo].map(async (domain) => {
        inflight[domain] ||= fetchLogoDataUrl(domain).finally(() => delete inflight[domain]);
        cache[domain] = { data: await inflight[domain], at: Date.now() };
      }),
    );
    writeCache({ ...readCache(), ...cache });
    for (const inst of instruments) {
      const data = cache[logoDomainFor(inst)]?.data;
      if (data) out[inst.id] = data;
    }
  }
  return out;
}
