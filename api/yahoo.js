// Funkcja serwerowa (Vercel): pośrednik do Yahoo Finance z tej samej domeny co aplikacja – omija blokadę CORS.
// Wywołanie: /api/yahoo?path=/v8/finance/chart/PKO.WA?range=5d&interval=1d
// Dozwolone są wyłącznie zapytania o wykresy (chart) – endpoint nie jest otwartym proxy.

const ALLOWED_PATH = /^\/v8\/finance\/chart\/[A-Za-z0-9.^=_%-]+(\?[A-Za-z0-9=&._%-]*)?$/;
const HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
};

export async function proxyYahoo(path) {
  if (!ALLOWED_PATH.test(path || '')) return { status: 400, body: JSON.stringify({ error: 'Niedozwolona ścieżka' }) };
  let last = { status: 502, body: JSON.stringify({ error: 'Brak odpowiedzi Yahoo' }) };
  for (const host of HOSTS) {
    try {
      const res = await fetch(`${host}${path}`, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
      const body = await res.text();
      if (res.ok) return { status: 200, body };
      last = { status: res.status, body };
    } catch (e) {
      last = { status: 502, body: JSON.stringify({ error: e.message }) };
    }
  }
  return last;
}

export default async function handler(req, res) {
  const path = typeof req.query?.path === 'string' ? req.query.path : new URL(req.url, 'http://localhost').searchParams.get('path') || '';
  const result = await proxyYahoo(path);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (result.status === 200) res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=600');
  res.statusCode = result.status;
  res.end(result.body);
}
