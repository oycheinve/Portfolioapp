import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA: service worker (praca offline powłoki aplikacji, powiadomienia) – tylko w wersji produkcyjnej, żeby nie
// przeszkadzał serwerowi deweloperskiemu Vite. Rejestracja zastępuje dawny „wyłącznik” sw.js pod tym samym adresem.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  });
}
// Pamięci podręczne bardzo starej wersji PWA (portfolio-app-*) – do usunięcia
if (typeof caches !== 'undefined') {
  caches
    .keys()
    .then((keys) => keys.filter((k) => k.startsWith('portfolio-app-')).forEach((k) => caches.delete(k)))
    .catch(() => {});
}
