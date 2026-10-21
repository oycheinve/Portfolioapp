import { useMemo } from 'react';
import { ArrowLeftRight, LayoutDashboard, LineChart, Monitor, Moon, PieChart, RefreshCw, Settings, Sun, Wallet } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { formatDateTime } from '../lib/format.js';
import { computeAllocation } from '../lib/allocation.js';

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Pulpit', longLabel: 'Pulpit (Majątek)', icon: LayoutDashboard },
  { id: 'allocation', label: 'Alokacja', longLabel: 'Alokacja i Dopłaty', icon: PieChart },
  { id: 'charts', label: 'Wykresy', longLabel: 'Wykresy i Obligacje', icon: LineChart },
  { id: 'cash', label: 'Wpłaty', longLabel: 'Rejestr Wpłat/Wypłat', icon: ArrowLeftRight },
  { id: 'settings', label: 'Ustawienia', longLabel: 'Konta i ustawienia', icon: Settings },
];

const THEME_CYCLE = { light: 'dark', dark: 'system', system: 'light' };
const THEME_ICON = { light: Sun, dark: Moon, system: Monitor };
const THEME_LABEL = { light: 'Motyw jasny', dark: 'Motyw ciemny', system: 'Motyw systemowy' };

function PriceStatus() {
  const { state } = useApp();
  const { status, lastRefresh } = state.prices;
  const map = {
    live: { dot: 'bg-emerald-500', text: 'Kursy na żywo' },
    partial: { dot: 'bg-amber-500', text: 'Kursy częściowo symulowane' },
    mock: { dot: 'bg-stone-400', text: 'Kursy symulowane' },
    loading: { dot: 'bg-blue-500 animate-pulse', text: 'Pobieranie…' },
    error: { dot: 'bg-red-500', text: 'Błąd notowań' },
    idle: { dot: 'bg-stone-400', text: 'Brak notowań' },
  };
  const s = map[status] || map.idle;
  return (
    <div className="hidden items-center gap-2 text-xs text-stone-500 sm:flex dark:text-stone-400">
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      <span>{s.text}</span>
      {lastRefresh && <span className="hidden lg:inline">· {formatDateTime(lastRefresh)}</span>}
    </div>
  );
}

export function Layout({ view, onNavigate, children }) {
  const { state, actions, refreshing } = useApp();
  const theme = state.settings.theme;
  const ThemeIcon = THEME_ICON[theme] || Monitor;
  const current = NAV_ITEMS.find((n) => n.id === view);
  // Liczba pozycji przekraczających próg odchylenia – znaczek przy zakładce alokacji
  const badges = useMemo(() => {
    if (state.accounts.length === 0) return {};
    const count = computeAllocation(state).alerts.length;
    return count > 0 ? { allocation: count } : {};
  }, [state]);

  return (
    <div className="flex min-h-screen">
      {/* Nawigacja boczna – desktop */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-stone-200 bg-white px-3 py-5 md:flex dark:border-white/10 dark:bg-neutral-900">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white dark:bg-blue-500">
            <Wallet size={18} />
          </span>
          <div>
            <div className="text-sm font-semibold leading-tight">Mój Majątek</div>
            <div className="text-[11px] text-stone-500 dark:text-stone-400">Portfel i cele</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1" aria-label="Główna nawigacja">
          {NAV_ITEMS.map((item) => {
            const active = item.id === view;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
                    : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-white/5'
                }`}
              >
                <Icon size={18} />
                {item.longLabel}
                {badges[item.id] && (
                  <span
                    className="ml-auto rounded-full bg-red-600 px-1.5 text-[10px] leading-4 font-semibold text-white"
                    title={`${badges[item.id]} pozycji poza progiem odchylenia`}
                  >
                    {badges[item.id]}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto space-y-2 px-2 text-[11px] text-stone-500 dark:text-stone-500">
          {state.meta.demo && (
            <div className="rounded-lg bg-amber-50 px-2.5 py-2 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              Tryb demonstracyjny – dane przykładowe. Wyczyść je w ustawieniach.
            </div>
          )}
          <div>Dane zapisywane lokalnie w przeglądarce.</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Górny pasek */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-stone-200 bg-white/85 px-4 backdrop-blur sm:px-6 dark:border-white/10 dark:bg-neutral-950/85">
          <div className="flex items-center gap-2 md:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white dark:bg-blue-500">
              <Wallet size={16} />
            </span>
          </div>
          <h1 className="truncate text-base font-semibold">{current?.longLabel}</h1>
          <div className="ml-auto flex items-center gap-2">
            <PriceStatus />
            <button
              type="button"
              onClick={() => actions.refreshPrices()}
              disabled={refreshing}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60 dark:border-white/10 dark:bg-neutral-800 dark:text-stone-200 dark:hover:bg-neutral-700"
              title="Odśwież notowania i kursy walut"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Odśwież kursy</span>
            </button>
            <button
              type="button"
              onClick={() => actions.updateSettings({ theme: THEME_CYCLE[theme] || 'light' })}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-white/5"
              aria-label={`${THEME_LABEL[theme]} – kliknij, aby zmienić`}
              title={`${THEME_LABEL[theme]} – kliknij, aby zmienić`}
            >
              <ThemeIcon size={18} />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-4 pb-24 sm:px-6 sm:pt-6 md:pb-10">{children}</main>
      </div>

      {/* Nawigacja dolna – mobile */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-white/10 dark:bg-neutral-900/95"
        aria-label="Nawigacja dolna"
      >
        {NAV_ITEMS.map((item) => {
          const active = item.id === view;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                active ? 'text-blue-600 dark:text-blue-400' : 'text-stone-500 dark:text-stone-400'
              }`}
            >
              <span className="relative">
                <Icon size={20} />
                {badges[item.id] && (
                  <span className="absolute -top-1 -right-2 min-w-4 rounded-full bg-red-600 px-1 text-[9px] leading-4 font-semibold text-white">
                    {badges[item.id]}
                  </span>
                )}
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export function Toast() {
  const { toast, dismissToast } = useApp();
  if (!toast) return null;
  const tones = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-950 dark:text-emerald-200',
    warn: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/20 dark:bg-amber-950 dark:text-amber-200',
    error: 'border-red-200 bg-red-50 text-red-900 dark:border-red-500/20 dark:bg-red-950 dark:text-red-200',
    info: 'border-stone-200 bg-white text-stone-800 dark:border-white/10 dark:bg-neutral-900 dark:text-stone-200',
  };
  return (
    <div className="fixed inset-x-4 bottom-20 z-50 flex justify-center md:bottom-6" role="status" aria-live="polite">
      <button
        type="button"
        onClick={dismissToast}
        className={`max-w-md rounded-xl border px-4 py-2.5 text-left text-sm shadow-lg ${tones[toast.type] || tones.info}`}
      >
        {toast.message}
      </button>
    </div>
  );
}
