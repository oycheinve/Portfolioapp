# FinTrack – wieloużytkowość (Wariant A): konfiguracja Supabase krok po kroku

Każda osoba ma własne konto (e-mail + hasło) i widzi wyłącznie swoje dane – w bazie (Row Level Security)
i w przeglądarce (dane lokalne pod prefiksem `u:<id użytkownika>:`).

## 1. Logowanie e-mail + hasło (Authentication)

1. Supabase → Twój projekt → **Authentication** → **Sign In / Providers** → **Email**: włączone **Enable Email provider**.
2. **Confirm email**:
   - włączone (zalecane) – po rejestracji użytkownik musi kliknąć link z maila, zanim się zaloguje;
   - wyłączone – logowanie od razu po rejestracji.
3. **Authentication** → **URL Configuration**:
   - **Site URL**: adres aplikacji na Vercel, np. `https://twoja-aplikacja.vercel.app`;
   - **Redirect URLs**: ten sam adres + `/**` (linki z maili: potwierdzenie konta, reset hasła).
4. (Opcjonalnie) **Authentication** → **Policies / Rate Limits** – limity rejestracji i logowań.
5. Jeśli ma to być aplikacja tylko dla zaproszonych osób: **Authentication** → **Sign In / Providers** →
   wyłącz **Allow new users to sign up** i dodawaj konta ręcznie (**Authentication** → **Users** → **Add user**).

## 2. Tabele i izolacja danych (SQL Editor)

1. **SQL Editor** → **New query**.
2. Jeśli tabel jeszcze nie ma – uruchom kolejno skrypty z folderu `supabase/` (każdy: wklej → **Run**):
   `schema.sql` (portfel), `daily_tasks.sql`, `weekly_tasks.sql`, `monthly_tasks.sql`, `shopping_lists.sql`,
   `push_subscriptions.sql`, `inflation_rates.sql` – tylko te, z których modułów korzystasz.
3. Uruchom **`multiuser_rls.sql`** (wklej całość → **Run**). Skrypt można uruchamiać wielokrotnie; nie usuwa danych.
4. Sprawdź raport na dole wyniku: każda tabela danych użytkownika ma `rls_wlaczone = true`, `ma_user_id = true`
   i `polityk ≥ 4`. `inflation_rates` (wspólne dane GUS) ma 1 politykę odczytu i brak `user_id` – tak ma być.
5. (Kontrola) **Table Editor** → wybierz tabelę → u góry ma być **RLS enabled**; **Authentication** → **Policies** –
   polityki „…_own…” / „…_select_own” itd. dla każdej tabeli.

## 3. Zmienne w Vercel

**Vercel** → projekt → **Settings** → **Environment Variables** (Production, Preview):

| Zmienna | Skąd | Uwagi |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | wymagane – bez niej aplikacja pokaże ekran konfiguracji |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys → `anon` `public` | klucz publiczny – bezpieczny w przeglądarce dzięki RLS |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | jw., klucz `service_role` | **tylko serwer** (bez `VITE_`!) – inflacja, powiadomienia, autoryzacja AI |

Po zmianie zmiennych: **Deployments** → ostatnie wdrożenie → **Redeploy**.

## 4. Pierwsze uruchomienie

1. Otwórz aplikację – pojawi się ekran **Logowanie / Rejestracja** (bez konta aplikacja się nie otworzy).
2. Załóż konto. Dane, które były dotąd w tej przeglądarce bez konta, przejdą na to pierwsze konto
   (i zostaną wysłane do chmury).
3. Kolejne osoby zakładają własne konta – na tym samym urządzeniu też: po wylogowaniu
   (Ustawienia → Konto i synchronizacja w chmurze → **Wyloguj**) i zalogowaniu innej osoby jej dane są
   osobne; dane poprzedniej osoby zostają w jej przestrzeni i wracają po jej zalogowaniu.

## Jak działa izolacja

- **Baza:** każda tabela danych ma kolumnę `user_id`; polityki RLS pozwalają czytać i zmieniać wyłącznie wiersze,
  w których `user_id = auth.uid()` (zalogowany użytkownik). Aplikacja dodatkowo filtruje każde zapytanie po `user_id`.
  Niezalogowani (rola `anon`) nie mają dostępu do żadnej tabeli danych.
- **Przeglądarka:** po zalogowaniu klucze danych (`wealth-app-*`, `fintrack-*`, stan synchronizacji) są zapisywane jako
  `u:<id>:<klucz>` (`src/lib/userStorage.js`); globalne zostają tylko konfiguracja Supabase, sesja logowania i motyw
  ekranu logowania.
- **IKE - Julka, listy zakupów, kategorie produktów, zadania, ustawienia** – wszystko per konto.
