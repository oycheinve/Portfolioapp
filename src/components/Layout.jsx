import { useMemo, useState } from 'react';
import { ArrowLeftRight, ClipboardList, Cloud, CloudOff, Coins, FileText, Flame, FlaskConical, LayoutDashboard, LineChart, Menu, Monitor, Moon, Newspaper, PieChart, RefreshCw, Settings, Shield, Sun, Table2, Target, Wallet, X } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { formatDateTime } from '../lib/format.js';
import { computeAllocation } from '../lib/allocation.js';

// mobile: true = zakładka w dolnym pasku na telefonie; pozostałe w arkuszu „Więcej”
export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Pulpit', longLabel: 'Pulpit (Majątek)', icon: LayoutDashboard, mobile: true },
  { id: 'portfolio', label: 'Portfel', longLabel: 'Portfel', icon: Table2, mobile: true },
  { id: 'charts', label: 'Wykresy', longLabel: 'Wykresy i notowania', icon: LineChart, mobile: true },
  { id: 'dividends', label: 'Dywidendy', longLabel: 'Dywidendy', icon: Coins },
  { id: 'simulations', label: 'Symulacje', longLabel: 'Symulacje i kalkulator', icon: FlaskConical },
  { id: 'safe', label: 'Poduszka', longLabel: 'Poduszka finansowa', icon: Shield },
  { id: 'allocation', label: 'Alokacja', longLabel: 'Alokacja i Dopłaty', icon: PieChart },
  { id: 'goals', label: 'Cele', longLabel: 'Cele roczne', icon: Target, mobile: true },
  // Nazwa z rokiem docelowym z ustawień FIRE (np. „FIRE 2055”) – navLabel()
  { id: 'fire', label: 'FIRE', longLabel: 'FIRE', icon: Flame },
  { id: 'reports', label: 'Raport X', longLabel: 'Raport na X', icon: FileText },
  { id: 'cash', label: 'Wpłaty', longLabel: 'Rejestr Wpłat/Wypłat', icon: ArrowLeftRight },
  { id: 'budget', label: 'Budżet', longLabel: 'Budżet (Demo)', icon: ClipboardList, mobile: true },
  { id: 'news', label: 'Newsy', longLabel: 'Newsy giełdowe', icon: Newspaper },
  { id: 'settings', label: 'Ustawienia', longLabel: 'Konta i ustawienia', icon: Settings },
];

// Kolejność zakładek w dolnym pasku (telefon) – niezależna od kolejności w menu bocznym; za nimi „Więcej”
const MOBILE_ORDER = ['dashboard', 'portfolio', 'charts', 'budget', 'goals'];
const MOBILE_ITEMS = MOBILE_ORDER.map((id) => NAV_ITEMS.find((n) => n.id === id)).filter(Boolean);

// Kolejność kafelków w arkuszu „Więcej” (telefon); Ustawienia na końcu, pod nimi przełącznik motywu
const MORE_ORDER = ['safe', 'simulations', 'allocation', 'fire', 'reports', 'cash', 'dividends', 'news', 'settings'];
const MORE_ITEMS = [...MORE_ORDER.map((id) => NAV_ITEMS.find((n) => n.id === id)), ...NAV_ITEMS.filter((n) => !n.mobile && !MORE_ORDER.includes(n.id))].filter(Boolean);

// Etykieta pozycji menu – FIRE z rokiem docelowym
export function navLabel(item, settings, long = true) {
  if (item?.id === 'fire') return `FIRE ${settings?.fire?.targetYear || ''}`.trim();
  return long ? item?.longLabel : item?.label;
}

const THEME_CYCLE = { light: 'dark', dark: 'system', system: 'light' };
const THEME_ICON = { light: Sun, dark: Moon, system: Monitor };
const THEME_LABEL = { light: 'Motyw jasny', dark: 'Motyw ciemny', system: 'Motyw systemowy' };

