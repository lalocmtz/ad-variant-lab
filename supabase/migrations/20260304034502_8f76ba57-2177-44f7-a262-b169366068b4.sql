create table public.analysis_history (
  id uuid primary key default gen_random_uuid(),
  tiktok_url text not null,
  created_at timestamptz default now(),
  variant_count int,
  results jsonb not null
);
alter table public.analysis_history enable row level security;
create policy "Public read" on public.analysis_history for select using (true);
create policy "Public insert" on public.analysis_history for insert with check (true);