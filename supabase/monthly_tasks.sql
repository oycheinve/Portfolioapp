-- Zadania miesięczne – tabele dla modułu „Zadania” (Mój Majątek), zakładka „Miesięczne”.
-- Uruchom raz w Supabase: SQL Editor → New query → wklej całość → Run.
-- Skrypt jest idempotentny i nie zmienia tabel `portfolios`, `weekly_*` ani `daily_*`.
--
-- Miesiąc: tekst 'RRRR-MM' (np. '2026-10').
-- monthly_tasks      – definicje: zadania co miesiąc (is_recurring = true, od `month` do `archived_month` – wyłącznie)
--                      albo zadania na jeden miesiąc (is_recurring = false, tylko w miesiącu `month`).
-- monthly_task_logs  – wykonanie zadania w danym miesiącu (jeden wiersz = odhaczone w tym miesiącu) – historia.
-- Wskaźnik konsekwencji liczony jest w aplikacji z tabel dziennych, tygodniowych i miesięcznych – bez dodatkowych tabel.
-- Row Level Security: każdy zalogowany użytkownik widzi i zmienia wyłącznie własne zadania i wpisy.

create table if not exists public.monthly_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  is_recurring boolean not null default true,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  archived_month text check (archived_month is null or archived_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (archived_month is null or archived_month >= month)
);

create index if not exists monthly_tasks_user_idx on public.monthly_tasks (user_id, month);

create table if not exists public.monthly_task_logs (
  task_id uuid not null references public.monthly_tasks (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  done_at timestamptz not null default now(),
  primary key (task_id, month)
);

create index if not exists monthly_task_logs_user_month_idx on public.monthly_task_logs (user_id, month);

alter table public.monthly_tasks enable row level security;
alter table public.monthly_task_logs enable row level security;

drop policy if exists "monthly_tasks_select_own" on public.monthly_tasks;
drop policy if exists "monthly_tasks_insert_own" on public.monthly_tasks;
drop policy if exists "monthly_tasks_update_own" on public.monthly_tasks;
drop policy if exists "monthly_tasks_delete_own" on public.monthly_tasks;

create policy "monthly_tasks_select_own" on public.monthly_tasks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "monthly_tasks_insert_own" on public.monthly_tasks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "monthly_tasks_update_own" on public.monthly_tasks
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "monthly_tasks_delete_own" on public.monthly_tasks
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "monthly_task_logs_select_own" on public.monthly_task_logs;
drop policy if exists "monthly_task_logs_insert_own" on public.monthly_task_logs;
drop policy if exists "monthly_task_logs_update_own" on public.monthly_task_logs;
drop policy if exists "monthly_task_logs_delete_own" on public.monthly_task_logs;

create policy "monthly_task_logs_select_own" on public.monthly_task_logs
  for select to authenticated using ((select auth.uid()) = user_id);
-- Wpis wykonania tylko dla własnego zadania
create policy "monthly_task_logs_insert_own" on public.monthly_task_logs
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.monthly_tasks t where t.id = task_id and t.user_id = (select auth.uid()))
  );
create policy "monthly_task_logs_update_own" on public.monthly_task_logs
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "monthly_task_logs_delete_own" on public.monthly_task_logs
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.monthly_tasks from anon;
revoke all on public.monthly_task_logs from anon;
grant select, insert, update, delete on public.monthly_tasks to authenticated;
grant select, insert, update, delete on public.monthly_task_logs to authenticated;

-- ── Postęp liczbowy (jak w Celach) – kolumny opcjonalne, dodawane bezpiecznie także do istniejących tabel ──
-- monthly_tasks.target / unit / step – wartość docelowa na miesiąc (np. 4 książki), jednostka i krok przycisków +/−
-- monthly_task_logs.progress – postęp w danym miesiącu; done – czy zadanie jest wykonane (cel osiągnięty
-- albo odhaczone ręcznie); dotychczasowe wpisy pozostają wykonane (domyślnie true).
alter table public.monthly_tasks add column if not exists target numeric check (target is null or target > 0);
alter table public.monthly_tasks add column if not exists unit text check (unit is null or char_length(unit) <= 20);
alter table public.monthly_tasks add column if not exists step numeric check (step is null or step > 0);
alter table public.monthly_task_logs add column if not exists progress numeric check (progress is null or progress >= 0);
alter table public.monthly_task_logs add column if not exists done boolean not null default true;

-- Odświeżenie schematu API (nowe kolumny widoczne od razu)
notify pgrst, 'reload schema';
