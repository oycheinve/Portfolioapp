// Wycofany service worker: przy aktualizacji usuwa swoją pamięć podręczną i wyrejestrowuje się
// (sprząta po wcześniejszej wersji PWA na urządzeniach, które ją zainstalowały). Nie przechwytuje żadnych zapytań.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister()),
  );
});
