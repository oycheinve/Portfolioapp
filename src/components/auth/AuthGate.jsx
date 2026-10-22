import { useEffect, useState } from 'react';
import { Cloud, KeyRound, Loader2, LogIn, Mail, UserPlus, Wallet } from 'lucide-react';
import { STORAGE_KEY, createEmptyState } from '../../state/schema.js';
import {
  OWNER_KEY,
  SYNCED_AT_KEY,
  chooseInitialData,
  cloudConfig,
  cloudError,
  fetchCloud,
  getSession,
  isLocalMode,
  onAuthChange,
  resetPassword,
  setLocalMode,
  signIn,
  signUp,
  storage,
} from '../../lib/cloud.js';
import { Button, Field, Input } from '../ui.jsx';

// Przygotowanie danych zalogowanego użytkownika przed startem aplikacji: wersja z chmury (albo lokalna do wysłania)
// trafia do localStorage, skąd AppProvider wczytuje stan jak dotąd.
async function prepareUser(user) {
  const remote = await fetchCloud(user.id);
  const pick = chooseInitialData(user.id, remote);
  const data = pick.data || createEmptyState();
  storage(STORAGE_KEY, JSON.stringify(data));
  storage(OWNER_KEY, user.id);
  if (pick.syncedAt) storage(SYNCED_AT_KEY, pick.syncedAt);
  if (pick.uiPrefs) {
    for (const [k, v] of Object.entries(pick.uiPrefs)) if (k.startsWith('wealth-app-') && k !== STORAGE_KEY && typeof v === 'string') storage(k, v);
  }
  return { user: { id: user.id, email: user.email }, needsPush: pick.needsPush, notice: pick.notice || null };
}

