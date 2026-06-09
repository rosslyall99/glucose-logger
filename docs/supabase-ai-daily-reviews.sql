-- AI daily review archive for the Range glucose logger app.
-- Run manually in Supabase SQL editor or your migration workflow.
-- This stores personal pattern-spotting notes only and should not be used
-- to generate medical advice, diagnosis, or insulin dosing recommendations.

create extension if not exists pgcrypto;

create table if not exists public.ai_daily_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_label text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  review_date date not null,
  prompt_text text null,
  response_text text not null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_daily_reviews_user_review_date_idx
  on public.ai_daily_reviews (user_id, review_date desc);

create index if not exists ai_daily_reviews_user_period_label_idx
  on public.ai_daily_reviews (user_id, period_label);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_daily_reviews_user_review_date_unique'
  ) then
    alter table public.ai_daily_reviews
    add constraint ai_daily_reviews_user_review_date_unique
    unique (user_id, review_date);
  end if;
end
$$;

alter table public.ai_daily_reviews enable row level security;

drop policy if exists "ai_daily_reviews_select_own" on public.ai_daily_reviews;
create policy "ai_daily_reviews_select_own"
  on public.ai_daily_reviews
  for select
  using (auth.uid() = user_id);

drop policy if exists "ai_daily_reviews_insert_own" on public.ai_daily_reviews;
create policy "ai_daily_reviews_insert_own"
  on public.ai_daily_reviews
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "ai_daily_reviews_update_own" on public.ai_daily_reviews;
create policy "ai_daily_reviews_update_own"
  on public.ai_daily_reviews
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "ai_daily_reviews_delete_own" on public.ai_daily_reviews;
create policy "ai_daily_reviews_delete_own"
  on public.ai_daily_reviews
  for delete
  using (auth.uid() = user_id);

create or replace function public.set_ai_daily_reviews_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_ai_daily_reviews_updated_at on public.ai_daily_reviews;
create trigger set_ai_daily_reviews_updated_at
before update on public.ai_daily_reviews
for each row
execute function public.set_ai_daily_reviews_updated_at();
