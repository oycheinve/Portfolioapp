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

export function guessCategory(title) {
  const t = ` ${normProduct(title)} `;
  for (const [cat, words] of DICT) if (words.some((w) => t.includes(` ${w}`) || t.startsWith(` ${w}`))) return cat;
  return null;
}

export function readCats() {
  try {
    const v = JSON.parse(localStorage.getItem(CATS_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
export function writeCats(map) {
  try {
    // najwyżej 1000 ostatnich produktów
    const entries = Object.entries(map).slice(-1000);
    localStorage.setItem(CATS_KEY, JSON.stringify(Object.fromEntries(entries)));
    window.dispatchEvent(new CustomEvent('wealth-app-prefs-changed', { detail: { key: CATS_KEY } }));
  } catch {
    // brak localStorage – kategorie tylko do końca sesji
  }
}

// Kategoria pozycji: AI (zapamiętana) → słownik → „Dom i inne”
export function categoryOf(title, aiMap) {
  const ai = aiMap[normProduct(title)];
  if (ai && VALID.has(ai)) return { category: ai, source: 'ai' };
  const g = guessCategory(title);
  return g ? { category: g, source: 'guess' } : { category: OTHER, source: 'none' };
}

// Grupy w kolejności sklepu (tylko niepuste)
export function groupByCategory(items, aiMap) {
  const groups = new Map(SHOPPING_CATEGORIES.map((c) => [c.id, []]));
  for (const it of items) groups.get(categoryOf(it.title, aiMap).category).push(it);
  return SHOPPING_CATEGORIES.filter((c) => groups.get(c.id).length).map((c) => ({ ...c, items: groups.get(c.id) }));
}
