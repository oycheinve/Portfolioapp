// Nowa wersja aplikacji na serwerze (Vercel) przy otwartej starej karcie / PWA: pliki doładowywane w trakcie pracy
// (np. odczyt PDF – `pdfText-<hash>.js`) mają w nowym wdrożeniu inne nazwy, a starych już nie ma → „Failed to fetch
// dynamically imported module”. Wtedy jednorazowe przeładowanie strony wczytuje aktualną wersję. Ochrona przed pętlą:
// najwyżej jedno automatyczne przeładowanie na 60 s (sessionStorage).
const GUARD_KEY = 'fintrack-chunk-reload';

export const isStaleChunkError = (e) => /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch dynamically|Unable to preload CSS|ChunkLoadError/i.test(String(e?.message || e || ''));

// true – przeładowanie uruchomione
export function reloadForUpdate() {
  try {
    const last = Number(sessionStorage.getItem(GUARD_KEY)) || 0;
    if (Date.now() - last < 60000) return false;
    sessionStorage.setItem(GUARD_KEY, String(Date.now()));
  } catch {
    // bez sessionStorage – przeładowanie i tak (jednorazowe w tej karcie)
  }
  window.location.reload();
  return true;
}

// Dynamiczny import odporny na nowe wdrożenie: przy brakującym pliku – przeładowanie i czytelny komunikat
export async function importChunk(loader) {
  try {
    return await loader();
  } catch (e) {
    if (!isStaleChunkError(e)) throw e;
    const reloading = reloadForUpdate();
    throw new Error(reloading ? 'Aplikacja została zaktualizowana – odświeżam stronę, potem dodaj plik ponownie' : 'Aplikacja została zaktualizowana – odśwież stronę (zamknij i otwórz ponownie), potem dodaj plik jeszcze raz');
  }
}
