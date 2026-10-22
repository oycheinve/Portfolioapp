import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Sprzątanie po wycofanym service workerze (wcześniejsza wersja PWA) – aplikacja działa bez niego
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => regs.forEach((r) => r.unregister()))
    .catch(() => {});
}
if (typeof caches !== 'undefined') {
  caches
    .keys()
    .then((keys) => keys.filter((k) => k.startsWith('portfolio-app-')).forEach((k) => caches.delete(k)))
    .catch(() => {});
}
