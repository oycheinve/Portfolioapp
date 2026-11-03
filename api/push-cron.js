// /api/push-cron – co godzinę (harmonogram w Supabase, zob. supabase/push_subscriptions.sql) przegląda subskrypcje
// Web Push i wysyła należne powiadomienia: wieczorne o niewykonanych zadaniach dziennych, poranne / południowe
// podsumowanie wiadomości o spółkach z portfela. Autoryzacja: nagłówek „Authorization: Bearer <CRON_SECRET>”.
// ?dry=1 – podgląd planu bez wysyłki.
import { bearer, json, pushConfig, runPushCron, serviceClient } from './_push.js';

export default async function handler(req, res) {
  const cfg = pushConfig();
  if (!cfg.cronSecret) return json(res, 503, { error: 'Brak CRON_SECRET – powiadomienia z serwera nieskonfigurowane' });
  const url = new URL(req.url, 'http://localhost');
  const secret = bearer(req) || url.searchParams.get('secret') || '';
  if (secret !== cfg.cronSecret) return json(res, 401, { error: 'Brak uprawnień' });
  if (cfg.missing.length) return json(res, 503, { error: `Brak zmiennych: ${cfg.missing.join(', ')}` });
  try {
    const report = await runPushCron({ cfg, sb: serviceClient(cfg), dry: url.searchParams.get('dry') === '1' });
    return json(res, 200, { ok: true, at: new Date().toISOString(), count: report.length, report });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
}
