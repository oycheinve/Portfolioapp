import { useEffect, useMemo, useState } from 'react';
import { Activity, Bell, BellOff, CalendarCheck2, Cloud, Eye, Newspaper, Send, Smartphone } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { NEWS_SLOTS, NOTIFY_TITLE, localClock, newsDigest, newsDigestMessage, previousDay, priceAlertMessage } from '../lib/notifyPlan.js';
import { heldDayChanges } from '../lib/priceAlerts.js';
import {
  currentPushSubscription,
  notificationPermission,
  notificationsSupported,
  pushSupported,
  readNotifySettings,
  requestNotificationPermission,
  sendServerTestPush,
  showNotification,
  subscribePush,
  syncPushSubscription,
  unsubscribePush,
  vapidPublicKey,
  writeNotifySettings,
} from '../lib/notifications.js';
import { fetchNewsMany, heldNewsTopics } from '../lib/news.js';
import { Card } from '../components/ui.jsx';

const EVENING_HOURS = Array.from({ length: 12 }, (_, i) => i + 12); // 12:00 – 23:00 (zapisana inna godzina też na liście)
const MAX_TOPICS = 15;
const THRESHOLDS = [2, 3, 4, 5, 6, 7, 8, 10];
const pctText = (p) => `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p * 100).toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

function Switch({ on, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-blue-600 dark:bg-blue-500' : 'bg-stone-300 dark:bg-white/15'}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

const selectCls = 'h-9 rounded-lg border border-stone-200 bg-white px-2 text-sm disabled:opacity-50 dark:border-white/10 dark:bg-neutral-800';
const btnCls = 'inline-flex h-9 items-center gap-2 rounded-lg border border-stone-200 px-3 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-white/10 dark:text-stone-200 dark:hover:bg-white/5';

// Ustawienia powiadomień: zgoda na urządzeniu, wieczorne przypomnienie o zadaniach, raport o spółkach z portfela,
// powiadomienia z serwera (Web Push – także przy zamkniętej aplikacji)
// Lekka podsekcja wewnątrz karty „Powiadomienia” w Ustawieniach (zamiast zagnieżdżonych kart)
function SubSection({ title, subtitle, icon: Icon, children }) {
  return (
    <section className="min-w-0 rounded-xl border border-stone-100 bg-stone-50/60 dark:border-white/5 dark:bg-white/[0.03]">
      <header className="flex items-center gap-2.5 px-3.5 pt-3">
        {Icon && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-stone-600 dark:bg-white/5 dark:text-stone-300">
            <Icon size={15} />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          {subtitle && <p className="truncate text-xs text-stone-500 dark:text-stone-400">{subtitle}</p>}
        </div>
      </header>
      <div className="p-3.5">{children}</div>
    </section>
  );
}

// embedded – w Ustawieniach (karta „Powiadomienia”): podsekcje bez zagnieżdżonych kart
export default function NotificationsView({ embedded = false }) {
  const Box = embedded ? SubSection : Card;
  const { state, actions, cloud } = useApp();
  const userId = cloud?.enabled ? cloud.user?.id : null;
  const [prefs, setPrefs] = useState(readNotifySettings);
  const [permission, setPermission] = useState(notificationPermission);
  const [pushSub, setPushSub] = useState(null);
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState(null);
  const watch = useMemo(() => heldNewsTopics(state).slice(0, MAX_TOPICS), [state]);
  const supported = notificationsSupported();
  const ready = prefs.enabled && permission === 'granted';

  useEffect(() => {
    currentPushSubscription().then(setPushSub).catch(() => setPushSub(null));
  }, []);

  const save = (patch) => {
    const next = { ...prefs, ...patch, tasks: { ...prefs.tasks, ...(patch.tasks || {}) }, news: { ...prefs.news, ...(patch.news || {}) }, prices: { ...prefs.prices, ...(patch.prices || {}) } };
    setPrefs(next);
    writeNotifySettings(next);
    if (pushSub && userId) syncPushSubscription(userId, next, watch).catch((e) => actions.notify(`Powiadomienia z serwera: ${e.message}`, 'warn'));
    window.dispatchEvent(new Event('wealth-app-notify-check'));
  };

  const enableDevice = async () => {
    if (prefs.enabled) return save({ enabled: false });
    const p = await requestNotificationPermission();
    setPermission(p);
    if (p === 'granted') save({ enabled: true });
    else actions.notify(p === 'denied' ? 'Powiadomienia są zablokowane w ustawieniach przeglądarki / telefonu dla tej aplikacji' : 'Nie udzielono zgody na powiadomienia', 'warn');
    return undefined;
  };

  const testLocal = async () => {
    const ok = await showNotification(NOTIFY_TITLE, { body: '✅ Powiadomienia działają! Będziesz na bieżąco z zadaniami i rynkiem. 📊', url: '/#/settings/notifications', tag: 'test' });
    if (!ok) actions.notify('Nie udało się wyświetlić powiadomienia – sprawdź zgodę w ustawieniach telefonu', 'warn');
  };

  // Podgląd raportu: wczorajsze artykuły o spółkach z portfela (ta sama logika co powiadomienie)
  const runPreview = async (sendNow = false) => {
    setBusy('preview');
    try {
      const day = previousDay(localClock(new Date()).day);
      const { items } = await fetchNewsMany(watch, { force: false });
      const digest = newsDigest(items, watch, day);
      const msg = newsDigestMessage(digest, prefs.news.min);
      setPreview({ day, digest, msg });
      if (sendNow && msg) await showNotification(msg.title, msg);
    } catch (e) {
      setPreview({ error: e.message });
    } finally {
      setBusy('');
    }
  };

  // Bieżące dzisiejsze zmiany posiadanych pozycji (z ostatnio pobranych kursów) – ponad próg
  const [priceCheck, setPriceCheck] = useState(null);
  const checkPrices = async (sendNow = false) => {
    const all = heldDayChanges(state).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    const over = all.filter((c) => Math.abs(c.pct * 100) >= prefs.prices.threshold);
    setPriceCheck({ all, over, at: state.prices?.lastRefresh });
    const msg = priceAlertMessage(over, prefs.prices.threshold);
    if (sendNow && msg) await showNotification(msg.title, msg);
  };

  const togglePush = async () => {
    setBusy('push');
    try {
      if (pushSub) {
        await unsubscribePush(userId);
        setPushSub(null);
        actions.notify('Wyłączono powiadomienia z serwera na tym urządzeniu', 'info');
      } else {
        const p = permission === 'granted' ? 'granted' : await requestNotificationPermission();
        setPermission(p);
        if (p !== 'granted') throw new Error('brak zgody na powiadomienia');
        const sub = await subscribePush(userId, { ...prefs, enabled: true }, watch);
        if (!prefs.enabled) save({ enabled: true });
        setPushSub(sub);
        actions.notify('Powiadomienia z serwera włączone – przyjdą także przy zamkniętej aplikacji', 'success');
      }
    } catch (e) {
      actions.notify(`Powiadomienia z serwera: ${e.message}`, 'warn');
    } finally {
      setBusy('');
    }
  };

  const testServer = async () => {
    setBusy('server');
    try {
      const r = await sendServerTestPush();
      actions.notify(`Wysłano powiadomienie testowe z serwera (${r.sent}/${r.devices} urządzeń)`, 'success');
    } catch (e) {
      actions.notify(`Test z serwera: ${e.message}`, 'warn');
    } finally {
      setBusy('');
    }
  };

  if (!supported) {
    return (
      <Box title="Powiadomienia" icon={BellOff}>
        <p className="text-sm text-stone-500 dark:text-stone-400">Ta przeglądarka nie obsługuje powiadomień. Na iPhonie działają po dodaniu aplikacji do ekranu początkowego (iOS 16.4+), na Androidzie w Chrome.</p>
      </Box>
    );
  }

  return (
    <div className={embedded ? 'space-y-2.5' : 'space-y-4 sm:space-y-6'}>
      <Box title="Powiadomienia na tym urządzeniu" subtitle="Zgoda systemu i włącznik wszystkich powiadomień FinTrack" icon={Smartphone}>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            onClick={enableDevice}
            aria-pressed={ready}
            className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 font-semibold ${ready ? 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:text-neutral-950' : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-white/10 dark:bg-neutral-800 dark:text-stone-200'}`}
          >
            {ready ? <Bell size={16} /> : <BellOff size={16} />} {ready ? 'Powiadomienia włączone' : 'Włącz powiadomienia'}
          </button>
          <button type="button" onClick={testLocal} disabled={!ready} className={btnCls}>
            <Send size={15} /> Wyślij testowe
          </button>
          <span className="text-[11px] text-stone-500 dark:text-stone-400">
            Zgoda: {permission === 'granted' ? 'udzielona' : permission === 'denied' ? 'zablokowana – zmień w ustawieniach telefonu / przeglądarki' : 'jeszcze nie udzielona (pojawi się prośba systemu)'}
          </span>
        </div>
      </Box>

      <Box title="Wieczorne przypomnienie o zadaniach" subtitle="Gdy dzisiejsze zadania dzienne nie są jeszcze wykonane" icon={CalendarCheck2}>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-stone-700 dark:text-stone-200">Przypominaj o niewykonanych zadaniach</span>
            <Switch on={prefs.tasks.on} onChange={(v) => save({ tasks: { on: v } })} label="Przypomnienie o zadaniach" disabled={!ready} />
          </div>
          <label className="flex flex-wrap items-center gap-2 text-stone-600 dark:text-stone-300">
            Godzina
            <select value={prefs.tasks.hour} onChange={(e) => save({ tasks: { hour: Number(e.target.value) } })} disabled={!ready || !prefs.tasks.on} aria-label="Godzina przypomnienia o zadaniach" className={selectCls}>
              {[...new Set([...EVENING_HOURS, prefs.tasks.hour])].sort((a, b) => a - b).map((h) => (
                <option key={h} value={h}>
                  {h}:00
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-stone-500 dark:text-stone-400">Np. „FinTrack 📊 – ⏳ Zostały Ci 2 zadania na dziś: Sprawdzenie portfela, Zapisanie wydatków. ✅ Odhacz je przed końcem dnia!” Raz dziennie; bez powiadomienia, gdy wszystko jest odhaczone.</p>
        </div>
      </Box>

      <Box title="Krytyczne zmiany notowań" subtitle="Nagły ruch ceny spółki lub ETF-u z portfela w ciągu dnia" icon={Activity}>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-stone-700 dark:text-stone-200">Powiadamiaj o krytycznych zmianach cen</span>
            <Switch on={prefs.prices.on} onChange={(v) => save({ prices: { on: v } })} label="Krytyczne zmiany notowań" disabled={!ready} />
          </div>
          <label className="flex flex-wrap items-center gap-2 text-stone-600 dark:text-stone-300">
            Próg dzisiejszej zmiany
            <select value={prefs.prices.threshold} onChange={(e) => save({ prices: { threshold: Number(e.target.value) } })} disabled={!ready || !prefs.prices.on} aria-label="Próg krytycznej zmiany" className={selectCls}>
              {[...new Set([...THRESHOLDS, prefs.prices.threshold])].sort((a, b) => a - b).map((t) => (
                <option key={t} value={t}>
                  ±{t}%
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-stone-500 dark:text-stone-400">
            Np. „FinTrack 📊 – 🚨 Krytyczna zmiana notowań: PKO Bank Polski zanotowała zmianę o −4,6%! 📉”. Sprawdzane po każdym pobraniu kursów w aplikacji, a przy Web Push także przez serwer co godzinę w dni robocze 9–22. Jedno powiadomienie na spółkę dziennie – kolejne, gdy ruch pogłębi się o następną wielokrotność progu (np. ±8%).
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => checkPrices(false)} className={btnCls}>
              <Eye size={15} /> Sprawdź dzisiejsze zmiany
            </button>
            <button type="button" onClick={() => checkPrices(true)} disabled={!ready} className={btnCls}>
              <Send size={15} /> Wyślij teraz
            </button>
          </div>
          {priceCheck && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/[0.03]" aria-label="Wynik sprawdzenia zmian">
              {priceCheck.all.length === 0 ? (
                <p className="text-stone-500 dark:text-stone-400">Brak dzisiejszych notowań na żywo dla pozycji z portfela – odśwież kursy w trakcie sesji.</p>
              ) : (
                <>
                  <p className="font-semibold">{priceCheck.over.length ? `Ponad próg ±${prefs.prices.threshold}%: ${priceCheck.over.map((c) => `${c.label} ${pctText(c.pct)}`).join(', ')}` : `Żadna pozycja nie przekracza ±${prefs.prices.threshold}%`}</p>
                  <p className="mt-1 text-stone-500 dark:text-stone-400">Największe ruchy dziś: {priceCheck.all.slice(0, 5).map((c) => `${c.label} ${pctText(c.pct)}`).join(' · ')}</p>
                </>
              )}
            </div>
          )}
        </div>
      </Box>

      <Box title="Raport o spółkach z portfela" subtitle="Podsumowanie wiadomości z poprzedniego dnia" icon={Newspaper}>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-stone-700 dark:text-stone-200">Wysyłaj podsumowanie wiadomości</span>
            <Switch on={prefs.news.on} onChange={(v) => save({ news: { on: v } })} label="Raport o spółkach" disabled={!ready} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-stone-600 dark:text-stone-300">
            <label className="flex items-center gap-2">
              Co najmniej
              <input
                type="number"
                min="1"
                max="50"
                value={prefs.news.min}
                onChange={(e) => save({ news: { min: Number(e.target.value) || 1 } })}
                disabled={!ready || !prefs.news.on}
                aria-label="Minimalna liczba artykułów"
                className={`${selectCls} w-16 text-center`}
              />
              nowych artykułów
            </label>
            <label className="flex items-center gap-2">
              Pora
              <select value={prefs.news.slot} onChange={(e) => save({ news: { slot: e.target.value } })} disabled={!ready || !prefs.news.on} aria-label="Pora raportu" className={selectCls}>
                {Object.entries(NEWS_SLOTS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-[11px] text-stone-500 dark:text-stone-400">
            Liczą się artykuły, których głównym tematem jest spółka z portfela ({watch.length ? watch.map((t) => t.label).join(', ') : 'brak otwartych pozycji'}), bez „Analiz ogólnych”.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => runPreview(false)} disabled={busy === 'preview' || !watch.length} className={btnCls}>
              <Eye size={15} /> {busy === 'preview' ? 'Liczenie…' : 'Podgląd raportu za wczoraj'}
            </button>
            <button type="button" onClick={() => runPreview(true)} disabled={!ready || busy === 'preview' || !watch.length} className={btnCls}>
              <Send size={15} /> Wyślij teraz
            </button>
          </div>
          {preview && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/[0.03]" role="status">
              {preview.error ? (
                <span className="text-amber-700 dark:text-amber-400">Nie udało się pobrać wiadomości: {preview.error}</span>
              ) : (
                <>
                  <p className="font-semibold">
                    {preview.day}: {preview.digest.total} {preview.digest.total === 1 ? 'artykuł' : 'artykułów'} o spółkach z portfela
                    {preview.digest.byCompany.length > 0 && ` – ${preview.digest.byCompany.map((c) => `${c.label} (${c.count})`).join(', ')}`}
                  </p>
                  <p className="mt-1 text-stone-500 dark:text-stone-400">{preview.msg ? `Powiadomienie: „${preview.msg.body}”` : `Poniżej progu (${prefs.news.min}) – powiadomienie nie zostanie wysłane.`}</p>
                </>
              )}
            </div>
          )}
        </div>
      </Box>

      <Box title="Powiadomienia z serwera (Web Push)" subtitle="Także przy całkowicie zamkniętej aplikacji" icon={Cloud}>
        <div className="space-y-3 text-sm">
          {!vapidPublicKey() ? (
            <p className="text-stone-600 dark:text-stone-300">
              Serwer powiadomień nie jest jeszcze skonfigurowany (brak klucza <code className="font-mono text-xs">VITE_VAPID_PUBLIC_KEY</code>). Do tego czasu działają powiadomienia z aplikacji – gdy jest uruchomiona, także w tle.
            </p>
          ) : !pushSupported() ? (
            <p className="text-stone-600 dark:text-stone-300">Ta przeglądarka nie obsługuje Web Push. Na iPhonie dodaj aplikację do ekranu początkowego (iOS 16.4+).</p>
          ) : !userId ? (
            <p className="text-stone-600 dark:text-stone-300">Zaloguj się do konta w chmurze (Ustawienia → Konto i synchronizacja), aby serwer mógł wysyłać powiadomienia na to urządzenie.</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-stone-700 dark:text-stone-200">{pushSub ? 'Włączone na tym urządzeniu' : 'Wyłączone na tym urządzeniu'}</span>
                <Switch on={!!pushSub} onChange={togglePush} label="Powiadomienia z serwera" disabled={busy === 'push'} />
              </div>
              <button type="button" onClick={testServer} disabled={!pushSub || busy === 'server'} className={btnCls}>
                <Send size={15} /> {busy === 'server' ? 'Wysyłanie…' : 'Wyślij testowe z serwera'}
              </button>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">Ustawienia powyżej (godzina, próg, pora) i lista spółek z portfela zapisują się w subskrypcji; serwer sprawdza je co godzinę.</p>
            </>
          )}
        </div>
      </Box>
    </div>
  );
}
