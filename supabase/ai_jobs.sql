-- Zadania AI w tle (FinTrack) – wynik skanu paragonu / analizy wyników zapisywany na serwerze, żeby nie przepadł,
-- gdy aplikację zamknięto przed odpowiedzią. Przy następnym otwarciu aplikacja odbiera wynik i usuwa wpis.
-- Uruchom raz w Supabase: SQL Editor → New query → wklej całość → Run (skrypt idempotentny; nie zmienia innych tabel).
--
-- Kolumny: id – identyfikator nadany przez aplikację; mode – 'receipt' | 'earnings'; status – 'pending' | 'done' |
-- 'error'; result – odpowiedź serwera (JSON); http_status – kod odpowiedzi.
-- RLS: użytkownik widzi i usuwa tylko swoje zadania. Zapis wyłącznie przez serwer (/api/news-summary, service_role).

create table if not exists public.ai_jobs (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  mode text not null,
  status text not null default 'pending',
  http_status int,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_jobs_user_idx on public.ai_jobs (user_id, created_at);

alter table public.ai_jobs enable row level security;

drop policy if exists "ai_jobs_select_own" on public.ai_jobs;
drop policy if exists "ai_jobs_delete_own" on public.ai_jobs;
create policy "ai_jobs_select_own" on public.ai_jobs for select using (auth.uid() = user_id);
create policy "ai_jobs_delete_own" on public.ai_jobs for delete using (auth.uid() = user_id);
