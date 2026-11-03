import { Bell, ChevronRight } from 'lucide-react';
import { notificationPermission, readNotifySettings } from '../../lib/notifications.js';
import { NEWS_SLOTS } from '../../lib/notifyPlan.js';
import { Card } from '../ui.jsx';

// Skrót do pełnego panelu powiadomień (#/notifications) ze stanem bieżących ustawień
export default function NotificationsCard() {
  const p = readNotifySettings();
  const on = p.enabled && notificationPermission() === 'granted';
  const summary = on
    ? [p.tasks.on && `zadania o ${p.tasks.hour}:00`, p.prices.on && `zmiany cen ±${p.prices.threshold}%`, p.news.on && `raport o spółkach ${NEWS_SLOTS[p.news.slot].label} (od ${p.news.min} art.)`].filter(Boolean).join(' · ') || 'włączone, bez aktywnych przypomnień'
    : 'wyłączone';
  return (
    <Card title="Powiadomienia" subtitle="Zadania, krytyczne zmiany notowań, raport o spółkach, Web Push" icon={Bell}>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-stone-600 dark:text-stone-300">Stan: {summary}</span>
        <a href="#/notifications" className="inline-flex h-9 items-center gap-1 rounded-lg bg-blue-600 px-3 font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:text-neutral-950">
          Ustawienia powiadomień <ChevronRight size={16} />
        </a>
      </div>
    </Card>
  );
}
