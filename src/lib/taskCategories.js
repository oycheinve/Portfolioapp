// Kategorie zadań (BETA): automatyczne grupowanie zadań w ogólne sekcje (Dom, Praca, Finanse…).
// Kolejność: pamięć (poprawki użytkownika i wcześniejsze odpowiedzi AI) → słownik słów kluczowych → AI (tylko
// zadania nieznane lokalnie, w tle, paczkami) → „Sprawy codzienne”. Pamięć per nazwa zadania w kluczu
// `wealth-app-task-cats-v1` (per użytkownik: urządzenie + chmura, ui_prefs) – bez limitu liczby zadań i kont.
import { PREFS_CHANGED_EVENT } from './budget.js';

export const TASK_CATS_KEY = 'wealth-app-task-cats-v1';
export const TASK_GROUP_KEY = 'wealth-app-tasks-grouped';
export const TASK_CATEGORIES = [
  { id: 'Finanse', emoji: '💰' },
  { id: 'Praca', emoji: '💼' },
  { id: 'Dom', emoji: '🏠' },
  { id: 'Zdrowie i sport', emoji: '🏃' },
  { id: 'Zakupy i sprawunki', emoji: '🛒' },
  { id: 'Rodzina i znajomi', emoji: '👨‍👩‍👧' },
  { id: 'Rozwój i nauka', emoji: '📚' },
  { id: 'Sprawy codzienne', emoji: '📌' },
];
export const TASK_OTHER = 'Sprawy codzienne';
const VALID = new Set(TASK_CATEGORIES.map((c) => c.id));
const ORDER = new Map(TASK_CATEGORIES.map((c, i) => [c.id, i]));
export const normTask = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
export const taskEmoji = (c) => TASK_CATEGORIES.find((x) => x.id === c)?.emoji || '📌';

// Słownik: początki słów w dowolnym miejscu tytułu (zadania zaczynają się zwykle od czasownika)
const DICT = [
  ['Finanse', ['budżet', 'budzet', 'ike', 'ikze', 'ppk', 'portfel', 'inwest', 'akcj', 'dywidend', 'obligacj', 'lokat', 'oszczędz', 'oszczedz', 'poduszk', 'rachun', 'faktur', 'podat', 'pit', 'przelew', 'bank', 'kredyt', 'rata', 'raty', 'opłat', 'oplat', 'wydatk', 'finans', 'xtb', 'etf', 'kryptow', 'btc', 'ubezpiecz', 'czynsz', 'abonament', 'subskryp', 'zus']],
  ['Praca', ['prac', 'raport', 'spotkani', 'klient', 'projekt', 'prezentacj', 'mail', 'e-mail', 'szef', 'zespół', 'zespol', 'deadline', 'umow', 'ofert', 'cv', 'rekrutac', 'biuro', 'call', 'jira', 'code review', 'wdrożen', 'wdrozen', 'kod']],
  ['Dom', ['sprząt', 'sprzat', 'odkurz', 'pranie', 'prasow', 'zmywar', 'naczyni', 'śmieci', 'smieci', 'kuchni', 'łazienk', 'lazienk', 'podlać', 'podlac', 'kwiat', 'rośli', 'rosli', 'napraw', 'remont', 'malowan', 'kran', 'żarówk', 'zarowk', 'mieszkani', 'ogród', 'ogrod', 'pościel', 'posciel', 'okna', 'mycie okien', 'lodówk', 'lodowk', 'gotow', 'obiad']],
  ['Zdrowie i sport', ['siłown', 'silown', 'trening', 'bieg', 'rower', 'basen', 'pływ', 'plyw', 'jog', 'spacer', 'lekarz', 'dentyst', 'wizyt', 'badani', 'leki', 'lek ', 'suplement', 'witamin', 'diet', 'sen ', 'medytac', 'rozciąg', 'rozciag', 'ćwicz', 'cwicz', 'kroki', 'fizjo', 'zdrow']],
  ['Zakupy i sprawunki', ['zakup', 'kupić', 'kupic', 'sklep', 'paczk', 'poczt', 'kurier', 'odebrać', 'odebrac', 'odbiór', 'odbior', 'urząd', 'urzad', 'apteka', 'pralni', 'fryzjer', 'warsztat', 'mechanik', 'przegląd auta', 'tankow', 'zwrot']],
  ['Rodzina i znajomi', ['mama', 'mamy', 'mamie', 'tata', 'taty', 'tacie', 'rodzic', 'babci', 'dziadk', 'brat', 'siostr', 'dzieci', 'dzieck', 'żon', 'zon', 'mąż', 'maz', 'partner', 'znajom', 'przyjaci', 'urodzin', 'imienin', 'rocznic', 'prezent', 'zadzwoń', 'zadzwon', 'odwiedz', 'randk', 'wesel']],
  ['Rozwój i nauka', ['nauk', 'uczyć', 'uczyc', 'kurs', 'książk', 'ksiazk', 'czytan', 'przeczyt', 'angielsk', 'niemieck', 'hiszpańsk', 'język', 'jezyk', 'duolingo', 'webinar', 'szkoleni', 'studi', 'egzamin', 'podcast', 'certyfikat']],
];
const DICT_FLAT = DICT.flatMap(([cat, words]) => words.map((w) => ({ w: w.trim(), cat, whole: w.endsWith(' ') || w.trim().length <= 3 }))).sort((a, b) => b.w.length - a.w.length);
export function guessTaskCategory(title) {
  const words = normTask(title).split(/[^\p{L}\p{N}+-]+/u).filter(Boolean);
  const joined = ` ${words.join(' ')} `;
  for (const { w, cat, whole } of DICT_FLAT) {
    if (w.includes(' ')) {
      if (joined.includes(` ${w}`)) return cat;
    } else if (words.some((x) => (whole ? x === w : x.startsWith(w)))) return cat;
  }
  return null;
}

