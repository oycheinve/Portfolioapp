-- Zadania dzienne / codzienne nawyki – tabele dla modułu „Zadania” (Mój Majątek), zakładka „Dzienne”.
-- Uruchom raz w Supabase: SQL Editor → New query → wklej całość → Run.
-- Skrypt jest idempotentny i nie zmienia tabel `portfolios`, `weekly_tasks` ani `weekly_task_logs`.
--
-- Dzień: typ date ('RRRR-MM-DD', dzień kalendarzowy użytkownika).
-- daily_tasks      – definicje: nawyki codzienne (is_recurring = true, od `day` do `archived_day` – wyłącznie)
--                    albo zadania na jeden dzień (is_recurring = false, tylko w dniu `day`).
-- daily_task_logs  – wykonanie zadania w danym dniu (jeden wiersz = odhaczone tego dnia) – historia dni.
-- Row Level Security: każdy zalogowany użytkownik widzi i zmienia wyłącznie własne zadania i wpisy.

create table if not exists public.daily_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  is_recurring boolean not null default true,
  day date not null,
  archived_day date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (archived_day is null or archived_day >= day)
);

create index if not exists daily_tasks_user_idx on public.daily_tasks (user_id, day);

create table if not exists public.daily_task_logs (
  task_id uuid not null references public.daily_tasks (id) on delete cascade,
  day date not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  done_at timestamptz not null default now(),
  primary key (task_id, day)
);

create index if not exists daily_task_logs_user_day_idx on public.daily_task_logs (user_id, day);

alter table public.daily_tasks enable row level security;
alter table public.daily_task_logs enable row level security;

drop policy if exists "daily_tasks_select_own" on public.daily_tasks;
drop policy if exists "daily_tasks_insert_own" on public.daily_tasks;
drop policy if exists "daily_tasks_update_own" on public.daily_tasks;
drop policy if exists "daily_tasks_delete_own" on public.daily_tasks;

create policy "daily_tasks_select_own" on public.daily_tasks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "daily_tasks_insert_own" on public.daily_tasks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "daily_tasks_update_own" on public.daily_tasks
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "daily_tasks_delete_own" on public.daily_tasks
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "daily_task_logs_select_own" on public.daily_task_logs;
drop policy if exists "daily_task_logs_insert_own" on public.daily_task_logs;
drop policy if exists "daily_task_logs_update_own" on public.daily_task_logs;
drop policy if exists "daily_task_logs_delete_own" on public.daily_task_logs;

create policy "daily_task_logs_select_own" on public.daily_task_logs
  for select to authenticated using ((select auth.uid()) = user_id);
-- Wpis wykonania tylko dla własnego zadania
create policy "daily_task_logs_insert_own" on public.daily_task_logs
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.daily_tasks t where t.id = task_id and t.user_id = (select auth.uid()))
  );
create policy "daily_task_logs_update_own" on public.daily_task_logs
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "daily_task_logs_delete_own" on public.daily_task_logs
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.daily_tasks from anon;
revoke all on public.daily_task_logs from anon;
grant select, insert, update, delete on public.daily_tasks to authenticated;
grant select, insert, update, delete on public.daily_task_logs to authenticated;
