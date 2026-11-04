-- FinTrack: miesięczne dane o inflacji CPI w Polsce (GUS) – benchmark inflacji w wykresach i oprocentowanie COI/EDO.
-- Uruchom raz w Supabase: SQL Editor → New query → wklej całość → Run. Skrypt można uruchamiać wielokrotnie.
--
-- Dane są wspólne dla wszystkich użytkowników aplikacji (statystyka publiczna): odczyt dla każdego, zapis tylko
-- przez serwer (klucz service role w funkcji /api/inflation-sync). Ręczne korekty użytkownika zapisują się w jego
-- ustawieniach (Ustawienia → System i Konto → Inflacja CPI) i nie zmieniają tej tabeli.

create table if not exists public.inflation_rates (
  year        smallint     not null check (year between 1990 and 2100),
  month       smallint     not null check (month between 1 and 12),
  yoy         numeric(6,2),            -- zmiana cen r/r w % (analogiczny miesiąc poprzedniego roku = 100 → minus 100)
  mom         numeric(6,2),            -- zmiana cen m/m w % (poprzedni miesiąc = 100 → minus 100)
  cpi_value   numeric(8,2) generated always as (case when yoy is null then null else 100 + yoy end) stored, -- wskaźnik GUS (r/r, poprz. rok = 100)
  source      text         not null default 'GUS',
  is_manual   boolean      not null default false, -- wiersz poprawiony ręcznie w bazie – synchronizacja go nie nadpisuje
  updated_at  timestamptz  not null default now(),
  primary key (year, month)
);

alter table public.inflation_rates enable row level security;

drop policy if exists "inflation_rates read" on public.inflation_rates;
create policy "inflation_rates read" on public.inflation_rates for select to anon, authenticated using (true);
-- brak polityk insert/update/delete: zapis wyłącznie kluczem service role (omija RLS)

-- Odczyty startowe (GUS, r/r) – aplikacja działa od razu; pełna historia i odczyty m/m po pierwszej synchronizacji
insert into public.inflation_rates (year, month, yoy, source) values
  (2023,1,16.6,'GUS'),(2023,2,18.4,'GUS'),(2023,3,16.1,'GUS'),(2023,4,14.7,'GUS'),(2023,5,13.0,'GUS'),(2023,6,11.5,'GUS'),
  (2023,7,10.8,'GUS'),(2023,8,10.1,'GUS'),(2023,9,8.2,'GUS'),(2023,10,6.6,'GUS'),(2023,11,6.6,'GUS'),(2023,12,6.2,'GUS'),
  (2024,1,3.7,'GUS'),(2024,2,2.8,'GUS'),(2024,3,2.0,'GUS'),(2024,4,2.4,'GUS'),(2024,5,2.5,'GUS'),(2024,6,2.6,'GUS'),
  (2024,7,4.2,'GUS'),(2024,8,4.3,'GUS'),(2024,9,4.9,'GUS'),(2024,10,5.0,'GUS'),(2024,11,4.7,'GUS'),(2024,12,4.7,'GUS'),
  (2025,1,4.9,'GUS'),(2025,2,4.9,'GUS'),(2025,3,4.9,'GUS'),(2025,4,4.3,'GUS'),(2025,5,4.0,'GUS'),(2025,6,4.1,'GUS'),
  (2025,7,3.1,'GUS'),(2025,8,2.9,'GUS'),(2025,9,2.9,'GUS'),(2025,10,2.8,'GUS')
on conflict (year, month) do nothing;

-- ── Harmonogram (wybierz JEDEN sposób) ──
-- A) Vercel Cron (domyślnie, plik vercel.json): codziennie ok. 9:20 UTC wywołuje /api/inflation-sync z nagłówkiem
--    „Authorization: Bearer <CRON_SECRET>” – wystarczy zmienna CRON_SECRET w Vercel. GUS publikuje szybki szacunek
--    pod koniec miesiąca, a pełne dane w połowie następnego; codzienne sprawdzenie zapisuje je w dniu publikacji.
-- B) Supabase pg_cron + pg_net (jak dla powiadomień) – podmień adres i sekret:
-- select cron.schedule('fintrack-inflation-sync', '20 9 * * *', $$
--   select net.http_get(url := 'https://TWOJA-APLIKACJA.vercel.app/api/inflation-sync?secret=TWOJ_CRON_SECRET');
-- $$);