// Bramka logowania: bez konfiguracji chmury albo w trybie „bez konta” aplikacja startuje od razu (dane lokalne);
// z konfiguracją – ekran logowania, potem pobranie danych z chmury. children(cloud) – cloud = null w trybie lokalnym.
export default function AuthGate({ children }) {
  const configured = !!cloudConfig();
  const [phase, setPhase] = useState(() => (!configured || isLocalMode() ? 'local' : 'checking'));
  const [cloud, setCloud] = useState(null);
  const [error, setError] = useState(null);

  const enter = async (user) => {
    setPhase('loading');
    setError(null);
    try {
      setCloud(await prepareUser(user));
      setPhase('ready');
    } catch (e) {
      setError(cloudError(e));
      setPhase('auth');
    }
  };

  useEffect(() => {
    if (phase !== 'checking') return undefined;
    let alive = true;
    getSession()
      .then((s) => alive && (s?.user ? enter(s.user) : setPhase('auth')))
      .catch((e) => {
        if (!alive) return;
        setError(cloudError(e));
        setPhase('auth');
      });
    return () => {
      alive = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Wylogowanie (także w innej karcie / wygaśnięcie sesji) – powrót do ekranu logowania
  useEffect(() => {
    if (phase !== 'ready') return undefined;
    let off = () => {};
    onAuthChange((event) => {
      if (event === 'SIGNED_OUT') window.location.reload();
    }).then((f) => (off = f));
    return () => off();
  }, [phase]);

  if (phase === 'local') return children(null);
  if (phase === 'ready') return children(cloud);
  if (phase === 'checking' || phase === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 text-stone-500 dark:bg-neutral-950 dark:text-stone-400">
        <Loader2 size={20} className="mr-2 animate-spin" />
        {phase === 'loading' ? 'Pobieranie portfela z chmury…' : 'Sprawdzanie sesji…'}
      </div>
    );
  }
  return (
    <AuthScreen
      initialError={error}
      onSignedIn={enter}
      onLocal={() => {
        setLocalMode(true);
        setPhase('local');
      }}
    />
  );
}

function AuthScreen({ initialError, onSignedIn, onLocal }) {
  const [mode, setMode] = useState('login'); // login | register | reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [info, setInfo] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Podaj poprawny adres e-mail.');
    if (mode !== 'reset' && password.length < 6) return setError('Hasło musi mieć co najmniej 6 znaków.');
    if (mode === 'register' && password !== password2) return setError('Hasła nie są takie same.');
    setBusy(true);
    try {
      if (mode === 'login') {
        const session = await signIn(email, password);
        await onSignedIn(session.user);
      } else if (mode === 'register') {
        const r = await signUp(email, password);
        if (r.session) await onSignedIn(r.session.user);
        else {
          setInfo('Konto utworzone. Potwierdź adres e-mail (link w wiadomości), a potem zaloguj się.');
          setMode('login');
        }
      } else {
        await resetPassword(email);
        setInfo('Jeśli konto istnieje, wysłaliśmy link do ustawienia nowego hasła.');
        setMode('login');
      }
    } catch (err) {
      setError(cloudError(err));
    } finally {
      setBusy(false);
    }
  };

  const tabs = [
    { id: 'login', label: 'Logowanie', icon: LogIn },
    { id: 'register', label: 'Rejestracja', icon: UserPlus },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-10 text-stone-900 dark:bg-neutral-950 dark:text-stone-100">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white dark:bg-blue-500">
            <Wallet size={20} />
          </span>
          <div>
            <p className="text-lg font-semibold leading-tight">Mój Majątek</p>
            <p className="text-xs text-stone-500 dark:text-stone-400">Portfel i cele · konto w chmurze</p>
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900">
          {mode !== 'reset' ? (
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1 text-sm dark:bg-white/5" role="tablist" aria-label="Logowanie lub rejestracja">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === t.id}
                  onClick={() => {
                    setMode(t.id);
                    setError(null);
                    setInfo(null);
                  }}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-md py-1.5 font-medium ${mode === t.id ? 'bg-white shadow-sm dark:bg-neutral-800' : 'text-stone-500 dark:text-stone-400'}`}
                >
                  <t.icon size={14} />
                  {t.label}
                </button>
              ))}
            </div>
          ) : (
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <KeyRound size={16} /> Reset hasła
            </h2>
          )}

          <form onSubmit={submit} className="space-y-3" noValidate>
            <Field label="E-mail">
              <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ty@example.com" required />
            </Field>
            {mode !== 'reset' && (
              <Field label="Hasło" hint={mode === 'register' ? 'Minimum 6 znaków' : null}>
                <Input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required />
              </Field>
            )}
            {mode === 'register' && (
              <Field label="Powtórz hasło">
                <Input type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
              </Field>
            )}
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300" role="alert">{error}</p>}
            {info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{info}</p>}
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 dark:bg-blue-500 dark:text-neutral-950 dark:hover:bg-blue-400"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : mode === 'reset' ? <Mail size={16} /> : mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}
              {mode === 'login' ? 'Zaloguj się' : mode === 'register' ? 'Załóż konto' : 'Wyślij link'}
            </button>
          </form>

          <div className="mt-3 text-center text-xs">
            {mode === 'login' && (
              <button type="button" className="text-blue-600 hover:underline dark:text-blue-400" onClick={() => setMode('reset')}>
                Nie pamiętam hasła
              </button>
            )}
            {mode === 'reset' && (
              <button type="button" className="text-blue-600 hover:underline dark:text-blue-400" onClick={() => setMode('login')}>
                Wróć do logowania
              </button>
            )}
          </div>
        </div>

        <p className="mt-4 flex items-start gap-2 text-xs text-stone-500 dark:text-stone-400">
          <Cloud size={14} className="mt-0.5 shrink-0" />
          Po zalogowaniu portfel zapisuje się na Twoim koncie i synchronizuje między urządzeniami. Dane z tej przeglądarki zostaną przeniesione na nowe konto.
        </p>
        <div className="mt-3 text-center">
          <Button variant="ghost" size="sm" onClick={onLocal}>
            Kontynuuj bez konta (dane tylko na tym urządzeniu)
          </Button>
        </div>
      </div>
    </div>
  );
}
