// Esencja finansowa raportu (w przeglądarce, bez AI): z tekstu stron PDF wybiera tylko to, co potrzebne analitykowi –
// sprawozdania (rachunek zysków i strat, bilans / sytuacja finansowa, przepływy pieniężne), wybrane dane finansowe,
// komentarz zarządu do wyników i segmenty. Odrzuca spis treści, oświadczenia i podpisy, dane biegłego rewidenta,
// adresy / KRS / NIP, ład korporacyjny, zasady rachunkowości i inne „zapychacze”. Powtarzające się nagłówki i stopki
// stron, numery stron i puste wiersze są usuwane. Wynik mieści się w budżecie znaków (domyślnie ~40 tys.) – zamiast
// kilkudziesięciu stron do AI trafia kilka–kilkanaście najważniejszych, w kolejności z raportu.

const fold = (t) =>
  String(t || '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

// Sprawozdania finansowe – najwyższa waga (PL + EN)
const STATEMENTS = [
  'rachunek zyskow i strat', 'sprawozdanie z calkowitych dochodow', 'sprawozdanie z wyniku', 'skonsolidowany rachunek', 'income statement', 'statement of profit or loss', 'profit and loss',
  'bilans', 'sprawozdanie z sytuacji finansowej', 'statement of financial position', 'balance sheet',
  'przeplyw', 'rachunek przeplywow', 'cash flow', 'cash flows',
];
// Pozycje z tabel – potwierdzają, że strona to tabela wyników, a nie opis
const LINE_ITEMS = [
  'przychody ze sprzedazy', 'przychody netto', 'przychody', 'koszt wlasny', 'zysk brutto ze sprzedazy', 'zysk (strata) z dzialalnosci operacyjnej', 'zysk operacyjny', 'ebitda', 'ebit',
  'zysk netto', 'zysk (strata) netto', 'strata netto', 'zysk przed opodatkowaniem', 'podatek dochodowy', 'zysk na akcje', 'zysk na jedna akcje', 'marza',
  'aktywa razem', 'aktywa trwale', 'aktywa obrotowe', 'kapital wlasny', 'zobowiazania dlugoterminowe', 'zobowiazania krotkoterminowe', 'pasywa razem', 'dlug netto', 'zadluzenie',
  'srodki pieniezne', 'przeplywy pieniezne netto', 'z dzialalnosci operacyjnej', 'z dzialalnosci inwestycyjnej', 'z dzialalnosci finansowej', 'capex', 'naklady inwestycyjne', 'dywidend',
  'revenue', 'net profit', 'net income', 'operating profit', 'gross profit', 'total assets', 'total equity', 'net debt', 'earnings per share', 'free cash flow',
];
// Komentarz zarządu / omówienie wyników
const COMMENTARY = [
  'wybrane dane finansowe', 'kluczowe dane', 'podsumowanie wynikow', 'omowienie wynikow', 'komentarz zarzadu', 'list prezesa', 'list do akcjonariuszy', 'najwazniejsze wydarzenia', 'istotne zdarzenia',
  'wyniki finansowe', 'analiza wynikow', 'sytuacja finansowa', 'perspektyw', 'prognoz', 'segment', 'r/r', 'rdr', 'wzrost o', 'spadek o', 'lfl', 'like-for-like', 'highlights', 'key figures', 'outlook', 'guidance',
];
// Zapychacze – strony do odrzucenia
const FILLER = [
  'spis tresci', 'table of contents', 'podpis', 'oswiadczenie zarzadu', 'oswiadczenia zarzadu', 'oswiadczenie rady nadzorczej', 'bieglego rewidenta', 'bieglym rewidentem', 'firma audytorska', 'audytor', 'raport z przegladu', 'sprawozdanie niezaleznego',
  'krs', 'nip', 'regon', 'sad rejonowy', 'kapital zakladowy', 'siedziba', 'adres', 'ul. ', 'tel.', 'e-mail', 'www.',
  'lad korporacyjn', 'ladu korporacyjnego', 'dobrych praktyk', 'zasady rachunkowosci', 'polityka rachunkowosci', 'standardy rachunkowosci', 'zmiany standardow', 'oswiadczenie o stosowaniu',
  'czynniki ryzyka', 'zarzadzanie ryzykiem', 'wynagrodzenia zarzadu', 'sklad zarzadu', 'sklad rady', 'postepowania sadowe', 'informacje ogolne', 'definicje', 'slownik', 'zastrzezenie',
  'disclaimer', 'forward-looking', 'auditor', 'signatures', 'corporate governance', 'accounting policies', 'risk factors',
];

const count = (text, words) => words.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
const NUM_RE = /-?\(?\d{1,3}(?:[  .]\d{3})+(?:,\d+)?\)?|-?\d+,\d+|\b\d{4,}\b/g;

// Spis treści: wiele wierszy kończących się numerem strony (często po kropkach)
const tocLike = (lines) => {
  const tail = lines.filter((l) => /(\.{3,}|…|\s{2,})\s*\d{1,3}\s*$/.test(l) || /^\D{8,}\s\d{1,3}$/.test(l)).length;
  return lines.length >= 5 && tail / lines.length > 0.45;
};

// Ocena strony: >0 – warta wysłania; wyżej – ważniejsza
export function scorePage(text) {
  const t = fold(text);
  const lines = text.split('\n').filter((l) => l.trim());
  if (!lines.length) return -99;
  if (tocLike(lines)) return -50;
  const nums = (text.match(NUM_RE) || []).length;
  const density = nums / Math.max(1, lines.length); // tabela: kilka liczb na wiersz
  const st = count(t, STATEMENTS);
  const items = count(t, LINE_ITEMS);
  const com = count(t, COMMENTARY);
  const fill = count(t, FILLER);
  let s = st * 6 + Math.min(items, 12) * 2 + Math.min(com, 8) * 1.5 + Math.min(density, 4) * 3;
  if (items >= 4 && density >= 1) s += 10; // pełna tabela wyników
  s -= fill * 4;
  if (nums < 3 && com < 2) s -= 8; // sama proza bez liczb i bez omówienia wyników
  return s;
}

// Nagłówki / stopki powtarzające się na wielu stronach i same numery stron
function boilerplate(pages) {
  const seen = new Map();
  for (const p of pages) for (const l of new Set(p.split('\n').map((x) => x.trim()).filter(Boolean))) seen.set(l, (seen.get(l) || 0) + 1);
  const min = Math.max(3, Math.ceil(pages.length * 0.3));
  return new Set([...seen].filter(([l, n]) => n >= min && l.length < 120 && (l.match(NUM_RE) || []).length < 3).map(([l]) => l));
}
const tidy = (text, drop) =>
  text
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter((l) => l && !drop.has(l) && !/^(strona|str\.|page)?\s*\d{1,3}(\s*(z|\/|of)\s*\d{1,3})?$/i.test(l) && !/^[.\-_…\s]+$/.test(l))
    .join('\n');

/**
 * pages – tekst kolejnych stron PDF; maxChars – budżet wyniku.
 * Zwraca { text, kept: [numery stron], total, chars, rawChars }.
 */
export function reportDigest(pages, { maxChars = 40000 } = {}) {
  const drop = boilerplate(pages);
  const clean = pages.map((p, i) => ({ n: i + 1, text: tidy(p, drop) })).filter((p) => p.text);
  const rawChars = pages.reduce((n, p) => n + p.length, 0);
  const all = clean.map((p) => `[strona ${p.n}]\n${p.text}`).join('\n');
  // Krótki raport – w całości (po oczyszczeniu)
  if (all.length <= maxChars) return { text: all, kept: clean.map((p) => p.n), total: pages.length, chars: all.length, rawChars };
  const scored = clean.map((p) => ({ ...p, score: scorePage(p.text) })).filter((p) => p.score > 0);
  // Najlepsze strony w budżecie; strona tuż po sprawozdaniu (ciąg dalszy tabeli) dostaje premię od poprzedniczki
  for (let i = 1; i < scored.length; i += 1) if (scored[i].n === scored[i - 1].n + 1 && scored[i - 1].score >= 25 && scored[i].score > 5) scored[i].score += 8;
  const pick = [];
  let used = 0;
  for (const p of [...scored].sort((a, b) => b.score - a.score)) {
    const piece = Math.min(p.text.length, 9000) + 16; // bardzo długa strona – przycięta
    if (used + piece > maxChars) continue;
    pick.push(p);
    used += piece;
  }
  // Nic nie przeszło oceny (np. nietypowy układ) – początek raportu w budżecie
  if (!pick.length) return { text: all.slice(0, maxChars), kept: [], total: pages.length, chars: Math.min(all.length, maxChars), rawChars, fallback: true };
  pick.sort((a, b) => a.n - b.n);
  const text = pick.map((p) => `[strona ${p.n}]\n${p.text.slice(0, 9000)}`).join('\n');
  return { text, kept: pick.map((p) => p.n), total: pages.length, chars: text.length, rawChars };
}
