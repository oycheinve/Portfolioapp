// Kategorie listy zakupów: AI (ten sam punkt /api/news-summary, tryb „shopping” – kolejka, modele zapasowe)
// przypisuje produkt do kategorii sklepowej; wynik zapamiętany per nazwa produktu w kluczu `wealth-app-shopping-cats-v1`
// (synchronizowany z chmurą jak ustawienia UI) – raz rozpoznany produkt nie wymaga kolejnego zapytania.
// Do czasu odpowiedzi AI (albo bez dostępu do AI) – szybkie dopasowanie ze słownika.
export const CATS_KEY = 'wealth-app-shopping-cats-v1';

// Kolejność jak przy chodzeniu po sklepie
export const SHOPPING_CATEGORIES = [
  { id: 'Warzywa i owoce', emoji: '🥕' },
  { id: 'Pieczywo', emoji: '🥖' },
  { id: 'Nabiał i jajka', emoji: '🥛' },
  { id: 'Mięso i ryby', emoji: '🥩' },
  { id: 'Wędliny', emoji: '🥓' },
  { id: 'Mrożonki', emoji: '🧊' },
  { id: 'Produkty sypkie i makarony', emoji: '🍝' },
  { id: 'Przyprawy', emoji: '🧂' },
  { id: 'Konserwy i przetwory', emoji: '🥫' },
  { id: 'Słodycze i przekąski', emoji: '🍫' },
  { id: 'Napoje', emoji: '🧃' },
  { id: 'Chemia gospodarcza', emoji: '🧴' },
  { id: 'Kosmetyki i higiena', emoji: '🪥' },
  { id: 'Dla dziecka', emoji: '🍼' },
  { id: 'Dla zwierząt', emoji: '🐾' },
  { id: 'Apteka', emoji: '💊' },
  { id: 'Dom i inne', emoji: '🏠' },
];
export const OTHER = 'Dom i inne';
const VALID = new Set(SHOPPING_CATEGORIES.map((c) => c.id));

