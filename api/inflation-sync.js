// /api/inflation-sync – pobranie miesięcznych wskaźników inflacji CPI (GUS) i zapis w tabeli Supabase inflation_rates.
// Wywołania: Vercel Cron (GET z „Authorization: Bearer <CRON_SECRET>”, vercel.json), pg_cron (?secret=<CRON_SECRET>)
// albo zalogowany użytkownik z Ustawień („Pobierz z GUS teraz”, token sesji Supabase). ?dry=1 – podgląd bez zapisu.
// Źródła: 1) GUS – plik „Miesięczne wskaźniki cen towarów i usług konsumpcyjnych od 1982 roku” (CSV; adres można
// nadpisać zmienną GUS_CPI_CSV_URL), 2) zapasowo Eurostat HICP dla Polski (uzupełnia tylko brakujące miesiące).
// Zmienne: SUPABASE_URL (albo VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET; opcjonalnie GUS_CPI_CSV_URL.
import { createClient } from '@supabase/supabase-js';
import { mergeRows, monthKeyOf, parseEurostat, parseGusCsv } from '../src/lib/inflation.js';

export const config = { maxDuration: 60 };

const env = (...names) => names.map((n) => process.env[n]).find((v) => v && String(v).trim()) || '';
const GUS_CSV = [
  'https://stat.gov.pl/download/gfx/portalinformacyjny/pl/defaultstronaopisowa/4741/1/1/miesieczne_wskazniki_cen_towarow_i_uslug_konsumpcyjnych_od_1982_roku.csv',
];
const EUROSTAT = (dataset, coicop) =>
  `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${dataset}?format=JSON&lang=EN&geo=PL&${coicop}&sinceTimePeriod=2000-01`;
const FROM_YEAR = 2000;
const HEADERS = { 'User-Agent': 'FinTrack/1.0 (inflation sync)', Accept: 'text/csv,application/json,*/*' };

async function getText(url) {
  const res = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  // Pliki GUS bywają w UTF-8 albo Windows-1250
  const utf = new TextDecoder('utf-8').decode(buf);
  return /�/.test(utf) ? new TextDecoder('windows-1250').decode(buf) : utf;
}

export async function fetchGus(log) {
  const urls = [env('GUS_CPI_CSV_URL'), ...GUS_CSV].filter(Boolean);
  for (const url of urls) {
    try {
      const rows = parseGusCsv(await getText(url)).filter((r) => r.year >= FROM_YEAR);
      log.push(`GUS ${url.split('/').pop()}: ${rows.length} miesięcy`);
      if (rows.length >= 12) return rows;
    } catch (e) {
      log.push(`GUS ${url.split('/').pop()}: ${e.message}`);
    }
  }
  return [];
}

export async function fetchEurostat(log) {
  for (const coicop of ['coicop=CP00', 'coicop18=TOTAL']) {
    try {
      const [yoy, mom] = await Promise.all([getText(EUROSTAT('prc_hicp_manr', coicop)), getText(EUROSTAT('prc_hicp_mmor', coicop))]);
      const rows = mergeRows(parseEurostat(JSON.parse(yoy), 'yoy'), parseEurostat(JSON.parse(mom), 'mom'));
      log.push(`Eurostat HICP (${coicop}): ${rows.length} miesięcy`);
      if (rows.length) return rows;
    } catch (e) {
      log.push(`Eurostat HICP (${coicop}): ${e.message}`);
    }
  }
  return [];
}

async function authorized(req, url, key) {
  const secret = env('CRON_SECRET');
  const bearer = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const qs = new URL(req.url || '/', 'http://x').searchParams.get('secret');
  if (secret && (bearer === secret || qs === secret)) return true;
  if (!bearer || !url || !key) return false;
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getUser(bearer);
  return !error && !!data?.user;
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

// Zapis: dane GUS nadpisują wiersze nieoznaczone jako ręczne; dane zapasowe (Eurostat) tylko uzupełniają brakujące
export async function syncInflation({ sb, dry = false, fetchers = {} }) {
  const log = [];
  const gus = await (fetchers.gus || fetchGus)(log);
  const fallback = gus.length ? [] : await (fetchers.eurostat || fetchEurostat)(log);
  const fetched = gus.length ? gus : fallback;
  if (!fetched.length) return { ok: false, error: 'Nie udało się pobrać danych o inflacji z GUS ani ze źródła zapasowego', log };
  const { data: existing, error } = await sb.from('inflation_rates').select('year, month, yoy, mom, source, is_manual');
  if (error) throw new Error(/inflation_rates/.test(error.message || '') ? 'brak tabeli inflation_rates – uruchom supabase/inflation_rates.sql' : error.message);
  const byKey = new Map((existing || []).map((r) => [monthKeyOf(r.year, r.month), r]));
  const now = new Date().toISOString();
  const upserts = [];
  for (const r of fetched) {
    const prev = byKey.get(monthKeyOf(r.year, r.month));
    if (prev?.is_manual) continue;
    if (!gus.length && prev) continue; // źródło zapasowe nie zastępuje istniejących odczytów
    const yoy = r.yoy ?? (prev ? Number(prev.yoy) : null);
    const mom = r.mom ?? (prev ? Number(prev.mom) : null);
    const same = prev && Number(prev.yoy) === yoy && (prev.mom === null ? mom === null : Number(prev.mom) === mom) && prev.source === r.source;
    if (same) continue;
    upserts.push({ year: r.year, month: r.month, yoy: Number.isFinite(yoy) ? yoy : null, mom: Number.isFinite(mom) ? mom : null, source: r.source, updated_at: now });
  }
  if (!dry && upserts.length) {
    for (let i = 0; i < upserts.length; i += 500) {
      const { error: e2 } = await sb.from('inflation_rates').upsert(upserts.slice(i, i + 500), { onConflict: 'year,month' });
      if (e2) throw new Error(e2.message);
    }
  }
  const last = fetched.at(-1);
  return { ok: true, source: fetched[0].source, months: fetched.length, latest: monthKeyOf(last.year, last.month), latestYoy: last.yoy, written: dry ? 0 : upserts.length, pending: upserts.length, dry, log };
}

export default async function handler(req, res) {
  const url = env('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return send(res, 503, { error: 'Brak konfiguracji serwera (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)' });
  try {
    if (!(await authorized(req, url, key))) return send(res, 401, { error: 'Brak uprawnień (CRON_SECRET albo zalogowany użytkownik)' });
    const dry = new URL(req.url || '/', 'http://x').searchParams.get('dry') === '1';
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const out = await syncInflation({ sb, dry });
    return send(res, out.ok ? 200 : 502, out);
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
}
