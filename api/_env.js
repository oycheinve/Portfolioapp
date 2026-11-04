// Odczyt zmiennych środowiskowych funkcji serwerowych (Vercel). Plik z „_” nie jest publicznym endpointem.
// Odporny na typowe pomyłki w panelu Vercel: spacje / małe litery w nazwie („ SUPABASE_URL”, „supabase_url”),
// cudzysłowy i spacje wokół wartości, nazwy z integracji Supabase (NEXT_PUBLIC_…) i nowe klucze Supabase (sb_secret_…).

const clean = (v) =>
  String(v ?? '')
    .trim()
    .replace(/^(['"])(.*)\1$/, '$2')
    .trim();

function envIndex() {
  const index = new Map();
  for (const [k, v] of Object.entries(process.env)) {
    const name = String(k).trim().toUpperCase();
    const value = clean(v);
    if (value && !index.has(name)) index.set(name, value);
  }
  return index;
}

// Pierwsza niepusta wartość spośród podanych nazw
export function env(...names) {
  const idx = envIndex();
  for (const n of names) {
    const exact = clean(process.env[n]);
    if (exact) return exact;
    const v = idx.get(String(n).toUpperCase());
    if (v) return v;
  }
  return '';
}

export const SUPABASE_URL_NAMES = ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_PROJECT_URL'];
export const SUPABASE_SERVICE_NAMES = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'SUPABASE_SECRET_KEY', 'SERVICE_ROLE_KEY'];
export const SUPABASE_ANON_NAMES = ['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];

export const supabaseUrl = () => env(...SUPABASE_URL_NAMES).replace(/\/+$/, '');
export const supabaseServiceKey = () => env(...SUPABASE_SERVICE_NAMES);
export const supabaseAnyKey = () => env(...SUPABASE_SERVICE_NAMES, ...SUPABASE_ANON_NAMES);

// Diagnoza bez ujawniania wartości: które nazwy związane z Supabase widzi funkcja (z oznaczeniem pustych)
export function supabaseEnvReport() {
  const names = Object.keys(process.env).filter((k) => /supabase|service_role/i.test(k));
  return {
    url: !!supabaseUrl(),
    serviceKey: !!supabaseServiceKey(),
    urlLooksValid: /^https:\/\/[^/]+\.supabase\.(co|in)$|^https?:\/\/[^/]+/.test(supabaseUrl()),
    seen: names.map((k) => `${JSON.stringify(k)}${clean(process.env[k]) ? '' : ' (pusta)'}`),
    vercelEnv: process.env.VERCEL_ENV || null,
  };
}

export function missingSupabaseMessage(needService = true) {
  const r = supabaseEnvReport();
  const missing = [
    !r.url && 'SUPABASE_URL',
    needService ? !r.serviceKey && 'SUPABASE_SERVICE_ROLE_KEY' : !supabaseAnyKey() && 'SUPABASE_SERVICE_ROLE_KEY albo SUPABASE_ANON_KEY',
  ].filter(Boolean);
  const seen = r.seen.length ? ` Widoczne zmienne Supabase: ${r.seen.join(', ')}.` : ' Funkcja nie widzi żadnej zmiennej Supabase.';
  return `Brak konfiguracji serwera (${missing.join(', ')}).${seen} Po dodaniu lub zmianie zmiennych w Vercel wykonaj Redeploy (zmienne trafiają do funkcji dopiero przy wdrożeniu)${r.vercelEnv ? ` – środowisko: ${r.vercelEnv}` : ''}.`;
}
