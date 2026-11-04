-- Listy zakupów – tabele dla modułu „Zakupy” (FinTrack).
-- Uruchom raz w Supabase: SQL Editor → New query → wklej całość → Run.
-- Skrypt jest idempotentny (można go uruchomić ponownie) i nie zmienia innych tabel.
--
-- shopping_lists – listy użytkownika (np. „Spożywcze”, „Market budowlany”).
-- shopping_items – pozycje list: nazwa, opcjonalna ilość, znacznik „kupione”. Usunięcie listy usuwa jej pozycje.
-- Row Level Security: każdy zalogowany użytkownik widzi i zmienia wyłącznie własne listy i pozycje.

create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  sort_order bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shopping_lists_user_idx on public.shopping_lists (user_id);

create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  quantity text check (quantity is null or char_length(quantity) <= 30),
  done boolean not null default false,
  done_at timestamptz,
  sort_order bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shopping_items_user_list_idx on public.shopping_items (user_id, list_id);

alter table public.shopping_lists enable row level security;
alter table public.shopping_items enable row level security;

drop policy if exists "shopping_lists_select_own" on public.shopping_lists;
drop policy if exists "shopping_lists_insert_own" on public.shopping_lists;
drop policy if exists "shopping_lists_update_own" on public.shopping_lists;
drop policy if exists "shopping_lists_delete_own" on public.shopping_lists;

create policy "shopping_lists_select_own" on public.shopping_lists
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "shopping_lists_insert_own" on public.shopping_lists
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "shopping_lists_update_own" on public.shopping_lists
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "shopping_lists_delete_own" on public.shopping_lists
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "shopping_items_select_own" on public.shopping_items;
drop policy if exists "shopping_items_insert_own" on public.shopping_items;
drop policy if exists "shopping_items_update_own" on public.shopping_items;
drop policy if exists "shopping_items_delete_own" on public.shopping_items;

create policy "shopping_items_select_own" on public.shopping_items
  for select to authenticated using ((select auth.uid()) = user_id);
-- Pozycja tylko na własnej liście
create policy "shopping_items_insert_own" on public.shopping_items
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.shopping_lists l where l.id = list_id and l.user_id = (select auth.uid()))
  );
create policy "shopping_items_update_own" on public.shopping_items
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "shopping_items_delete_own" on public.shopping_items
  for delete to authenticated using ((select auth.uid()) = user_id);
