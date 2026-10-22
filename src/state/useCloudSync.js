import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STORAGE_KEY } from './schema.js';
import {
  CONFLICT_KEY,
  OWNER_KEY,
  PENDING_KEY,
  SYNCED_AT_KEY,
  cloudError,
  collectUiPrefs,
  fetchCloud,
  fetchCloudUpdatedAt,
  pushCloud,
  setLocalMode,
  signOut as cloudSignOut,
  storage,
} from '../lib/cloud.js';

const DEBOUNCE_MS = 1200;
// Ta sama wersja w chmurze (porównanie chwili zapisu, nie kolejności – odporne na różnice zegarów urządzeń)
const sameVersion = (a, b) => !!a && !!b && new Date(a).getTime() === new Date(b).getTime();
const RETRY_MS = 30000;

// Synchronizacja stanu z chmurą dla zalogowanego użytkownika (cloud = { user, needsPush, notice }; null – tryb lokalny).
// Każda zmiana stanu → zapis do bazy po krótkiej przerwie; localStorage zostaje pamięcią podręczną (start i praca offline).
// Po powrocie do karty / odzyskaniu sieci – sprawdzenie, czy w chmurze nie ma nowszej wersji (inne urządzenie).
export function useCloudSync(state, cloud, { dispatch, notify, restoreUiPrefs }) {
  const userId = cloud?.user?.id || null;
  const [status, setStatus] = useState(userId ? (cloud.needsPush ? 'pending' : 'synced') : 'local');
  const [error, setError] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(() => (userId ? storage(SYNCED_AT_KEY) : null));
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastJson = useRef(userId && !cloud.needsPush ? JSON.stringify(state) : null);
  // Ustawienia widoków (np. Budżet) wysłane ostatnio – ich zmiana też wymaga zapisu w chmurze
  const uiJson = () => JSON.stringify(collectUiPrefs());
  const lastUi = useRef(userId && !cloud.needsPush && storage(PENDING_KEY) !== userId ? uiJson() : null);
  const clean = () => JSON.stringify(stateRef.current) === lastJson.current && uiJson() === lastUi.current;
  const adoptNext = useRef(false); // stan wczytany z chmury – nie odsyłaj go z powrotem
  const timer = useRef(null);
  const inflight = useRef(null);

  // Wczytanie wersji z chmury do aplikacji (bez odsyłania jej z powrotem)
  const adoptRemote = useCallback(
    (remote) => {
      adoptNext.current = true;
      dispatch({ type: 'IMPORT_STATE', payload: remote.data });
      restoreUiPrefs(remote.uiPrefs);
      lastUi.current = uiJson();
      storage(SYNCED_AT_KEY, remote.updatedAt);
      storage(PENDING_KEY, null);
      setLastSyncedAt(remote.updatedAt);
      setError(null);
      setStatus('synced');
    },
    [dispatch, restoreUiPrefs],
  );

  const push = useCallback(async () => {
    if (!userId) return true;
    clearTimeout(timer.current);
    timer.current = null;
    if (inflight.current) await inflight.current.catch(() => {});
    const json = JSON.stringify(stateRef.current);
    const ui = uiJson();
    if (json === lastJson.current && ui === lastUi.current) {
      setStatus('synced');
      return true;
    }
    setStatus('saving');
    const run = (async () => {
      // Inne urządzenie zapisało w międzyczasie nowszą wersję – wczytaj ją zamiast nadpisywać
      const remoteAt = await fetchCloudUpdatedAt(userId);
      if (remoteAt && !sameVersion(remoteAt, storage(SYNCED_AT_KEY))) {
        const remote = await fetchCloud(userId);
        if (remote?.data) {
          storage(CONFLICT_KEY, json);
          adoptRemote(remote);
          notify('Na innym urządzeniu zapisano nowszą wersję portfela – wczytano ją z chmury (ostatnie zmiany z tego urządzenia zachowane w kopii awaryjnej).', 'info');
          return;
        }
      }
      const at = await pushCloud(userId, stateRef.current, JSON.parse(ui));
      lastJson.current = json;
      lastUi.current = ui;
      storage(SYNCED_AT_KEY, at);
      if (clean()) storage(PENDING_KEY, null);
      setLastSyncedAt(at);
      setError(null);
      setStatus(clean() ? 'synced' : 'pending');
    })();
    inflight.current = run;
    try {
      await run;
      return true;
    } catch (e) {
      setError(cloudError(e));
      setStatus('error');
      return false;
    } finally {
      inflight.current = null;
    }
  }, [userId, adoptRemote, notify]);

  // Komunikat po wczytaniu (przeniesienie danych lokalnych / konflikt)
  useEffect(() => {
    if (cloud?.notice) notify(cloud.notice, 'info');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Zmiana stanu → zapis w chmurze (z opóźnieniem)
  useEffect(() => {
    if (!userId) return;
    if (adoptNext.current) {
      adoptNext.current = false;
      lastJson.current = JSON.stringify(state);
      return;
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (clean()) {
        setStatus((s) => (s === 'pending' ? 'synced' : s));
        return;
      }
      storage(PENDING_KEY, userId);
      push();
    }, DEBOUNCE_MS);
    setStatus((s) => (s === 'error' ? s : 'pending'));
  }, [state, userId, push]);

  // Zmiana ustawień widoków poza stanem portfela (np. Budżet) → ten sam zapis w chmurze
  useEffect(() => {
    if (!userId) return undefined;
    const onPrefs = () => {
      storage(PENDING_KEY, userId);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        push();
      }, DEBOUNCE_MS);
      setStatus((s) => (s === 'error' ? s : 'pending'));
    };
    window.addEventListener('wealth-app-prefs-changed', onPrefs);
    return () => window.removeEventListener('wealth-app-prefs-changed', onPrefs);
  }, [userId, push]);

  // Ponawianie po błędzie (np. brak sieci)
  useEffect(() => {
    if (!userId || status !== 'error') return undefined;
    const t = setInterval(() => navigator.onLine !== false && push(), RETRY_MS);
    const onOnline = () => push();
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(t);
      window.removeEventListener('online', onOnline);
    };
  }, [status, userId, push]);

  // Nowsza wersja z innego urządzenia – wczytanie, gdy tu nie ma niewysłanych zmian
  const pull = useCallback(
    async ({ silent = true } = {}) => {
      if (!userId) return;
      try {
        if (timer.current || inflight.current || !clean()) return;
        const remoteAt = await fetchCloudUpdatedAt(userId);
        if (!remoteAt || sameVersion(remoteAt, storage(SYNCED_AT_KEY))) return;
        const remote = await fetchCloud(userId);
        if (!remote?.data || timer.current || inflight.current || !clean()) return;
        adoptRemote(remote);
        notify('Wczytano nowszą wersję portfela z chmury (zmiany z innego urządzenia).', 'info');
      } catch (e) {
        if (!silent) notify(`Synchronizacja: ${cloudError(e)}`, 'error');
      }
    },
    [userId, adoptRemote, notify],
  );

  useEffect(() => {
    if (!userId) return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') pull();
      // Karta chowana (zamknięcie aplikacji na telefonie) – wyślij od razu zaległe zmiany
      else if (timer.current) push();
    };
    const onOnline = () => pull();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [userId, pull, push]);

  const syncNow = useCallback(async () => {
    const ok = await push();
    if (ok) await pull({ silent: false });
    notify(ok ? 'Portfel zsynchronizowany z chmurą' : 'Nie udało się zsynchronizować – spróbuję ponownie automatycznie', ok ? 'success' : 'error');
  }, [push, pull, notify]);

  // Wylogowanie: dośle zaległe zmiany, usuwa dane z tej przeglądarki (zostają w chmurze) i wraca do ekranu logowania
  const signOut = useCallback(async () => {
    const ok = await push();
    if (!ok && !window.confirm('Nie udało się wysłać ostatnich zmian do chmury. Wylogować mimo to? Niewysłane zmiany zostaną utracone.')) return;
    try {
      await cloudSignOut();
    } catch {
      // sesja i tak zostanie wyczyszczona lokalnie
    }
    for (const k of [STORAGE_KEY, OWNER_KEY, PENDING_KEY, SYNCED_AT_KEY]) storage(k, null);
    window.location.reload();
  }, [push]);

  const user = cloud?.user || null;
  return useMemo(() => ({ enabled: !!userId, user, status, error, lastSyncedAt, syncNow, signOut }), [userId, user, status, error, lastSyncedAt, syncNow, signOut]);
}

// Tryb lokalny → ekran logowania (po przeładowaniu)
export function goToSignIn() {
  setLocalMode(false);
  window.location.reload();
}
