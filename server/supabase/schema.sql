create table if not exists public.jcoins_app_state (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.jcoins_app_state enable row level security;

drop policy if exists "No public access to JCoins app state" on public.jcoins_app_state;
create policy "No public access to JCoins app state"
on public.jcoins_app_state
for all
using (false)
with check (false);
