import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { reducer } from './reducer.js';
import { COLLECTIONS, STATE_VERSION, STORAGE_KEY, migrateState } from './schema.js';
import { validateBackup } from '../lib/backup.js';
import { createDemoState } from './demoData.js';
import { autoFundingCashflows, buildSnapshot, isAutoFunding, isBondRedemption, isoDay, livePriceLookup } from '../lib/engine.js';
import { refreshAllPrices } from '../lib/prices.js';
import { fetchAllHistory } from '../lib/history.js';
import { pendingSavingsInterest } from '../lib/savings.js';
import { computeLimitsForYear } from '../lib/tax.js';
import { uid } from '../lib/format.js';
import { reconcileDividends } from '../lib/dividends.js';
import { runDividendSync } from '../lib/dividendSync.js';
import { MARKET_OPEN_MIN, isWarsawMarketOpen, mayAutoFetch, warsawClock } from '../lib/marketHours.js';
import { useCloudSync } from './useCloudSync.js';

const AppContext = createContext(null);

function loadInitialState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return migrateState(JSON.parse(raw));
  } catch {
    // uszkodzony zapis – startujemy od danych demo
  }
  return createDemoState();
}

// Przywrócenie ustawień widoków i kalkulatorów z kopii zapasowej (klucze „wealth-app-…” poza stanem danych)
function restoreUiPrefs(uiPrefs) {
  if (!uiPrefs || typeof uiPrefs !== 'object') return;
  try {
    for (const [k, v] of Object.entries(uiPrefs)) {
      if (k.startsWith('wealth-app-') && k !== STORAGE_KEY && typeof v === 'string') localStorage.setItem(k, v);
    }
  } catch {
    // brak localStorage – ustawienia widoków pozostaną domyślne
  }
}

