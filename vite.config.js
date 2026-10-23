import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { proxyYahoo } from './api/yahoo.js';
import { fetchLogo, fetchLogoUrl } from './api/logo.js';
import { fetchNews } from './api/news.js';

// /api/yahoo?path=…, /api/news?q=… i /api/logo?domain=… lokalnie (dev i preview) – ta sama logika co funkcje serwerowe Vercel w api/
function yahooApi() {
  const middleware = async (req, res, next) => {
    if (req.url.startsWith('/api/logo')) {
      const params = new URL(req.url, 'http://localhost').searchParams;
      const logo = params.get('url') ? await fetchLogoUrl(params.get('url')) : await fetchLogo(params.get('domain') || '');
      res.statusCode = logo.status;
      res.setHeader('Content-Type', logo.type);
      res.end(logo.body);
      return;
    }
    if (req.url.startsWith('/api/news')) {
      const params = new URL(req.url, 'http://localhost').searchParams;
      const news = await fetchNews(params.get('q'), params.get('symbol'));
      res.statusCode = news.status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(news.body));
      return;
    }
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
