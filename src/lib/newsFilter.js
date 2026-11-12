// Filtr newsów na słowach kluczowych (bez AI, natychmiast): ukrywa szum konsumencki o spółkach z portfela –
// promocje, rabaty, gazetki, kolekcje, godziny otwarcia, konkursy, oferty pracy itp. Tytuł ze słowem inwestycyjnym
// (wyniki, zysk, akcje, dywidenda, prognoza…) zostaje zawsze. Własne słowa do ukrywania – per użytkownik
// (`wealth-app-news-blocked`, urządzenie + chmura); włącznik filtra – `wealth-app-news-filter` (domyślnie włączony).
// Porównanie bez wielkości liter i polskich znaków; słowa jako początki wyrazów („promocj” łapie promocja / promocji).

export const FILTER_KEY = 'wealth-app-news-filter';
export const BLOCKED_KEY = 'wealth-app-news-blocked';

const fold = (t) =>
  ` ${String(t || '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim()} `;

// Szum konsumencki – początki wyrazów (po normalizacji)
export const NOISE_WORDS = [
  // promocje i zakupy
  'promocj', 'promo', 'wyprzedaz', 'rabat', 'kod rabat', 'kupon', 'voucher', 'gazetk', 'okazj', 'taniej', 'tanio', 'tani ', 'za grosze', 'za darmo', 'gratis', 'darmow',
  'hit cenow', 'obnizk', 'przecen', 'black friday', 'cyber monday', 'black week', 'mega oferta', 'oferta dnia', 'kupisz', 'kupic', 'warto kupic', 'do kupienia', 'w koszyku',
  'kod promo', 'zwrot towar', 'reklamacj', 'darmowa dostaw', 'dostawa gratis', 'sklep internetow', 'aplikacj sklep',
  // handel i sklepy
  'godziny otwarcia', 'niedziel handlow', 'niedziela handlow', 'niedziele handlow', 'niedzielach handlow', 'jest otwart', 'sa otwart', 'czynne', 'czy sklepy', 'czynne w', 'otwarte w', 'zamkniete w', 'sklepy otwarte', 'sklepy zamkniete', 'nowy sklep', 'otwarcie sklepu', 'kolejk',
  // moda i produkty
  'kolekcj', 'stylizacj', 'sukienk', 'kurtk', 'plaszcz', 'sweter', 'swetr', 'bluz', 'spodni', 'jeansy', 'buty ', 'trendy mod', 'modowe', 'moda ', 'must have', 'hit sezonu',
  'kosmetyk', 'perfum', 'zabawk', 'gadzet', 'przepis', 'poradnik', 'jak wybrac', 'test produkt', 'recenzj',
  // inne
  'konkurs', 'loteri', 'horoskop', 'pogoda', 'oferta pracy', 'oferty pracy', 'praca w ', 'zatrudni', 'rekrutacj', 'szuka pracownik', 'wynagrodzenie kasjer', 'kasjer',
];

// Słowa inwestycyjne – tytuł z nimi zostaje mimo słów szumu (np. „Black Friday podbił sprzedaż i wyniki LPP”)
export const KEEP_WORDS = [
  // „akcja” bywa promocyjna („akcja rabatowa”) – liczą się tylko akcje spółki
  'wynik', 'zysk', 'strat', 'przychod', 'ebitda', 'marz', 'akcje', 'kurs akcji', 'akcji spolki', 'notowania akcji', 'akcjonariusz', 'kurs', 'notowan', 'gielda', 'gield', 'gpw', 'wig', 'dywidend', 'prognoz', 'rekomendac',
  'wycen', 'analityk', 'analiz', 'raport', 'kwartal', 'polroc', 'emisj', 'skup akcji', 'przejec', 'fuzj', 'inwestycj', 'inwestor', 'zarzad', 'prezes', 'rada nadzorcz', 'walne', 'espi',
  'kapitalizac', 'obligac', 'konsensus', 'guidance', 'sprzedaz wzrosla', 'sprzedaz spadla', 'lfl', 'knf', 'uokik', 'pozew', 'sad ', 'kara ',
];

const has = (text, words) => words.some((w) => text.includes(` ${w}`));

// true – tytuł to szum (do ukrycia); extra – własne słowa użytkownika (dowolne, także całe frazy)
export function isNoiseTitle(title, extra = []) {
  const t = fold(title);
  const own = extra.map((w) => fold(w).trim()).filter((w) => w.length >= 2);
  if (own.some((w) => t.includes(` ${w}`))) return true; // własne słowo – zawsze ukrywa
  if (has(t, KEEP_WORDS)) return false;
  return has(t, NOISE_WORDS);
}

export function readBlocked() {
  try {
    const v = JSON.parse(localStorage.getItem(BLOCKED_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : [];
  } catch {
    return [];
  }
}
export function writeBlocked(list) {
  try {
    localStorage.setItem(BLOCKED_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('wealth-app-prefs-changed', { detail: { key: BLOCKED_KEY } }));
  } catch {
    // brak localStorage
  }
}
export function readFilterOn() {
  try {
    return localStorage.getItem(FILTER_KEY) !== '0';
  } catch {
    return true;
  }
}
export function writeFilterOn(on) {
  try {
    localStorage.setItem(FILTER_KEY, on ? '1' : '0');
    window.dispatchEvent(new CustomEvent('wealth-app-prefs-changed', { detail: { key: FILTER_KEY } }));
  } catch {
    // brak localStorage
  }
}