function useSystemDark() {
  const [dark, setDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return undefined;
    const handler = (e) => setDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return dark;
}

export function AppProvider({ children, cloud = null }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitialState);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState(null);
  const systemDark = useSystemDark();
  const saveTimer = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Trwały zapis w localStorage (z opóźnieniem, by nie zapisywać przy każdym naciśnięciu klawisza)
  useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        setToast({ type: 'error', message: 'Nie udało się zapisać danych w przeglądarce (brak miejsca?).' });
      }
    }, 300);
    return () => clearTimeout(saveTimer.current);
  }, [state]);

  // Motyw jasny / ciemny
  const isDark = state.settings.theme === 'dark' || (state.settings.theme === 'system' && systemDark);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  // Dzienna migawka wartości kont (aktualizowana przy zmianach danych i cen)
  useEffect(() => {
    if (state.accounts.length === 0) return;
    const today = isoDay(new Date());
    const snap = buildSnapshot(state, today, livePriceLookup(state));
    const existing = state.snapshots.find((s) => s.date === today);
    if (existing && JSON.stringify(existing.accounts) === JSON.stringify(snap.accounts)) return;
    dispatch({ type: 'UPSERT_SNAPSHOT', payload: snap });
  }, [state.accounts, state.trades, state.cashflows, state.income, state.bonds, state.prices, state.settings]); // eslint-disable-line react-hooks/exhaustive-deps

  // Gotówka na rachunkach ≥ 0: zakupy bez pokrycia uzupełniane automatyczną wpłatą (poza kontami debetowymi)
  useEffect(() => {
    // Dawne automatyczne wypłaty z tytułu wykupu obligacji są usuwane – wykup po prostu znika z portfela
    const desired = autoFundingCashflows(state);
    const current = state.cashflows.filter((c) => isAutoFunding(c) || isBondRedemption(c));
    const key = (list) =>
      list
        .map((c) => `${c.id}|${c.accountId}|${c.date}|${c.amount}`)
        .sort()
        .join(';');
    if (key(desired) !== key(current)) dispatch({ type: 'SYNC_AUTO_FUNDING', payload: desired });
  }, [state.accounts, state.bonds, state.cashflows, state.trades, state.income, state.instruments, state.settings.cpiOverrides]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dywidendy bez ręcznego klikania: parowanie harmonogramu z rejestrem (np. import XTB) i autoksięgowanie po dniu wypłaty
  useEffect(() => {
    if (state.dividendSchedule.length === 0) return;
    const r = reconcileDividends(state, { autoBook: state.settings.dividendPrefs?.autoBook !== false });
    if (r.removeIncome.length) dispatch({ type: 'REMOVE_MANY', payload: { collection: 'income', ids: r.removeIncome } });
    if (r.addIncome.length) dispatch({ type: 'ADD_MANY', payload: { collection: 'income', items: r.addIncome } });
    for (const u of r.updates) dispatch({ type: 'UPSERT', payload: { collection: 'dividendSchedule', item: u } });
  }, [state.income, state.dividendSchedule, state.trades, state.settings.dividendPrefs?.autoBook]); // eslint-disable-line react-hooks/exhaustive-deps

  // Etap 3: automatyczne księgowanie odsetek na kontach oszczędnościowych (za zakończone okresy kapitalizacji)
  useEffect(() => {
    if (!state.accounts.some((a) => a.type === 'SAVINGS' && a.autoInterest)) return;
    const pending = pendingSavingsInterest(state);
    if (pending.length) dispatch({ type: 'ADD_MANY', payload: { collection: 'income', items: pending } });
  }, [state.accounts, state.cashflows, state.income]); // eslint-disable-line react-hooks/exhaustive-deps

  // Etap 6: po Nowym Roku automatycznie uzupełnij limity IKE/IKZE na bieżący rok (szacunek do czasu ogłoszenia)
  useEffect(() => {
    const year = new Date().getFullYear();
    const s = state.settings;
    if (!s.limitsPolicy?.autoUpdate || s.contributionLimits?.[year]) return;
    const { source, ...limits } = computeLimitsForYear(s, year);
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: {
        contributionLimits: { ...s.contributionLimits, [year]: limits },
        contributionLimitsMeta: { ...(s.contributionLimitsMeta || {}), [year]: source },
      },
    });
    setToast({ type: 'info', message: `Ustawiono limity wpłat na ${year} r. (${source === 'wage' ? 'z prognozy wynagrodzenia' : 'szacunek'}) – zweryfikuj po ogłoszeniu.`, id: Date.now() });
  }, [state.settings.limitsPolicy, state.settings.contributionLimits]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const notify = useCallback((message, type = 'info') => setToast({ message, type, id: Date.now() }), []);

  // silent – odświeżenie automatyczne (przy wejściu do aplikacji); komunikat o źródle kursów pokazywany zawsze
  // Trwające pobieranie trzymane w pamięci (nie w zapisywanym stanie) – zamknięcie aplikacji w trakcie nie blokuje
  // kolejnych odświeżeń; ponowne kliknięcie w trakcie pobierania nie uruchamia drugiego
  const pricesInflight = useRef(false);
  const refreshPrices = useCallback(
    async (modeOverride, { silent = false } = {}) => {
      if (pricesInflight.current) return;
      pricesInflight.current = true;
      const s = stateRef.current;
      setRefreshing(true);
      try {
        const result = await refreshAllPrices({
          instruments: s.instruments,
          previous: s.prices,
          corsProxy: s.settings.corsProxy,
          mode: modeOverride || s.settings.priceMode,
          trades: s.trades,
        });
        dispatch({ type: 'SET_PRICES', payload: result });
        // Subtelny komunikat po każdym odświeżeniu: na żywo / częściowo / dane awaryjne (szczegóły w konsoli)
        const route = result.routes?.length ? ` · trasa: ${result.routes.join(', ')}` : '';
        if (result.status === 'live') notify(`Kursy pobrane na żywo z Yahoo Finance (${result.live})${route}`, 'success');
        else if (result.status === 'partial') notify(`Kursy: ${result.live} na żywo, ${result.fallback} z danych awaryjnych (ostatnie znane / transakcje)${route}`, 'warn');
        else if (result.status === 'offline') notify('Yahoo Finance niedostępne (sieć lub proxy zablokowane) – kursy z danych awaryjnych: ostatnie znane i ceny z transakcji', 'warn');
        else if (!silent) notify(result.log[0]?.message || 'Zaktualizowano notowania', 'success');
      } catch {
        dispatch({ type: 'SET_PRICES', payload: { status: 'offline' } });
        if (!silent) notify('Nie udało się odświeżyć notowań – spróbuj ponownie za chwilę', 'warn');
      } finally {
        pricesInflight.current = false;
        setRefreshing(false);
      }
    },
    [notify],
  );

  // Etap 3: historia notowań do wykresów
  const [historyLoading, setHistoryLoading] = useState(false);
  const refreshHistory = useCallback(
    async ({ silent = false } = {}) => {
      const s = stateRef.current;
      if (s.settings.priceMode === 'mock') {
        if (!silent) notify('Tryb „Tylko symulacja” – wykresy korzystają z rekonstrukcji z transakcji', 'warn');
        return;
      }
      setHistoryLoading(true);
      dispatch({ type: 'SET_PRICE_HISTORY', payload: { status: 'loading' } });
      try {
        const result = await fetchAllHistory(s);
        dispatch({ type: 'SET_PRICE_HISTORY', payload: result });
        if (!silent && result.status !== 'offline') notify(result.log[0]?.message || 'Pobrano historię', 'success');
      } catch {
        // Wykresy korzystają wtedy z rekonstrukcji z transakcji i migawek – bez komunikatu o błędzie
        dispatch({ type: 'SET_PRICE_HISTORY', payload: { status: 'offline', updatedAt: new Date().toISOString() } });
      } finally {
        setHistoryLoading(false);
      }
    },
    [notify],
  );

  // Notowania odświeżane wyłącznie przy wejściu do aplikacji (start, powrót do karty/okna) i tylko w godzinach
  // sesji GPW (pn–pt 9:00–16:50). Bez timerów w tle – aplikacja zminimalizowana lub otwarta bez nawigacji nic nie pobiera.
  useEffect(() => {
    const MIN_GAP_MS = 5 * 60 * 1000;
    const onEnter = () => {
      const s = stateRef.current;
      if (document.visibilityState === 'hidden') return;
      if (s.settings.priceMode === 'mock' || s.settings.refreshOnEnter === false || !s.instruments.length) return;
      if (!isWarsawMarketOpen()) return;
      const last = s.prices.lastRefresh ? new Date(s.prices.lastRefresh).getTime() : 0;
      if (Date.now() - last < MIN_GAP_MS || pricesInflight.current) return;
      refreshPrices(undefined, { silent: true });
    };
    const onVisibility = () => document.visibilityState === 'visible' && onEnter();
    const start = setTimeout(onEnter, 1500);
    // Aplikacja otwarta przed 9:00 – jedno odświeżenie tuż po otwarciu sesji (tylko gdy karta jest widoczna)
    const { weekday, minutes } = warsawClock();
    const openAt = MARKET_OPEN_MIN + 1;
    const atOpen = weekday !== 'Sat' && weekday !== 'Sun' && minutes < openAt ? setTimeout(onEnter, (openAt - minutes) * 60000) : null;
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onEnter);
    return () => {
      clearTimeout(start);
      clearTimeout(atOpen);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onEnter);
    };
  }, [refreshPrices]);

  const actions = useMemo(
    () => ({
      updateSettings: (payload) => dispatch({ type: 'UPDATE_SETTINGS', payload }),
      upsert: (collection, item) => {
        const withId = item.id ? item : { ...item, id: uid(collection.slice(0, 3)) };
        dispatch({ type: 'UPSERT', payload: { collection, item: withId } });
        return withId;
      },
      remove: (collection, id) => dispatch({ type: 'DELETE', payload: { collection, id } }),
      removeMany: (collection, ids) => dispatch({ type: 'REMOVE_MANY', payload: { collection, ids } }),
      mergeQuotes: (quotes) => dispatch({ type: 'MERGE_QUOTES', payload: quotes }),
      clearSnapshots: () => dispatch({ type: 'CLEAR_SNAPSHOTS' }),
      deleteAccount: (id) => dispatch({ type: 'DELETE_ACCOUNT', payload: id }),
      loadDemo: () => dispatch({ type: 'LOAD_DEMO' }),
      resetEmpty: () => dispatch({ type: 'RESET_EMPTY' }),
      clearHistory: (opts = {}) => dispatch({ type: 'CLEAR_HISTORY', payload: { ...opts, today: isoDay(new Date()) } }),
      exportState: () => {
        const s = stateRef.current;
        const now = new Date();
        const stamp = `${isoDay(now)}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
        const counts = Object.fromEntries(COLLECTIONS.map((c) => [c, (s[c] || []).length]));
        // Ustawienia widoków i kalculatorów (localStorage) – przywracane razem z danymi na innym urządzeniu
        const uiPrefs = {};
        try {
          for (let i = 0; i < localStorage.length; i += 1) {
            const k = localStorage.key(i);
            if (k && k.startsWith('wealth-app-') && k !== STORAGE_KEY && k !== 'wealth-app-logos') uiPrefs[k] = localStorage.getItem(k);
          }
        } catch {
          // brak localStorage – kopia bez ustawień widoków
        }
        const payload = {
          ...s,
          uiPrefs,
          meta: { ...s.meta, exportedAt: now.toISOString(), app: 'portfolioapp', schemaVersion: STATE_VERSION, counts },
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `majatek-backup-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        dispatch({ type: 'SET_META', payload: { lastBackupAt: now.toISOString() } });
        notify(`Zapisano kopię: majatek-backup-${stamp}.json`, 'success');
      },
      // Etap 6: import z już sprawdzonego obiektu (podgląd i walidacja w Ustawieniach)
      importRaw: (raw) => {
        const { uiPrefs, ...data } = raw || {};
        dispatch({ type: 'IMPORT_STATE', payload: data });
        restoreUiPrefs(uiPrefs);
        notify('Przywrócono dane z kopii zapasowej', 'success');
      },
      importState: async (file) => {
        try {
          const text = await file.text();
          const raw = JSON.parse(text);
          const { errors } = validateBackup(raw);
          if (errors.length) {
            notify(`Import odrzucony: ${errors.join(' ')}`, 'error');
            return false;
          }
          const { uiPrefs, ...data } = raw;
          dispatch({ type: 'IMPORT_STATE', payload: data });
          restoreUiPrefs(uiPrefs);
          notify('Przywrócono dane z kopii zapasowej', 'success');
          return true;
        } catch (e) {
          notify(`Nie udało się odczytać pliku: ${e.message}`, 'error');
          return false;
        }
      },
      addMany: (collection, items) => dispatch({ type: 'ADD_MANY', payload: { collection, items } }),
      goalsRollover: (payload) => dispatch({ type: 'GOALS_ROLLOVER', payload }),
      refreshPrices,
      refreshHistory,
      notify,
    }),
    [refreshPrices, refreshHistory, notify],
  );

  // Dane dywidend (Yahoo / historia wypłat) pobierane po starcie aplikacji – raz na 12 h, w godzinach sesji, bez otwierania zakładki
  useEffect(() => {
    const t = setTimeout(() => {
      const s = stateRef.current;
      const prefs = s.settings.dividendPrefs || {};
      const age = prefs.lastSync ? (Date.now() - new Date(prefs.lastSync).getTime()) / 3600000 : Infinity;
      if (s.accounts.length && s.instruments.length && prefs.autoSync !== false && age > 12 && mayAutoFetch(prefs.lastSync)) runDividendSync(s, actions, { silent: true }).catch(() => {});
    }, 4000);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Konto w chmurze: zapis każdej zmiany w bazie zalogowanego użytkownika (w trybie lokalnym – nieaktywne)
  const cloudSync = useCloudSync(state, cloud, { dispatch, notify, restoreUiPrefs });

  const value = useMemo(
    () => ({ state, actions, isDark, refreshing, historyLoading, toast, dismissToast: () => setToast(null), cloud: cloudSync }),
    [state, actions, isDark, refreshing, historyLoading, toast, cloudSync],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp musi być użyte wewnątrz <AppProvider>');
  return ctx;
}
