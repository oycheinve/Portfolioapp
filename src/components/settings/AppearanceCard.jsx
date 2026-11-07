import { Heart, Monitor, Moon, Palette, Sun } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { Card } from '../ui.jsx';

// Motyw aplikacji: jasny, ciemny, różowy (jasny wariant z różową paletą) albo zgodny z systemem.
// Zapis w ustawieniach (urządzenie + chmura) – aplikacja pamięta wybór po ponownym uruchomieniu.
export const THEMES = [
  { id: 'light', label: 'Jasny', icon: Sun, swatch: ['#fafaf9', '#ffffff', '#2563eb'] },
  { id: 'dark', label: 'Ciemny', icon: Moon, swatch: ['#0a0a0a', '#171717', '#3b82f6'] },
  { id: 'pink', label: 'Różowy', icon: Heart, swatch: ['#fdf2f6', '#fffafc', '#db2777'] },
  { id: 'system', label: 'Systemowy', icon: Monitor, swatch: ['#fafaf9', '#0a0a0a', '#2563eb'] },
];

export default function AppearanceCard() {
  const { state, actions } = useApp();
  const theme = state.settings.theme || 'system';
  return (
    <Card title="Motyw aplikacji" subtitle="Jasny, ciemny, różowy albo zgodny z ustawieniem telefonu / komputera" icon={Palette}>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" role="radiogroup" aria-label="Wybór motywu">
        {THEMES.map((t) => {
          const on = theme === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => actions.updateSettings({ theme: t.id })}
              className={`flex flex-col items-stretch gap-2 rounded-xl border p-2.5 text-left transition-colors ${
                on ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-stone-200 hover:bg-stone-50 dark:border-white/10 dark:hover:bg-white/[0.03]'
              }`}
            >
              <span className="flex h-12 overflow-hidden rounded-lg border border-black/5" aria-hidden="true">
                <span className="flex-1" style={{ background: t.swatch[0] }} />
                <span className="flex flex-1 items-center justify-center" style={{ background: t.swatch[1] }}>
                  <span className="h-3 w-6 rounded-full" style={{ background: t.swatch[2] }} />
                </span>
              </span>
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <Icon size={15} className={t.id === 'pink' ? 'text-pink-500' : ''} /> {t.label}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-stone-500 dark:text-stone-400">Wybór zapisuje się na tym urządzeniu i w chmurze. Szybka zmiana – także w menu „Więcej” i przyciskiem motywu w górnym pasku.</p>
    </Card>
  );
}
