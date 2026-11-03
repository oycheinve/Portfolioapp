-- Powiadomienia Web Push (FinTrack) – subskrypcje urządzeń z ustawieniami powiadomień.
-- Uruchom raz w Supabase: SQL Editor → New query → wklej całość → Run (skrypt idempotentny; nie zmienia innych tabel).
--
-- Jeden wiersz = jedno urządzenie / przeglądarka (endpoint usługi push). Kolumny:
--   prefs     – ustawienia: { enabled, tasks: { on, hour }, news: { on, min, slot: 'MORNING' | 'NOON' } }
--   watch     – spółki z portfela do podsumowania wiadomości: [{ id, label, title, query, symbol }]
--   tz        – strefa czasowa użytkownika (godziny przypomnień liczone lokalnie)
--   last_sent – dzień ostatniego wysłania danego rodzaju: { tasks: 'RRRR-MM-DD', news: 'RRRR-MM-DD' }
-- RLS: użytkownik widzi i zmienia tylko swoje subskrypcje. Serwer (/api/push-cron) używa klucza service_role.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  prefs jsonb not null default '{}'::jsonb,
  watch jsonb not null default '[]'::jsonb,
  tz text not null default 'Europe/Warsaw',
  last_sent jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;

create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "push_subscriptions_update_own" on public.push_subscriptions
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- ── Harmonogram: co godzinę wywołanie /api/push-cron (pg_cron + pg_net) ──
-- 1) Database → Extensions: włącz „pg_cron” i „pg_net”.
-- 2) Uruchom poniższe (podmień adres aplikacji i sekret – ten sam co zmienna CRON_SECRET na Vercelu):
--
-- select cron.schedule(
--   'fintrack-push-hourly',
--   '5 * * * *',
--   $$ select net.http_get(
--        url := 'https://TWOJA-DOMENA.vercel.app/api/push-cron',
--        headers := jsonb_build_object('Authorization', 'Bearer TWOJ_CRON_SECRET')
--      ); $$
-- );
--
-- Wyłączenie: select cron.unschedule('fintrack-push-hourly');
