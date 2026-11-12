// Ocena trafności artykułów (AI): pamięć per link na urządzeniu (`fintrack-news-relevance-v1`) – każdy artykuł
// oceniany raz; wpisy starsze niż 30 dni i nadmiar ponad 3000 usuwane. true – istotny dla inwestora, false – szum.
const KEY = 'fintrack-news-relevance-v1';
const MAX_AGE = 30 * 86400000;
const MAX = 3000;

export function readRelevance() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
export function writeRelevance(results, now = Date.now()) {
  const all = readRelevance();
  for (const [link, r] of Object.entries(results)) all[link] = { r: !!r, at: now };
  const kept = Object.entries(all)
    .filter(([, v]) => v && now - (v.at || 0) < MAX_AGE)
    .sort((a, b) => (b[1].at || 0) - (a[1].at || 0))
    .slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // brak localStorage – ocena tylko do końca sesji
  }
  return Object.fromEntries(kept);
}
