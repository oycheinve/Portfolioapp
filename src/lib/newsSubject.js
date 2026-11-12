// Główny podmiot artykułu (o jakiej spółce jest tekst) w odróżnieniu od źródła / autora (kto go napisał).
// Przykład: „Analityk XTB: Orlen może zyskać…” ze strony XTB dotyczy Orlenu, nie spółki XTB.
// Działa na tytule (RSS Google News i Yahoo podają tylko tytuł): z tytułu usuwane są fragmenty autorskie
// („analityk XTB”, „według XTB”, „XTB Research”, „XTB:” przed nazwą innej spółki, „przez xStation”…), potem
// głównym podmiotem jest spółka z portfela wymieniona najwcześniej. Bez żadnej spółki – „Analizy ogólne”.

export const GENERAL_ID = 'general';

// Popularne nazwy spółek GPW, gdy w tytułach używa się innej nazwy niż ticker / nazwa w aplikacji
const KNOWN_ALIASES = {
  PKN: ['Orlen', 'PKN Orlen'],
  PKO: ['PKO BP', 'PKO Bank Polski', 'PKO'],
  PEO: ['Pekao', 'Bank Pekao'],
  PZU: ['PZU'],
  KGH: ['KGHM'],
  CDR: ['CD Projekt', 'CDP', 'CD PROJEKT RED'],
  DNP: ['Dino', 'Dino Polska'],
  LPP: ['LPP'],
  ALE: ['Allegro'],
  KTY: ['Grupa Kęty', 'Kęty'],
  CBF: ['Cyber_Folks', 'Cyber Folks', 'cyber_Folks'],
  DIG: ['Digital Network'],
  KRU: ['Kruk'],
  XTB: ['XTB', 'X-Trade Brokers'],
  SPL: ['Santander Bank Polska', 'Santander'],
  MBK: ['mBank'],
  BDX: ['Budimex'],
  PGE: ['PGE'],
  TPE: ['Tauron'],
  JSW: ['JSW', 'Jastrzębska Spółka Węglowa'],
  ACP: ['Asseco Poland', 'Asseco'],
  CCC: ['CCC'],
  OPL: ['Orange Polska'],
  MIL: ['Bank Millennium', 'Millennium'],
  ALR: ['Alior', 'Alior Bank'],
  TXT: ['Text', 'LiveChat'],
  SNT: ['Synektik'],
  ATT: ['Grupa Azoty', 'Azoty'],
};

