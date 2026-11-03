import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { notificationPermission, readNotifySettings } from '../../lib/notifications.js';
import { NEWS_SLOTS } from '../../lib/notifyPlan.js';
import NotificationsView from '../../views/NotificationsView.jsx';
import { Card } from '../ui.jsx';

// Pełna konfiguracja powiadomień (zgoda, zadania, krytyczne zmiany notowań, raport o spółkach, Web Push) –
// jedyne miejsce zarządzania powiadomieniami; #/settings/notifications (i dawny #/notifications) otwiera ją od razu
export default function NotificationsCard({ defaultOpen = false }) {
  // Stan odświeżany po każdej zmianie ustawień w panelu poniżej
  const [p, setP] = useState(readNotifySettings);
  useEffect(() => {
    const onChange = () => setP(readNotifySettings());
    window.addEventListener('wealth-app-prefs-changed', onChange);
    return () => window.removeEventListener('wealth-app-prefs-changed', onChange);
  }, []);
  const on = p.enabled && notificationPermission() === 'granted';
  const summary = on
    ? [p.tasks.on && `zadania o ${p.tasks.hour}:00`, p.prices.on && `zmiany cen ±${p.prices.threshold}%`, p.news.on && `raport o spółkach ${NEWS_SLOTS[p.news.slot].label} (od ${p.news.min} art.)`]
        .filter(Boolean)
        .join(' · ') || 'włączone, bez aktywnych przypomnień'
    : 'wyłączone';
  const ref = useRef(null);
  useEffect(() => {
    if (defaultOpen) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [defaultOpen]);
  return (
    <div ref={ref} id="notifications" className="scroll-mt-20">
      <Card title="Powiadomienia" subtitle={`Stan: ${summary}`} icon={Bell} defaultOpen={defaultOpen} bodyClassName="p-2.5 sm:p-3">
        <NotificationsView embedded />
      </Card>
    </div>
  );
}
