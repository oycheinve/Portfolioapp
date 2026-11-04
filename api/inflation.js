// /api/inflation (GET) – odczyty inflacji CPI z tabeli Supabase inflation_rates dla aplikacji (benchmark w wykresach,
// obligacje COI/EDO). Dane publiczne; odpowiedź buforowana przez CDN (godzina, z odświeżaniem w tle).
// Zmienne: SUPABASE_URL (albo VITE_SUPABASE_URL) i SUPABASE_SERVICE_ROLE_KEY albo klucz anon (odczyt dozwolony RLS).
import { createClient } from '@supabase/supabase-js';

const env = (...names) => names.map((n) => process.env[n]).find((v) => v && String(v).trim()) || '';

export default async function handler(req, res) {
  const send = (status, body, cache = 'no-store') => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', cache);
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'GET') return send(405, { error: 'Użyj GET' });
  const url = env('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
  if (!url || !key) return send(503, { error: 'Brak konfiguracji Supabase na serwerze' });
  try {
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await sb.from('inflation_rates').select('year, month, yoy, mom, source, updated_at').gte('year', 2000).order('year').order('month').limit(2000);
    if (error) return send(/inflation_rates/.test(error.message || '') ? 404 : 500, { error: error.message });
    const rows = (data || []).map((r) => ({ year: r.year, month: r.month, yoy: r.yoy === null ? null : Number(r.yoy), mom: r.mom === null ? null : Number(r.mom), source: r.source }));
    const updatedAt = (data || []).reduce((m, r) => (r.updated_at > m ? r.updated_at : m), '') || null;
    return send(200, { rows, updatedAt }, 'public, s-maxage=3600, stale-while-revalidate=86400');
  } catch (e) {
    return send(500, { error: e.message });
  }
}
