import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Proxy deweloperski do Yahoo Finance – omija blokadę CORS przeglądarki.
// W produkcji aplikacja korzysta z konfigurowalnego proxy CORS lub danych mockowanych.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: { recharts: ['recharts'], react: ['react', 'react-dom'] },
      },
    },
  },
  server: {
    proxy: {
      '/api/yahoo': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yahoo/, ''),
        headers: { 'User-Agent': 'Mozilla/5.0' },
      },
    },
  },
  preview: {
    proxy: {
      '/api/yahoo': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yahoo/, ''),
        headers: { 'User-Agent': 'Mozilla/5.0' },
      },
    },
  },
});