// Normalizacja: małe litery, bez polskich znaków, tylko litery / cyfry / _ i pojedyncze spacje
export function norm(text) {
  return ` ${String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^\p{L}\p{N}_]+/gu, ' ')
    .trim()} `;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Nazwa bez dopisków prawnych i klas ETF („S.A.”, „Acc”, „UCITS ETF”…)
function cleanName(name) {
  return String(name || '')
    .replace(/\b(S\.?A\.?|SA|ASA|AG|NV|PLC|SE|Inc\.?|Ltd\.?|Acc|Dist|UCITS|ETF|USD|EUR|PLN|\(.*?\))\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Aliasy tematu (spółki / ETF-u): ticker, nazwa, nazwa bez dopisków, znane nazwy potoczne
export function topicAliases(topic) {
  const ticker = String(topic.label || '').toUpperCase();
  const out = new Set([topic.label, topic.title, cleanName(topic.title), ...(KNOWN_ALIASES[ticker] || [])].filter(Boolean));
  return [...out].map((a) => norm(a).trim()).filter((a) => a.length >= 2);
}

// Wzorce fragmentów autorskich / „platformowych” dla aliasu A (po normalizacji tekstu)
function authorPatterns(a) {
  const A = escape(a);
  return [
    `(analityk|analitycy|analityka|analitykow|analitykiem|ekspert|eksperci|ekspertka|ekspertow|ekspertem|ekonomista|ekonomistka|ekonomisci|ekonomistow|ekonomistka|strateg|stratedzy|strategow|zespol|dzial analiz) ${A}`,
    `(zdaniem|wedlug|wg|komentarz|komentarze|raport|raportu|analiza|analizy|prognoza|prognozy|rekomendacja|webinar|podcast|newsletter|poranny raport|przeglad) ${A}`,
    `${A} (research|komentuje|radzi|przewiduje|tv|trading|academy|akademia)`,
    `(przez|w|na) (platformie|platformy|aplikacji|aplikacja|rachunku|koncie|konto) ${A}`,
    `(przez|na) ${A}`,
    // „Kamil Cisowski z XTB”, „ekspert z XTB”, „rozmowa z XTB”
    `z ${A}`,
  ];
}

// Zdarzenia spółki – alias w ich pobliżu to zawsze podmiot (wyniki XTB, prowizje XTB, dywidenda XTB…)
const EVENT = '(wynik|wyniki|wynikow|zysk|zyski|przychod|przychody|strata|dywidend|prowizj|oplat|klient|klientow|kurs|akcje|akcji|notowania|kapitalizacj|zarzad|prezes|walne|wza|espi|ebi|komunikat|raport kwartalny|emisj|skup|przejeci|regulator|knf|rekord|guidance|prognoz)';

function removeSpans(text, alias) {
  let t = text;
  for (const p of authorPatterns(alias)) t = t.replace(new RegExp(` ${p}(?= )`, 'g'), ' ');
  return t;
}

// Pozycja (indeks) pierwszej wzmianki aliasu jako osobnego słowa; -1 – brak. Polska odmiana: alias z co najmniej
// 5 znaków pasuje też z krótką końcówką („Synektiku”, „Digital Networku”, „Allegro” → „Allegrze” nie), a krótszy –
// tylko z końcówką po łączniku (po normalizacji „LPP-u” → „lpp u”, „XTB-ka” → „xtb ka” – osobne słowo, jak dotąd)
const mentionRe = new Map();
function firstMention(text, aliases) {
  let best = -1;
  for (const a of aliases) {
    let i = text.indexOf(` ${a} `);
    if (i < 0 && a.length >= 5 && !a.includes(' ')) {
      if (!mentionRe.has(a)) mentionRe.set(a, new RegExp(` ${escape(a)}(?:[a-z]{1,4}) `));
      const m = mentionRe.get(a).exec(text);
      if (m) i = m.index;
    } else if (i < 0 && a.length >= 5) {
      if (!mentionRe.has(a)) mentionRe.set(a, new RegExp(` ${escape(a)}(?:[a-z]{1,4})? `));
      const m = mentionRe.get(a).exec(text);
      if (m) i = m.index;
    }
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  return best;
}

// Autor w zapisie z interpunkcją (przed normalizacją): „XTB: …” na początku tytułu, „Imię Nazwisko, XTB: …”,
// „Imię Nazwisko (XTB): …”, „… – XTB” na końcu
const soft = (text) =>
  ` ${String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[„”"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
// Spółki-wydawcy analiz (broker / banki z domami maklerskimi): ich nazwa w roli autora nie czyni ich tematem
const PUBLISHERS = new Set(['XTB', 'MBK', 'PKO', 'SPL', 'PEO', 'MIL', 'ALR', 'BHW', 'ING']);
function punctAuthor(raw, a) {
  const A = escape(a).replace(/ /g, '\\s+');
  return new RegExp(`^\\s*${A}\\s*[:|]|[,(]\\s*${A}\\s*[):]|[–—-]\\s*${A}\\s*$`).test(raw);
}

// item: { title, source }; topics: tematy-spółki z portfela [{ id, label, title }] (frazy własne pomijane)
// → { mainId, mentions: [id…], authorIds: [id…] } – mainId === GENERAL_ID, gdy tytuł nie dotyczy żadnej spółki
export function classifyArticle(item, topics) {
  // Nazwa platformy XTB (xStation) nie jest podmiotem
  const title = norm(item.title).replace(/ xstation( 5)?(?= )/g, ' ');
  const source = norm(item.source);
  const list = topics.map((t) => ({ id: t.id, aliases: topicAliases(t), publisher: PUBLISHERS.has(String(t.label || '').toUpperCase()) }));
  // Tematy-autorzy: źródło to sama spółka (np. portal XTB) albo w tytule jest fragment autorski z jej nazwą
  const raw = soft(item.title);
  const authorIds = list.filter((t) => t.aliases.some((a) => source.includes(` ${a} `) || removeSpans(title, a) !== title || (t.publisher && punctAuthor(raw, a)))).map((t) => t.id);
  // Tytuł bez fragmentów autorskich wszystkich tematów
  let clean = title;
  for (const t of list) for (const a of t.aliases) clean = removeSpans(clean, a);
  const hits = [];
  for (const t of list) {
    let pos = firstMention(clean, t.aliases);
    // Spółka będąca też autorem / źródłem (np. XTB): podmiotem tylko przy zdarzeniu spółki (wyniki, prowizje,
    // dywidenda…); gdy w tytule jest inna spółka albo źródłem jest sama spółka – to tylko autor analizy
    if (pos >= 0 && authorIds.includes(t.id)) {
      const event = t.aliases.some((a) => new RegExp(`( ${escape(a)} (\\S+ )?${EVENT}| ${EVENT}\\S* (\\S+ )?${escape(a)} )`).test(clean));
      // Wydawca analiz (np. XTB) bez zdarzenia spółki – analityk XTB o bitcoinie, ropie, innej spółce – nie jest
      // tematem; pozostałe spółki-autorzy jak dotąd: tylko gdy w tytule jest inna spółka albo źródłem jest sama spółka
      const otherAfter = list.some((o) => o.id !== t.id && firstMention(clean, o.aliases) >= 0);
      const sourceIsTopic = t.aliases.some((a) => source.includes(` ${a} `));
      if (!event && (t.publisher || otherAfter || sourceIsTopic)) pos = -1;
    }
    if (pos >= 0) hits.push({ id: t.id, pos });
  }
  hits.sort((a, b) => a.pos - b.pos);
  return { mainId: hits[0]?.id || GENERAL_ID, mentions: hits.map((h) => h.id), authorIds };
}