export const normProduct = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Słownik (początki słów) – natychmiastowe przypisanie, zanim odpowie AI
const DICT = [
  ['Przyprawy', ['sól', 'sol ', 'pieprz', 'papryka słodka', 'papryka ostra', 'papryka mielona', 'oregano', 'bazylia susz', 'majeranek', 'kminek', 'cynamon', 'kurkuma', 'curry', 'liść laurowy', 'liscie laurowe', 'ziele angielskie', 'przyprawa', 'vegeta', 'czosnek granulowany', 'gałka muszkatołowa', 'imbir mielony', 'tymianek', 'rozmaryn']],
  ['Kosmetyki i higiena', ['pasta do zębów', 'pasta do zebow', 'szczoteczka', 'szampon', 'odżywka do włosów', 'mydło', 'mydlo', 'żel pod prysznic', 'zel pod prysznic', 'dezodorant', 'antyperspirant', 'krem', 'balsam', 'maszynk', 'pianka do golenia', 'podpaski', 'tampony', 'płyn do ust', 'nić dentystyczna', 'patyczki', 'chusteczki', 'waciki']],
  ['Chemia gospodarcza', ['płyn do', 'plyn do', 'kapsułki do prania', 'kapsulki', 'proszek do prania', 'żel do prania', 'domestos', 'ludwik', 'fairy', 'worki na śmieci', 'worki na smieci', 'papier toaletowy', 'ręczniki papierowe', 'reczniki papierowe', 'gąbki', 'gabki', 'zmywak', 'tabletki do zmywarki', 'odplamiacz', 'cif', 'domestos', 'vanish', 'lenor', 'perwoll', 'odkamieniacz', 'folia aluminiowa', 'folia spożywcza']],
  ['Warzywa i owoce', ['pomidor', 'ogór', 'ogor', 'banan', 'jabłk', 'jablk', 'gruszk', 'cytryn', 'pomarańcz', 'pomarancz', 'mandaryn', 'winogron', 'truskawk', 'malin', 'borówk', 'borowk', 'ziemniak', 'marchew', 'marchewk', 'cebul', 'czosnek', 'sałat', 'salat', 'kapust', 'brokuł', 'brokul', 'kalafior', 'pietruszk', 'koperek', 'szczypior', 'papryka czerwona', 'papryka zielona', 'papryka żółta', 'papryk', 'awokado', 'kiwi', 'cukini', 'dyni', 'burak', 'seler', 'por ', 'rzodkiew', 'pieczark', 'grzyby', 'arbuz', 'melon', 'ananas', 'mango', 'śliwk', 'sliwk', 'brzoskwin', 'nektaryn', 'szpinak', 'rukola', 'imbir']],
  ['Pieczywo', ['chleb', 'bułk', 'bulk', 'bagietk', 'rogal', 'kajzerk', 'grahamk', 'tortill', 'pieczywo', 'chałk', 'drożdżówk']],
  ['Nabiał i jajka', ['mleko', 'jogurt', 'kefir', 'maślank', 'smietan', 'śmietan', 'ser ', 'serek', 'twaróg', 'twarog', 'masło', 'maslo', 'jajk', 'jaja', 'mozzarell', 'parmezan', 'feta', 'skyr', 'margaryn']],
  ['Mięso i ryby', ['kurczak', 'filet', 'pierś z', 'piers z', 'udka', 'mięso', 'mieso', 'mielone', 'wołow', 'wolow', 'wieprzow', 'schab', 'karkówk', 'karkowk', 'łosoś', 'losos', 'dorsz', 'ryba', 'krewetk', 'indyk', 'żeberk', 'zeberk']],
  ['Wędliny', ['szynk', 'kiełbas', 'kielbas', 'parówk', 'parowk', 'salami', 'boczek', 'wędlin', 'wedlin', 'kabanos', 'pasztet']],
  ['Mrożonki', ['mrożon', 'mrozon', 'lody', 'frytki', 'pizza mrożona', 'pierogi mrożone']],
  ['Produkty sypkie i makarony', ['makaron', 'spaghetti', 'ryż', 'ryz', 'mąka', 'maka', 'kasza', 'płatki', 'platki', 'cukier', 'musli', 'owsian', 'bułka tarta', 'kuskus', 'soczewic', 'fasola sucha', 'groch']],
  ['Konserwy i przetwory', ['konserw', 'pomidory w puszce', 'passata', 'koncentrat', 'ketchup', 'majonez', 'musztard', 'dżem', 'dzem', 'miód', 'miod', 'kukurydza', 'groszek', 'tuńczyk', 'tunczyk', 'oliwki', 'ogórki konserwowe', 'sos ', 'olej', 'oliwa', 'ocet']],
  ['Słodycze i przekąski', ['czekolad', 'ciastk', 'chips', 'paluszki', 'baton', 'cukierk', 'żelk', 'zelk', 'orzech', 'nutella', 'wafel', 'krakers', 'popcorn', 'herbatnik']],
  ['Napoje', ['woda', 'sok', 'cola', 'pepsi', 'piwo', 'wino', 'kawa', 'herbata', 'napój', 'napoj', 'oranżad', 'lemoniad', 'energetyk', 'kakao']],
  ['Dla dziecka', ['pieluch', 'chusteczki nawilżane', 'kaszka', 'mleko modyfikowane', 'słoiczek', 'sloiczek']],
  ['Dla zwierząt', ['karma', 'żwirek', 'zwirek', 'przysmaki dla', 'dla psa', 'dla kota']],
  ['Apteka', ['tabletki przeciw', 'paracetamol', 'ibuprofen', 'apap', 'witamin', 'plastry', 'syrop', 'krople do']],
];

// Dopasowanie tylko do początku nazwy (rzeczownik główny: „kombucha imbirowa” to napój, nie imbir);
// dłuższe frazy pierwsze („papryka słodka” → przyprawy przed „papryka” → warzywa)
// Krótkie słowa (≤ 3 litery, np. ser, sól, sok) i hasła ze spacją na końcu – tylko całe słowo („serwetki” ≠ „ser”)
const DICT_FLAT = DICT.flatMap(([cat, words]) => words.map((w) => ({ w: w.trim(), cat, whole: w.endsWith(' ') || w.trim().length <= 3 }))).sort((a, b) => b.w.length - a.w.length);
export function guessCategory(title) {
  const t = normProduct(title);
  for (const { w, cat, whole } of DICT_FLAT) if (t === w || t.startsWith(whole ? `${w} ` : w)) return cat;
  return null;
}

