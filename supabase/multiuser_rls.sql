-- FinTrack – wieloużytkowość (Wariant A): izolacja danych każdego konta (Supabase Auth + Row Level Security).
-- Uruchom w Supabase: SQL Editor → New query → wklej całość → Run. Skrypt jest idempotentny (można go
-- uruchamiać wielokrotnie) i NIE usuwa danych ani istniejących, ściślejszych polityk.
--
-- Najpierw (jednorazowo) uruchom skrypty tabel, z których korzystasz: schema.sql (portfel), daily_tasks.sql,
-- weekly_tasks.sql, monthly_tasks.sql, shopping_lists.sql, push_subscriptions.sql, inflation_rates.sql.
-- Ten skrypt dla każdej istniejącej tabeli danych użytkownika:
--   1) dodaje kolumnę user_id (uuid → auth.users, domyślnie auth.uid()), jeśli jej brakuje,
--   2) włącza Row Level Security,
--   3) gdy tabela nie ma żadnej polityki – tworzy polityki „tylko własne wiersze” (select / insert / update / delete),
--   4) odbiera dostęp roli anon (niezalogowani) i nadaje uprawnienia roli authenticated.
-- Tabela inflation_rates (wspólne dane GUS) – tylko odczyt dla wszystkich, zapis wyłącznie z serwera (service role).
-- Na końcu raport: RLS, kolumna user_id i liczba polityk dla każdej tabeli.

do $$
declare
  t text;
  user_tables text[] := array[
    'portfolios', 'daily_tasks', 'daily_task_logs', 'weekly_tasks', 'weekly_task_logs',
    'monthly_tasks', 'monthly_task_logs', 'shopping_lists', 'shopping_items', 'push_subscriptions'
  ];
begin
  foreach t in array user_tables loop
    if to_regclass('public.' || t) is null then
      raise notice 'Pominięto % – tabela nie istnieje (uruchom jej skrypt, jeśli korzystasz z modułu)', t;
      continue;
    end if;

    -- 1) user_id
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'user_id') then
      execute format('alter table public.%I add column user_id uuid default auth.uid() references auth.users (id) on delete cascade', t);
      execute format('create index if not exists %I on public.%I (user_id)', t || '_user_idx', t);
      raise notice 'Dodano kolumnę user_id do %', t;
    end if;

    -- 2) RLS
    execute format('alter table public.%I enable row level security', t);

    -- 3) polityki „tylko własne wiersze” – tylko gdy tabela nie ma żadnej (istniejące, ściślejsze zostają)
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t) then
      execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_own_select', t);
      execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t || '_own_insert', t);
      execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_own_update', t);
      execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t || '_own_delete', t);
      raise notice 'Utworzono polityki RLS dla %', t;
    end if;

    -- 4) uprawnienia
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;

  -- Wspólne dane inflacji (GUS): odczyt dla wszystkich, bez zapisu z aplikacji
  if to_regclass('public.inflation_rates') is not null then
    alter table public.inflation_rates enable row level security;
    revoke insert, update, delete on public.inflation_rates from anon, authenticated;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'inflation_rates' and cmd = 'SELECT') then
      create policy "inflation_rates read" on public.inflation_rates for select to anon, authenticated using (true);
    end if;
  end if;
end $$;

-- Raport kontrolny: każda tabela danych użytkownika powinna mieć rls_wlaczone = true, ma_user_id = true, polityk ≥ 4
select
  c.relname as tabela,
  c.relrowsecurity as rls_wlaczone,
  exists (select 1 from information_schema.columns i where i.table_schema = 'public' and i.table_name = c.relname and i.column_name = 'user_id') as ma_user_id,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as polityk
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname in ('portfolios', 'daily_tasks', 'daily_task_logs', 'weekly_tasks', 'weekly_task_logs', 'monthly_tasks', 'monthly_task_logs', 'shopping_lists', 'shopping_items', 'push_subscriptions', 'inflation_rates')
order by c.relname;
