import { useState } from 'react';
import { Bell, BellOff, Send } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { notificationPermission, notificationsSupported, readNotifySettings, requestNotificationPermission, showNotification, writeNotifySettings } from '../../lib/notifications.js';
import { Card } from '../ui.jsx';

const HOURS = Array.from({ length: 17 }, (_, i) => i + 7); // 7:00 – 23:00

// Powiadomienia (PWA): zgoda przeglądarki, przypomnienie o niewykonanych zadaniach dziennych, powiadomienie testowe
export default function NotificationsCard() {
  const { actions } = useApp();
  const [settings, setSettings] = useState(readNotifySettings);
  const [permission, setPermission] = useState(notificationPermission);
  const supported = notificationsSupported();
  const save = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    writeNotifySettings(next);
  };
  const toggle = async () => {
    if (settings.enabled) return save({ enabled: false });
    const p = await requestNotificationPermission();
    setPermission(p);
    if (p === 'granted') save({ enabled: true });
    else actions.notify(p === 'denied' ? 'Powiadomienia są zablokowane w ustawieniach przeglądarki / telefonu dla tej aplikacji' : 'Nie udzielono zgody na powiadomienia', 'warn');
    return undefined;
  };
  const test = async () => {
    const ok = await showNotification('FinTrack', { body: 'Powiadomienia działają ✓', url: '/#/settings', tag: 'test' });
    if (!ok) actions.notify('Nie udało się wyświetlić powiadomienia – sprawdź zgodę w ustawieniach telefonu', 'warn');
  };
  const on = settings.enabled && permission === 'granted';

  return (
    <Card title="Powiadomienia" subtitle="Przypomnienie o zadaniach dziennych · aplikacja zainstalowana na telefonie" icon={Bell}>
      {!supported ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">Ta przeglądarka nie obsługuje powiadomień. Na iPhonie działają po dodaniu aplikacji do ekranu początkowego (iOS 16.4+).</p>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              aria-pressed={on}
              className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 font-semibold ${on ? 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:text-neutral-950' : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-white/10 dark:bg-neutral-800 dark:text-stone-200'}`}
            >
              {on ? <Bell size={16} /> : <BellOff size={16} />} {on ? 'Powiadomienia włączone' : 'Włącz powiadomienia'}
            </button>
            <button type="button" onClick={test} disabled={!on} className="inline-flex h-9 items-center gap-2 rounded-lg border border-stone-200 px-3 text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-white/10 dark:text-stone-200 dark:hover:bg-white/5">
              <Send size={15} /> Wyślij testowe
            </button>
          </div>
          <label className="flex flex-wrap items-center gap-2 text-stone-600 dark:text-stone-300">
            Przypomnij o niewykonanych zadaniach dziennych od
            <select
              value={settings.taskHour}
              onChange={(e) => save({ taskHour: Number(e.target.value) })}
              disabled={!on}
              aria-label="Godzina przypomnienia"
              className="h-8 rounded-lg border border-stone-200 bg-white px-2 text-sm disabled:opacity-50 dark:border-white/10 dark:bg-neutral-800"
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {h}:00
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-stone-500 dark:text-stone-400">
            Raz dziennie, gdy aplikacja jest uruchomiona (także zminimalizowana). Zgoda: {permission === 'granted' ? 'udzielona' : permission === 'denied' ? 'zablokowana – zmień w ustawieniach telefonu / przeglądarki' : 'jeszcze nie udzielona'}.
          </p>
        </div>
      )}
    </Card>
  );
}