// ── Ucząca się pamięć produktów ──
// Wpis: { c: kategoria, n: nazwa do wyświetlenia, u: liczba dodań, t: ostatnie dodanie (ms), s: źródło 'ai' | 'dict' | 'learned' }.
// Zgodność wstecz: dawne wpisy w postaci samej nazwy kategorii (string) są odczytywane jako { c }.
export function readCats() {
  try {
    const v = JSON.parse(localStorage.getItem(CATS_KEY) || '{}');
    if (!v || typeof v !== 'object') return {};
    const out = {};
    for (const [k, e] of Object.entries(v)) {
      if (typeof e === 'string') out[k] = { c: e, n: k, u: 0, t: 0, s: 'ai' };
      else if (e && typeof e === 'object') out[k] = { n: k, u: 0, t: 0, ...e };
    }
    return out;
  } catch {
    return {};
  }
}
export function writeCats(map) {
  try {
    // najwyżej 1000 produktów – najrzadziej / najdawniej używane odpadają pierwsze
    const entries = Object.entries(map)
      .sort((a, b) => (b[1].u || 0) - (a[1].u || 0) || (b[1].t || 0) - (a[1].t || 0))
      .slice(0, 1000);
    localStorage.setItem(CATS_KEY, JSON.stringify(Object.fromEntries(entries)));
    window.dispatchEvent(new CustomEvent('wealth-app-prefs-changed', { detail: { key: CATS_KEY } }));
  } catch {
    // brak localStorage – pamięć tylko do końca sesji
  }
}

// Nauczone słowa kluczowe: znany produkt, którego nazwa jest początkiem nowej („pomidory” → „pomidory koktajlowe”),
// albo ten sam pierwszy wyraz (min. 4 litery) u kilku znanych produktów jednej kategorii
function learnedCategory(key, mem) {
  let best = null;
  for (const [k, e] of Object.entries(mem)) {
    if (!e.c || !VALID.has(e.c) || k === key) continue;
    if (key.startsWith(`${k} `) && (!best || k.length > best.k.length)) best = { k, c: e.c };
  }
  if (best) return best.c;
  const first = key.split(' ')[0];
  if (first.length < 4 || first === key) return null;
  const cats = new Set(Object.entries(mem).filter(([k, e]) => e.c && k.split(' ')[0] === first).map(([, e]) => e.c));
  return cats.size === 1 ? [...cats][0] : null;
}

// Rozpoznanie lokalne (koszt AI = 0): pamięć → nauczone słowo kluczowe → słownik; null – produkt nowy (pytamy AI)
export function resolveLocal(title, mem) {
  const key = normProduct(title);
  if (!key) return null;
  const e = mem[key];
  if (e?.c && VALID.has(e.c)) return { category: e.c, source: 'memory' };
  const l = learnedCategory(key, mem);
  if (l) return { category: l, source: 'learned' };
  const g = guessCategory(title);
  return g ? { category: g, source: 'dict' } : null;
}

// Zapis do pamięci (kategoria i / lub użycie); zwraca nową mapę
export function remember(mem, title, { category, source, used = false } = {}) {
  const key = normProduct(title);
  if (!key) return mem;
  const prev = mem[key] || { n: String(title).trim(), u: 0, t: 0 };
  const next = { ...prev, n: prev.n || String(title).trim() };
  if (category && VALID.has(category) && (source === 'ai' || !prev.c)) {
    next.c = category;
    next.s = source;
  }
  if (used) {
    next.u = (prev.u || 0) + 1;
    next.t = Date.now();
  }
  return { ...mem, [key]: next };
}

// Podpowiedzi od 3 znaków: produkty z pamięci (z kategorią); najpierw początek nazwy, potem częstość i świeżość
export function suggestProducts(mem, query, { exclude = new Set(), limit = 6 } = {}) {
  const q = normProduct(query);
  if (q.length < 3) return [];
  const out = [];
  for (const [k, e] of Object.entries(mem)) {
    if (exclude.has(k) || k === q) continue;
    const idx = k.indexOf(q);
    if (idx < 0) continue;
    const r = resolveLocal(e.n || k, mem);
    out.push({ key: k, name: e.n || k, category: r?.category || null, rank: (idx === 0 ? 0 : k.includes(` ${q}`) ? 1 : 2), u: e.u || 0, t: e.t || 0 });
  }
  return out.sort((a, b) => a.rank - b.rank || b.u - a.u || b.t - a.t || a.name.localeCompare(b.name, 'pl')).slice(0, limit);
}

// Kategoria pozycji: rozpoznanie lokalne → „Dom i inne” (do czasu odpowiedzi AI)
export function categoryOf(title, mem) {
  const r = resolveLocal(title, mem);
  return r || { category: OTHER, source: 'none' };
}

// Grupy w kolejności sklepu (tylko niepuste)
export function groupByCategory(items, mem) {
  const groups = new Map(SHOPPING_CATEGORIES.map((c) => [c.id, []]));
  for (const it of items) groups.get(categoryOf(it.title, mem).category).push(it);
  return SHOPPING_CATEGORIES.filter((c) => groups.get(c.id).length).map((c) => ({ ...c, items: groups.get(c.id) }));
}
