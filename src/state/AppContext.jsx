import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { reducer } from './reducer.js';
import { COLLECTIONS, STATE_VERSION, STORAGE_KEY, migrateState, validateImported } from './schema.js';
import { createDemoState } from './demoData.js';
import { buildSnapshot, isoDay, livePriceLookup } from '../lib/engine.js';
import { refreshAllPrices } from '../lib/prices.js';
import { fetchAllHistory } from '../lib/history.js';
import { pendingSavingsInterest } from '../lib/savings.js';
import { computeLimitsForYear } from '../lib/tax.js';
import { uid } from '../lib/format.js';

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

export function AppProvider({ children }) {
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

  const refreshPrices = useCallback(
    async (modeOverride) => {
      const s = stateRef.current;
      setRefreshing(true);
      dispatch({ type: 'SET_PRICES', payload: { status: 'loading' } });
      try {
        const result = await refreshAllPrices({
          instruments: s.instruments,
          previous: s.prices,
          corsProxy: s.settings.corsProxy,
          mode: modeOverride || s.settings.priceMode,
        });
        dispatch({ type: 'SET_PRICES', payload: result });
        notify(result.log[0]?.message || 'Zaktualizowano notowania', result.status === 'live' ? 'success' : 'warn');
      } catch (e) {
        dispatch({ type: 'SET_PRICES', payload: { status: 'error' } });
        notify(`Błąd aktualizacji: ${e.message}`, 'error');
      } finally {
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
        if (!silent) notify(result.log[0]?.message || 'Pobrano historię', result.status === 'live' ? 'success' : 'warn');
      } catch (e) {
        dispatch({ type: 'SET_PRICE_HISTORY', payload: { status: 'offline', updatedAt: new Date().toISOString() } });
        if (!silent) notify(`Błąd pobierania historii: ${e.message}`, 'error');
      } finally {
        setHistoryLoading(false);
      }
    },
    [notify],
  );

  // Automatyczne odświeżanie co N minut (opcjonalne)
  useEffect(() => {
    const minutes = Number(state.settings.autoRefreshMinutes) || 0;
    if (minutes <= 0) return undefined;
    const t = setInterval(() => refreshPrices(), minutes * 60000);
    return () => clearInterval(t);
  }, [state.settings.autoRefreshMinutes, refreshPrices]);

  const actions = useMemo(
    () => ({
      updateSettings: (payload) => dispatch({ type: 'UPDATE_SETTINGS', payload }),
      upsert: (collection, item) => {
        const withId = item.id ? item : { ...item, id: uid(collection.slice(0, 3)) };
        dispatch({ type: 'UPSERT', payload: { collection, item: withId } });
        return withId;
      },
      remove: (collection, id) => dispatch({ type: 'DELETE', payload: { collection, id } }),
      deleteAccount: (id) => dispatch({ type: 'DELETE_ACCOUNT', payload: id }),
      loadDemo: () => dispatch({ type: 'LOAD_DEMO' }),
      resetEmpty: () => dispatch({ type: 'RESET_EMPTY' }),
      clearHistory: (opts = {}) => dispatch({ type: 'CLEAR_HISTORY', payload: { ...opts, today: isoDay(new Date()) } }),
      exportState: () => {
        const s = stateRef.current;
        const now = new Date();
        const stamp = `${isoDay(now)}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
        const counts = Object.fromEntries(COLLECTIONS.map((c) => [c, (s[c] || []).length]));
        const payload = {
          ...s,
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
        dispatch({ type: 'IMPORT_STATE', payload: raw });
        notify('Zaimportowano dane z pliku', 'success');
      },
      importState: async (file) => {
        try {
          const text = await file.text();
          const raw = JSON.parse(text);
          const errors = validateImported(raw);
          if (errors.length) {
            notify(`Import odrzucony: ${errors.join(' ')}`, 'error');
            return false;
          }
          dispatch({ type: 'IMPORT_STATE', payload: raw });
          notify('Zaimportowano dane z pliku', 'success');
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

  const value = useMemo(
    () => ({ state, actions, isDark, refreshing, historyLoading, toast, dismissToast: () => setToast(null) }),
    [state, actions, isDark, refreshing, historyLoading, toast],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp musi być użyte wewnątrz <AppProvider>');
  return ctx;
}
