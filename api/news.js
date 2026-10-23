// Funkcja serwerowa (Vercel): wiadomości giełdowe dla spółki / tematu.
// Wywołanie: /api/news?q=LPP&symbol=LPP.WA
// Źródła: Google News RSS (po polsku) oraz – gdy podano symbol – wyszukiwarka Yahoo Finance (news).
// Wynik: { items: [{ title, link, pubDate, source }], errors } posortowane od najnowszych.

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/rss+xml,application/xml,application/json,text/xml,*/*',
  'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8',
};
const LIMIT = 30;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(text) {
  return String(text || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : '';
};

// RSS Google News → [{ title, link, pubDate, source }]; tytuł bez dopisku „ - Portal”
export function parseGoogleRss(xml) {
  const items = [];
  for (const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const it = m[1];
    const source = tag(it, 'source');
    let title = tag(it, 'title');
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const link = tag(it, 'link');
    const date = new Date(tag(it, 'pubDate'));
    if (!title || !/^https?:\/\//.test(link)) continue;
    items.push({ title, link, pubDate: Number.isNaN(date.getTime()) ? null : date.toISOString(), source: source || 'Google News' });
  }
  return items;
}

export function parseYahooNews(json) {
  return (json?.news || [])
    .filter((n) => n?.title && /^https?:\/\//.test(n.link || ''))
    .map((n) => ({
      title: decode(n.title),
      link: n.link,
      pubDate: Number.isFinite(n.providerPublishTime) ? new Date(n.providerPublishTime * 1000).toISOString() : null,
      source: n.publisher || 'Yahoo Finance',
    }));
}

async function get(url) {
  const res = await fetch(url, { headers: HEADERS, cache: 'no-store', signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const norm = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export async function fetchNews(query, symbol) {
  const q = String(query || '').trim().slice(0, 120);
  if (!q) return { status: 400, body: { items: [], errors: ['Brak zapytania'] } };
  const sym = /^[A-Za-z0-9.^=-]{1,20}$/.test(symbol || '') ? symbol : null;
  const errors = [];
  const tasks = [
    get(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=pl&gl=PL&ceid=PL:pl`)
      .then(parseGoogleRss)
      .catch((e) => {
        errors.push(`Google News: ${e.message}`);
        return [];
      }),
  ];
  if (sym) {
    tasks.push(
      get(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sym)}&quotesCount=0&newsCount=10`)
        .then((t) => parseYahooNews(JSON.parse(t)))
        .catch((e) => {
          errors.push(`Yahoo: ${e.message}`);
          return [];
        }),
    );
  }
  const seen = new Set();
  const items = (await Promise.all(tasks))
    .flat()
    .filter((it) => {
      const k = norm(it.title);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (b.pubDate || '').localeCompare(a.pubDate || ''))
    .slice(0, LIMIT);
  return { status: items.length || !errors.length ? 200 : 502, body: { items, errors } };
}

export default async function handler(req, res) {
  const params = req.query && typeof req.query.q === 'string' ? req.query : Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
  const result = await fetchNews(params.q, params.symbol);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', result.status === 200 ? 's-maxage=300, stale-while-revalidate=300' : 'no-store');
  res.statusCode = result.status;
  res.end(JSON.stringify(result.body));
}
