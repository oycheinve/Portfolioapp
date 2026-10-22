import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Cloud, CloudOff, Loader2, LogIn, LogOut, RefreshCw } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { goToSignIn } from '../../state/useCloudSync.js';
import { clearCloudConfig, cloudConfig, saveCloudConfig } from '../../lib/cloud.js';
import { formatDateTime } from '../../lib/format.js';
import { Badge, Button, Card, Field, Input } from '../ui.jsx';

const STATUS = {
  synced: { tone: 'green', icon: CheckCircle2, label: 'Zsynchronizowano' },
  pending: { tone: 'neutral', icon: Loader2, label: 'Zmiany czekają na zapis…', spin: true },
  saving: { tone: 'neutral', icon: Loader2, label: 'Zapisywanie w chmurze…', spin: true },
  error: { tone: 'red', icon: AlertTriangle, label: 'Błąd synchronizacji' },
};

// Konto użytkownika i synchronizacja z chmurą (Supabase). W trybie lokalnym – konfiguracja serwera i przejście do logowania.
export default function CloudCard() {
  const { cloud } = useApp();
  const cfg = cloudConfig();

  if (cloud?.enabled) {
    const st = STATUS[cloud.status] || STATUS.synced;
    return (
      <Card title="Konto i synchronizacja w chmurze" subtitle="Portfel zapisuje się na Twoim koncie po każdej zmianie" icon={Cloud}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-1 text-sm">
            <p>
              Zalogowano jako <strong className="break-all">{cloud.user.email}</strong>
            </p>
            <p className="flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
              <Badge tone={st.tone}>
                <st.icon size={12} className={`mr-1 inline ${st.spin ? 'animate-spin' : ''}`} />
                {st.label}
              </Badge>
              {cloud.lastSyncedAt && <span>Ostatni zapis: {formatDateTime(cloud.lastSyncedAt)}</span>}
            </p>
            {cloud.error && <p className="text-xs text-red-600 dark:text-red-400">{cloud.error} Ponowię automatycznie.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button icon={RefreshCw} onClick={cloud.syncNow}>
              Synchronizuj teraz
            </Button>
            <Button icon={LogOut} onClick={cloud.signOut}>
              Wyloguj
            </Button>
          </div>
        </div>
        <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
          Transakcje, konta, obligacje, dywidendy, cele i ustawienia są przechowywane w bazie przypisanej do Twojego konta; ta przeglądarka trzyma tylko kopię roboczą (praca bez internetu). Po wylogowaniu dane znikają z tego urządzenia i wracają po ponownym zalogowaniu.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Konto i synchronizacja w chmurze" subtitle="Obecnie dane są zapisane tylko w tej przeglądarce" icon={CloudOff}>
      {cfg ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-stone-600 dark:text-stone-300">Zaloguj się lub załóż konto, aby zapisywać portfel w chmurze i mieć go na wszystkich urządzeniach. Dane z tej przeglądarki zostaną przeniesione na nowe konto.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={LogIn} onClick={goToSignIn}>
              Zaloguj się / załóż konto
            </Button>
            {cfg.source === 'local' && (
              <Button
                variant="ghost"
                onClick={() => {
                  clearCloudConfig();
                  window.location.reload();
                }}
              >
                Usuń konfigurację serwera
              </Button>
            )}
          </div>
        </div>
      ) : (
        <ServerConfig />
      )}
    </Card>
  );
}

function ServerConfig() {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState(null);
  const save = () => {
    try {
      saveCloudConfig({ url, anonKey: key });
      goToSignIn();
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <div className="space-y-3 text-sm">
      <p className="text-stone-600 dark:text-stone-300">
        Konta działają na bazie Supabase. Utwórz bezpłatny projekt, uruchom w nim skrypt <code>supabase/schema.sql</code> z repozytorium i wpisz poniżej adres projektu oraz klucz „anon public” (Project Settings → API). Można też ustawić je na stałe w zmiennych <code>VITE_SUPABASE_URL</code> i <code>VITE_SUPABASE_ANON_KEY</code>.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Adres projektu (Project URL)">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
        </Field>
        <Field label="Klucz anon public">
          <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="eyJhbGciOi…" />
        </Field>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <Button variant="primary" icon={Cloud} onClick={save} disabled={!url || !key}>
        Zapisz i przejdź do logowania
      </Button>
    </div>
  );
}
