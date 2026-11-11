// /api/push-test (POST) – powiadomienie testowe z serwera na wszystkie urządzenia zalogowanego użytkownika.
// Autoryzacja: „Authorization: Bearer <token sesji Supabase>” (wysyła aplikacja z Ustawień powiadomień).
import { bearer, json, pushConfig, sendPush, serviceClient } from './_push.js';
import { NOTIFY_TITLE } from '../src/lib/notifyPlan.js';

// Body { status: true } – diagnostyka bez wysyłki: konfiguracja serwera, subskrypcje użytkownika (ustawienia,
// strefa, ostatnie wysłanie i ostatni przebieg harmonogramu „checked”), czy to urządzenie jest zapisane (endpoint).
const bodyOf = (req) => {
  if (req.body && typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(typeof req.body === 'string' ? req.body : '{}');
  } catch {
    return {};
  }
};
async function status(req, res, cfg) {
  const out = { missing: cfg.missing, cron: !!cfg.cronSecret, serverTime: new Date().toISOString(), devices: [], thisDevice: false };
  if (cfg.missing.length) return json(res, 200, out);
  const token = bearer(req);
  if (!token) return json(res, 401, { error: 'Brak tokenu sesji' });
  const sb = serviceClient(cfg);
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return json(res, 401, { error: 'Nieprawidłowa sesja' });
  const { data: subs, error: e2 } = await sb.from('push_subscriptions').select('endpoint, prefs, tz, last_sent, updated_at').eq('user_id', data.user.id);
  if (e2) return json(res, 200, { ...out, tableError: /push_subscriptions/.test(e2.message || '') ? 'missing' : e2.message });
  const endpoint = String(bodyOf(req).endpoint || '');
  out.devices = (subs || []).map((x) => ({ prefs: x.prefs, tz: x.tz, lastSent: x.last_sent || {}, updatedAt: x.updated_at, current: !!endpoint && x.endpoint === endpoint }));
  out.thisDevice = out.devices.some((d) => d.current);
  return json(res, 200, out);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Użyj POST' });
  const cfg = pushConfig();
  if (bodyOf(req).status) {
    try {
      return await status(req, res, cfg);
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  }
  if (cfg.missing.length) return json(res, 503, { error: `Powiadomienia z serwera nieskonfigurowane (brak: ${cfg.missing.join(', ')})` });
  const token = bearer(req);
  if (!token) return json(res, 401, { error: 'Brak tokenu sesji' });
  try {
    const sb = serviceClient(cfg);
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data?.user) return json(res, 401, { error: 'Nieprawidłowa sesja' });
    const { data: subs, error: e2 } = await sb.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', data.user.id);
    if (e2) return json(res, 500, { error: e2.message });
    if (!subs?.length) return json(res, 404, { error: 'Brak subskrypcji – włącz powiadomienia z serwera na tym urządzeniu' });
    let sent = 0;
    for (const s of subs) {
      const r = await sendPush(cfg, s, { title: NOTIFY_TITLE, body: '✅ Powiadomienia z serwera działają! Będziesz na bieżąco z zadaniami i rynkiem. 📊', url: '/#/settings/notifications', tag: 'push-test' });
      if (r.ok) sent += 1;
      else if (r.gone) await sb.from('push_subscriptions').delete().eq('id', s.id);
    }
    return json(res, 200, { ok: true, sent, devices: subs.length });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
}
