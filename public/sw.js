// Service worker FinTrack (PWA): praca offline powłoki aplikacji i powiadomienia.
// Zasady pamięci podręcznej:
//  • nawigacja (index.html) – najpierw sieć, bez sieci ostatnia zapisana wersja (aplikacja startuje offline);
//  • /assets/* (pliki z hashem w nazwie, niezmienne) – z pamięci, w tle brak potrzeby odświeżania;
//  • ikony, manifest, logotypy (/logos, /api/logo) – pamięć z odświeżaniem w tle;
//  • /api/yahoo, /api/news i wszystkie zapytania do innych domen (Supabase, Yahoo, NBP…) – NIGDY z pamięci
//    (świeże notowania i dane; bez sieci aplikacja używa własnych danych awaryjnych).
// Wersja w nazwie pamięci – przy zmianie poprzednie pamięci są usuwane.
const VERSION = 'fintrack-v4'; // zmiana wersji odświeża zapamiętany manifest i ikony; stare pamięci usuwane przy aktywacji
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const MEDIA = `${VERSION}-media`;
const PRECACHE = ['/', '/index.html', '/manifest.json', '/icons/favicon-32.png', '/icons/icon-96.png', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(`${VERSION}-`)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(fallbackUrl || request, res.clone());
    return res;
  } catch (e) {
    const hit = (await cache.match(fallbackUrl || request)) || (await cache.match('/'));
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const update = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || update;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase, Yahoo, NBP… – bez udziału service workera
  if (url.pathname.startsWith('/api/logo')) {
    event.respondWith(staleWhileRevalidate(request, MEDIA));
    return;
  }
  if (url.pathname.startsWith('/api/')) return; // notowania, wiadomości – zawsze z sieci
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL, '/index.html'));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }
  if (/^\/(icons|logos|screenshots)\//.test(url.pathname) || /^\/(manifest\.json|favicon\.svg)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, MEDIA));
  }
});

// Powiadomienia: kliknięcie otwiera aplikację (istniejące okno albo nowe) pod wskazanym adresem
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const client = list.find((c) => c.url.startsWith(self.location.origin));
      if (client) {
        client.navigate?.(target).catch(() => {});
        return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