export function readTaskCats() {
  try {
    const v = JSON.parse(localStorage.getItem(TASK_CATS_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
export function writeTaskCats(mem) {
  try {
    localStorage.setItem(TASK_CATS_KEY, JSON.stringify(mem));
    window.dispatchEvent(new CustomEvent(PREFS_CHANGED_EVENT, { detail: { key: TASK_CATS_KEY } }));
  } catch {
    // brak localStorage
  }
}
// Zapis kategorii: poprawka użytkownika ma pierwszeństwo – AI jej nie nadpisuje
export function rememberTask(mem, title, category, source) {
  const key = normTask(title);
  if (!key || !VALID.has(category)) return mem;
  const prev = mem[key];
  if (prev?.s === 'user' && source !== 'user') return mem;
  return { ...mem, [key]: { c: category, s: source, t: Date.now() } };
}
// Lokalne rozpoznanie (bez AI): { category, source } albo null
export function resolveTaskLocal(title, mem) {
  const m = mem[normTask(title)];
  if (m && VALID.has(m.c)) return { category: m.c, source: m.s || 'memory' };
  const g = guessTaskCategory(title);
  return g ? { category: g, source: 'dict' } : null;
}
export const taskCategoryOf = (title, mem) => resolveTaskLocal(title, mem)?.category || TASK_OTHER;

// Sekcje w stałej kolejności (tylko niepuste); zadania w sekcji – w kolejności z listy
export function groupTasks(items, mem, titleOf = (t) => t.title) {
  const by = new Map();
  for (const it of items) {
    const c = taskCategoryOf(titleOf(it), mem);
    if (!by.has(c)) by.set(c, []);
    by.get(c).push(it);
  }
  return [...by.entries()].sort((a, b) => ORDER.get(a[0]) - ORDER.get(b[0])).map(([id, list]) => ({ id, emoji: taskEmoji(id), items: list }));
}