function PriceStatus() {
  const { state } = useApp();
  const { status, lastRefresh } = state.prices;
  const map = {
    live: { dot: 'bg-emerald-500', text: 'Kursy na żywo' },
    partial: { dot: 'bg-amber-500', text: 'Część kursów z ostatnich danych' },
    offline: { dot: 'bg-stone-400', text: 'Kursy z ostatnich danych' },
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

// Stan synchronizacji z chmurą (tylko po zalogowaniu) – kliknięcie prowadzi do Ustawień
const CLOUD_LABEL = { synced: 'Zsynchronizowano z chmurą', pending: 'Zmiany czekają na zapis w chmurze', saving: 'Zapisywanie w chmurze…', error: 'Błąd synchronizacji z chmurą – spróbuję ponownie' };
function CloudStatus({ onNavigate }) {
  const { cloud } = useApp();
  if (!cloud?.enabled) return null;
  const Icon = cloud.status === 'error' ? CloudOff : Cloud;
  const color = cloud.status === 'error' ? 'text-red-600 dark:text-red-400' : cloud.status === 'synced' ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-400 animate-pulse';
  const label = `${CLOUD_LABEL[cloud.status] || ''} · ${cloud.user.email}`;
  return (
    <button type="button" onClick={() => onNavigate('settings')} className={`inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-stone-100 dark:hover:bg-white/5 ${color}`} aria-label={label} title={label}>
      <Icon size={18} />
    </button>
  );
}

export function Layout({ view, onNavigate, children }) {
  const { state, actions, refreshing } = useApp();
  const theme = state.settings.theme;
  const ThemeIcon = THEME_ICON[theme] || Monitor;
  const current = NAV_ITEMS.find((n) => n.id === view);
  const [moreOpen, setMoreOpen] = useState(false);
  // Liczba pozycji przekraczających próg odchylenia – znaczek przy zakładce alokacji
  const badges = useMemo(() => {
    if (state.accounts.length === 0) return {};
    const out = {};
    const count = computeAllocation(state).alerts.length;
    if (count > 0) out.allocation = count;
    return out;
  }, [state]);

  return (
    <div className="flex min-h-screen">
      {/* Nawigacja boczna – desktop */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-stone-200 bg-white px-3 py-5 md:flex dark:border-white/10 dark:bg-neutral-900">
        <div className="mb-4 flex shrink-0 items-center gap-2.5 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white dark:bg-blue-500">
            <Wallet size={18} />
          </span>
          <div>
            <div className="text-sm font-semibold leading-tight">Mój Majątek</div>
            <div className="text-[11px] text-stone-500 dark:text-stone-400">Portfel i cele</div>
          </div>
        </div>
        <nav className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1" aria-label="Główna nawigacja">
          {NAV_ITEMS.map((item) => {
            const active = item.id === view;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-1.5 text-left text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
                    : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-white/5'
                }`}
              >
                <Icon size={18} />
                {navLabel(item, state.settings)}
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
        <div className="mt-3 shrink-0 space-y-2 px-2 text-[11px] text-stone-500 dark:text-stone-500">
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
          <h1 className="truncate text-base font-semibold">{navLabel(current, state.settings)}</h1>
          <div className="ml-auto flex items-center gap-2">
            <CloudStatus onNavigate={onNavigate} />
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
        {MOBILE_ITEMS.map((item) => (
          <BottomTab key={item.id} item={item} active={item.id === view} badge={badges[item.id]} onClick={() => onNavigate(item.id)} />
        ))}
        <BottomTab
          item={{ id: 'more', label: 'Więcej', icon: Menu }}
          active={!NAV_ITEMS.find((n) => n.id === view)?.mobile}
          badge={NAV_ITEMS.filter((n) => !n.mobile).reduce((s2, n) => s2 + (badges[n.id] || 0), 0) || null}
          onClick={() => setMoreOpen(true)}
        />
      </nav>

      {/* Arkusz „Więcej” – mobile: siatka zaokrąglonych kart + przełącznik motywu */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm md:hidden" onClick={() => setMoreOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Więcej sekcji"
            className="absolute inset-x-0 bottom-0 rounded-t-[28px] bg-white px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={() => setMoreOpen(false)} aria-label="Zamknij" className="mx-auto mb-3 flex h-6 w-16 items-center justify-center">
              <span className="h-1.5 w-12 rounded-full bg-stone-300 dark:bg-white/20" />
            </button>
            <div className="grid max-h-[62vh] grid-cols-2 gap-3 overflow-y-auto">
              {MORE_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.id === view;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      onNavigate(item.id);
                    }}
                    aria-current={active ? 'page' : undefined}
                    className={`relative flex min-h-[4.75rem] items-center gap-3 rounded-[22px] px-3.5 py-3 text-left text-[15px] leading-tight font-semibold transition-colors ${
                      active
                        ? 'bg-blue-100/80 text-blue-900 dark:bg-blue-500/15 dark:text-blue-200'
                        : 'bg-stone-100/80 text-stone-800 active:bg-stone-200 dark:bg-white/[0.06] dark:text-stone-100 dark:active:bg-white/10'
                    }`}
                  >
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${active ? 'bg-white/80 dark:bg-white/10' : 'bg-white/70 dark:bg-white/10'}`}>
                      <Icon size={20} strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0">{navLabel(item, state.settings)}</span>
                    {badges[item.id] && <span className="absolute top-2 right-2.5 rounded-full bg-red-600 px-1.5 text-[10px] leading-4 font-semibold text-white">{badges[item.id]}</span>}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-[22px] bg-stone-100/80 py-2.5 pr-2.5 pl-4 dark:bg-white/[0.06]">
              <span className="text-[15px] font-semibold">Motyw</span>
              <div className="flex items-center gap-1 rounded-full bg-white/70 p-1 dark:bg-white/10" role="radiogroup" aria-label="Motyw aplikacji">
                {['light', 'dark', 'system'].map((t) => {
                  const TIcon = THEME_ICON[t];
                  const on = theme === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={THEME_LABEL[t]}
                      title={THEME_LABEL[t]}
                      onClick={() => actions.updateSettings({ theme: t })}
                      className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                        on ? 'bg-white text-amber-500 shadow-sm dark:bg-neutral-700 dark:text-amber-300' : 'text-stone-500 dark:text-stone-400'
                      }`}
                    >
                      <TIcon size={18} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BottomTab({ item, active, badge, onClick }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium sm:text-[11px] ${active ? 'text-blue-600 dark:text-blue-400' : 'text-stone-500 dark:text-stone-400'}`}
    >
      <span className="relative">
        <Icon size={20} />
        {badge && (
          <span className="absolute -top-1 -right-2 min-w-4 rounded-full bg-red-600 px-1 text-[9px] leading-4 font-semibold text-white">{badge}</span>
        )}
      </span>
      {item.label}
    </button>
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
