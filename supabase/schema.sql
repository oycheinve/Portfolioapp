-- Portfolio / Mój Majątek – baza danych kont użytkowników (Supabase).
-- Uruchom raz w Supabase: SQL Editor → New query → wklej → Run.
-- Jeden wiersz na użytkownika: cały stan aplikacji (jsonb) + ustawienia widoków.
-- Row Level Security: każdy zalogowany użytkownik widzi i zmienia wyłącznie własny wiersz.

create table if not exists public.portfolios (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  ui_prefs jsonb not null default '{}'::jsonb,
  schema_version integer,
  updated_at timestamptz not null default now()
);

alter table public.portfolios enable row level security;

drop policy if exists "portfolios_select_own" on public.portfolios;
drop policy if exists "portfolios_insert_own" on public.portfolios;
drop policy if exists "portfolios_update_own" on public.portfolios;
drop policy if exists "portfolios_delete_own" on public.portfolios;

create policy "portfolios_select_own" on public.portfolios
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "portfolios_insert_own" on public.portfolios
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "portfolios_update_own" on public.portfolios
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "portfolios_delete_own" on public.portfolios
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.portfolios from anon;
grant select, insert, update, delete on public.portfolios to authenticated;
