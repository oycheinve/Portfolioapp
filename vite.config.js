import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { proxyYahoo } from './api/yahoo.js';

// /api/yahoo?path=… lokalnie (dev i preview) – ta sama logika co funkcja serwerowa Vercel w api/yahoo.js
function yahooApi() {
  const middleware = async (req, res, next) => {
    if (!req.url.startsWith('/api/yahoo')) return next();
    const path = new URL(req.url, 'http://localhost').searchParams.get('path') || '';
    const result = await proxyYahoo(path);
    res.statusCode = result.status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(result.body);
  };
  return {
    name: 'yahoo-api',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), yahooApi()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: { recharts: ['recharts'], react: ['react', 'react-dom'] },
      },
    },
  },
});
