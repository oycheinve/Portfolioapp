-- Zadania tygodniowe / nawyki – tabele dla modułu „Zadania” (Mój Majątek).
-- Uruchom raz w Supabase: SQL Editor → New query → wklej całość → Run.
-- Skrypt jest idempotentny (można go uruchomić ponownie) i nie zmienia tabeli `portfolios`.
--
-- Identyfikator tygodnia: ISO 8601 w formacie 'RRRR-Www' (np. '2026-W44', tydzień od poniedziałku).
-- weekly_tasks      – definicje zadań: cykliczne (is_recurring = true, wracają co tydzień od week_id
--                     do archived_week – wyłącznie) albo jednorazowe (tylko w tygodniu week_id).
-- weekly_task_logs  – wykonanie zadania w danym tygodniu (jeden wiersz = zadanie odhaczone w tym tygodniu);
--                     historia służy jako archiwum minionych tygodni.
-- Row Level Security: każdy zalogowany użytkownik widzi i zmienia wyłącznie własne zadania i wpisy.

create table if not exists public.weekly_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  is_recurring boolean not null default true,
  week_id text not null check (week_id ~ '^\d{4}-W\d{2}$'),
  archived_week text check (archived_week is null or archived_week ~ '^\d{4}-W\d{2}$'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists weekly_tasks_user_idx on public.weekly_tasks (user_id, week_id);

create table if not exists public.weekly_task_logs (
  task_id uuid not null references public.weekly_tasks (id) on delete cascade,
  week_id text not null check (week_id ~ '^\d{4}-W\d{2}$'),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  done_at timestamptz not null default now(),
  primary key (task_id, week_id)
);

create index if not exists weekly_task_logs_user_week_idx on public.weekly_task_logs (user_id, week_id);

alter table public.weekly_tasks enable row level security;
alter table public.weekly_task_logs enable row level security;

drop policy if exists "weekly_tasks_select_own" on public.weekly_tasks;
drop policy if exists "weekly_tasks_insert_own" on public.weekly_tasks;
drop policy if exists "weekly_tasks_update_own" on public.weekly_tasks;
drop policy if exists "weekly_tasks_delete_own" on public.weekly_tasks;

create policy "weekly_tasks_select_own" on public.weekly_tasks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "weekly_tasks_insert_own" on public.weekly_tasks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "weekly_tasks_update_own" on public.weekly_tasks
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "weekly_tasks_delete_own" on public.weekly_tasks
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "weekly_task_logs_select_own" on public.weekly_task_logs;
drop policy if exists "weekly_task_logs_insert_own" on public.weekly_task_logs;
drop policy if exists "weekly_task_logs_update_own" on public.weekly_task_logs;
drop policy if exists "weekly_task_logs_delete_own" on public.weekly_task_logs;

create policy "weekly_task_logs_select_own" on public.weekly_task_logs
  for select to authenticated using ((select auth.uid()) = user_id);
-- Wpis wykonania tylko dla własnego zadania
create policy "weekly_task_logs_insert_own" on public.weekly_task_logs
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.weekly_tasks t where t.id = task_id and t.user_id = (select auth.uid()))
  );
create policy "weekly_task_logs_update_own" on public.weekly_task_logs
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "weekly_task_logs_delete_own" on public.weekly_task_logs
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.weekly_tasks from anon;
revoke all on public.weekly_task_logs from anon;
grant select, insert, update, delete on public.weekly_tasks to authenticated;
grant select, insert, update, delete on public.weekly_task_logs to authenticated;
