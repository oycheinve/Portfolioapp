// Funkcje AI – każdą można wyłączyć w Ustawieniach → Funkcje AI (settings.ai: { all, [id]: false }; zapis w ustawieniach
// użytkownika – urządzenie + chmura). Wyłączenie ukrywa funkcję i zatrzymuje zapytania do AI; zapisane dane zostają.
export const AI_FEATURES = [
  { id: 'newsSummary', label: 'Podsumowania newsów', desc: 'Podsumowanie dnia i znaczek „AI” przy artykułach w Newsach' },
  { id: 'receipts', label: 'Skanowanie paragonów', desc: 'Przycisk „Skanuj paragon” w Budżecie (historia paragonów zostaje)' },
  { id: 'budgetSummary', label: 'Miesięczne podsumowania budżetu', desc: 'Podsumowanie AI miesiąca w Budżecie i automatyczne generowanie na początku miesiąca' },
  { id: 'earnings', label: 'Analityk wyników spółek', desc: 'Karta Analityka w Portfelu (historia i analizy zostają zapisane)' },
  { id: 'shoppingAi', label: 'Kategorie zakupów od AI', desc: 'Rozpoznawanie kategorii nowych produktów – grupowanie z pamięci działa dalej' },
  { id: 'shoppingPrices', label: 'Ceny zakupów od AI', desc: 'Dopasowanie produktów do paragonów i szacunek ceny, gdy produktu nie ma w historii – ceny z paragonów działają dalej' },
  { id: 'tasksAi', label: 'Kategorie zadań od AI', desc: 'Rozpoznawanie kategorii nowych zadań – grupowanie z pamięci działa dalej' },
];
export const aiAllOn = (settings) => settings?.ai?.all !== false;
export const aiOn = (settings, id) => aiAllOn(settings) && settings?.ai?.[id] !== false;
