// Funkcja serwerowa (Vercel): logotyp spółki (ikona strony) z tej samej domeny co aplikacja – bez blokady CORS,
// więc karta raportu może osadzić logo jako data URI i wyeksportować PNG. Wywołanie: /api/logo?domain=lpp.com
// Dozwolona jest wyłącznie nazwa domeny – endpoint nie jest otwartym proxy.

const DOMAIN = /^(?=.{3,100}$)([a-z0-9-]+\.)+[a-z]{2,}$/i;
const SOURCES = [
  (d) => `https://www.google.com/s2/favicons?domain=${d}&sz=128`,
  (d) => `https://icons.duckduckgo.com/ip3/${d}.ico`,
];

export async function fetchLogo(domain) {
  if (!DOMAIN.test(domain || '')) return { status: 400, type: 'text/plain', body: Buffer.from('Niedozwolona domena') };
  for (const src of SOURCES) {
    try {
      const res = await fetch(src(domain), { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) });
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !/^image\//.test(type)) continue;
      const body = Buffer.from(await res.arrayBuffer());
      // Domyślna „globusowa” ikona Google dla nieznanych domen jest bardzo mała – pomijana
      if (body.length < 200) continue;
      return { status: 200, type, body };
    } catch {
      // kolejne źródło
    }
  }
  return { status: 404, type: 'text/plain', body: Buffer.from('Brak logo') };
}

export default async function handler(req, res) {
  const domain = typeof req.query?.domain === 'string' ? req.query.domain : new URL(req.url, 'http://localhost').searchParams.get('domain') || '';
  const result = await fetchLogo(domain);
  res.setHeader('Content-Type', result.type);
  if (result.status === 200) res.setHeader('Cache-Control', 's-maxage=604800, stale-while-revalidate=2592000');
  res.statusCode = result.status;
  res.end(result.body);
}
