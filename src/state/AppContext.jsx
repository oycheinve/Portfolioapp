import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { reducer } from './reducer.js';
import { COLLECTIONS, STATE_VERSION, STORAGE_KEY, migrateState } from './schema.js';
import { validateBackup } from '../lib/backup.js';
import { createDemoState } from './demoData.js';
import { autoFundingCashflows, buildSnapshot, isAutoFunding, isBondRedemption, isoDay, livePriceLookup } from '../lib/engine.js';
import { refreshAllPrices } from '../lib/prices.js';
import { fetchAllHistory } from '../lib/history.js';
import { rowsToMap } from '../lib/inflation.js';
import { pendingSavingsInterest } from '../lib/savings.js';
import { computeLimitsForYear } from '../lib/tax.js';
import { uid } from '../lib/format.js';
import { reconcileDividends } from '../lib/dividends.js';
import { setActiveTheme } from '../lib/colors.js';
import { fixedDividendPlan } from '../lib/dividendFacts.js';
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

const RETRY_MS = 3 * 60 * 1000;
const RETRY_MAX = 15;
const RETRY_UNTIL_MIN = 10 * 60; // ponawianie tylko do 10:00 czasu polskiego
const warsawDayOf = (t) => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });

// Notowania GPW pobrane na żywo, ale z sesji wcześniejszej niż dzisiejsza (opóźnienie danych tuż po otwarciu sesji)
export function delayedSessionQuotes(instruments, quotes = {}, now = Date.now()) {
  const today = warsawDayOf(now);
  return instruments.filter((inst) => {
    const q = quotes[inst.id];
    const gpw = /\.WA$/i.test(inst.yahooSymbol || '') || (!inst.yahooSymbol && (inst.currency || 'PLN') === 'PLN');
    return gpw && q && !q.stale && Number.isFinite(q.marketTime) && /yahoo|stooq/i.test(q.source || '') && warsawDayOf(q.marketTime) < today;
  });
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

  // Motyw jasny / ciemny / różowy (różowy – jasny wariant z własną paletą: klasa theme-pink na <html>)
  const isDark = state.settings.theme === 'dark' || (state.settings.theme === 'system' && systemDark);
  const isPink = state.settings.theme === 'pink';
  setActiveTheme(isPink ? 'pink' : isDark ? 'dark' : 'light'); // przed renderem widoków – kolory wykresów
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.classList.toggle('theme-pink', isPink);
  }, [isDark, isPink]);

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

  // Stałe wpisy dywidend (dividendFacts.js – np. Grupa Kęty 4.11.2026: 9,42 zł brutto) – bezwarunkowo w rejestrze
  useEffect(() => {
    const p = fixedDividendPlan(state, isoDay(new Date()));
    if (p.instruments.length) dispatch({ type: 'ADD_MANY', payload: { collection: 'instruments', items: p.instruments } });
    if (p.removeIncome.length) dispatch({ type: 'REMOVE_MANY', payload: { collection: 'income', ids: p.removeIncome } });
    for (const item of p.income) dispatch({ type: 'UPSERT', payload: { collection: 'income', item } });
    if (p.schedule.length) dispatch({ type: 'ADD_MANY', payload: { collection: 'dividendSchedule', items: p.schedule } });
  }, [state.income, state.instruments, state.accounts, state.trades, state.dividendSchedule]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Bezpiecznik: pobieranie trwające ponad 2 min (zawieszone połączenie) nie blokuje kolejnego odświeżenia
  const pricesInflight = useRef(0);
  // Poranek sesji (zwłaszcza poniedziałek po weekendzie): Yahoo podaje GPW z ok. 15-min opóźnieniem, więc tuż po 9:00
  // przychodzą jeszcze notowania z poprzedniej sesji. Wtedy ponowienie co 3 min (do 10:00), aż przyjdą dzisiejsze.
  const retryTimer = useRef(null);
  const retries = useRef({ day: '', count: 0 });
  const refreshPrices = useCallback(
    async (modeOverride, { silent = false, force = !silent } = {}) => {
      clearTimeout(retryTimer.current);
      if (pricesInflight.current && Date.now() - pricesInflight.current < 120000) return;
      const runId = Date.now();
      pricesInflight.current = runId;
      const s = stateRef.current;
      setRefreshing(true);
      try {
        const result = await refreshAllPrices({
          instruments: s.instruments,
          previous: s.prices,
          corsProxy: s.settings.corsProxy,
          mode: modeOverride || s.settings.priceMode,
          trades: s.trades,
          force,
        });
        // Wynik starszego (zawieszonego) pobierania nie nadpisuje nowszego
        if (pricesInflight.current !== runId) return;
        const { failures = [], ...payload } = result;
        dispatch({ type: 'SET_PRICES', payload });
        // Pierwsza przyczyna braku notowania na żywo – widoczna także na telefonie (bez konsoli)
        const why = failures[0] ? ` · ${failures[0].ticker}: ${String(failures[0].error).split('; ')[0].slice(0, 90)}` : '';
        // Subtelny komunikat po każdym odświeżeniu: na żywo / częściowo / dane awaryjne (szczegóły w konsoli)
        const route = result.routes?.length ? ` · trasa: ${result.routes.join(', ')}` : '';
        if (result.status === 'live') notify(`Kursy pobrane na żywo (${result.live})${route}`, 'success');
        else if (result.status === 'partial') notify(`Kursy: ${result.live} na żywo, ${result.fallback} z danych awaryjnych (ostatnie znane / transakcje)${route}${why}`, 'warn');
        else if (result.status === 'offline') notify(`Notowania niedostępne – kursy z danych awaryjnych (ostatnie znane i ceny z transakcji)${why}`, 'warn');
        else if (!silent) notify(result.log[0]?.message || 'Zaktualizowano notowania', 'success');

        const delayed = delayedSessionQuotes(s.instruments, result.quotes);
        const today = isoDay(new Date());
        if (retries.current.day !== today) retries.current = { day: today, count: 0 };
        const { minutes } = warsawClock();
        if (delayed.length && isWarsawMarketOpen() && minutes < RETRY_UNTIL_MIN && retries.current.count < RETRY_MAX) {
          retries.current.count += 1;
          if (!silent) notify(`${delayed.length} ${delayed.length === 1 ? 'notowanie jest' : 'notowań jest'} jeszcze z poprzedniej sesji (opóźnienie Yahoo ok. 15 min) – ponowię za 3 min`, 'info');
          retryTimer.current = setTimeout(() => {
            if (document.visibilityState !== 'hidden') refreshPrices(undefined, { silent: true });
          }, RETRY_MS);
        }
      } catch {
        dispatch({ type: 'SET_PRICES', payload: { status: 'offline' } });
        if (!silent) notify('Nie udało się odświeżyć notowań – spróbuj ponownie za chwilę', 'warn');
      } finally {
        if (pricesInflight.current === runId) {
          pricesInflight.current = 0;
          setRefreshing(false);
        }
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

  // Inflacja CPI (GUS) z tabeli Supabase inflation_rates przez /api/inflation – przy starcie, najwyżej co 12 godzin;
  // bez serwera / tabeli aplikacja korzysta z tabeli wbudowanej (i ręcznych korekt), bez komunikatu
  const refreshInflation = useCallback(async ({ force = false } = {}) => {
    const cur = stateRef.current.inflation;
    if (!force && cur?.fetchedAt && Date.now() - new Date(cur.fetchedAt).getTime() < 12 * 3600 * 1000) return cur;
    dispatch({ type: 'SET_INFLATION', payload: { status: 'loading' } });
    try {
      const res = await fetch(`/api/inflation${force ? `?t=${Date.now()}` : ''}`, { cache: force ? 'no-store' : 'default' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(body.rows)) throw new Error(body.error || `HTTP ${res.status}`);
      const payload = { rows: rowsToMap(body.rows), updatedAt: body.updatedAt || null, fetchedAt: new Date().toISOString(), status: 'ok', error: null };
      dispatch({ type: 'SET_INFLATION', payload });
      return payload;
    } catch (e) {
      dispatch({ type: 'SET_INFLATION', payload: { status: 'offline', error: e.message, fetchedAt: new Date().toISOString() } });
      return null;
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => refreshInflation(), 2500);
    return () => clearTimeout(t);
  }, [refreshInflation]);

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
    // …i drugie po upływie opóźnienia Yahoo (ok. 15 min), gdy pierwsze dało jeszcze notowania z poprzedniej sesji
    const afterDelay = weekday !== 'Sat' && weekday !== 'Sun' && minutes < MARKET_OPEN_MIN + 17 ? setTimeout(() => {
      if (document.visibilityState !== 'hidden' && delayedSessionQuotes(stateRef.current.instruments, stateRef.current.prices.quotes).length) refreshPrices(undefined, { silent: true });
    }, (MARKET_OPEN_MIN + 17 - minutes) * 60000) : null;
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onEnter);
    return () => {
      clearTimeout(start);
      clearTimeout(atOpen);
      clearTimeout(afterDelay);
      clearTimeout(retryTimer.current);
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
      refreshInflation,
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
    [refreshPrices, refreshHistory, refreshInflation, notify],
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
