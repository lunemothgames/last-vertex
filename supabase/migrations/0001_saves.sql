-- Cloud save: one row per player (anonymous or email account).
-- Run in Supabase dashboard -> SQL Editor, or with `supabase db push`.

create table public.saves (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  data        jsonb       not null,
  last_seen   bigint      not null default 0,   -- save.lastSeen from the device, informational
  updated_at  timestamptz not null default now(),
  constraint saves_size check (octet_length(data::text) < 200000)
);

alter table public.saves enable row level security;

-- the project is created with "automatically expose new tables" off, so API access is granted explicitly;
-- the policies below still limit every row to its owner
grant select, insert, update, delete on public.saves to authenticated;

create policy "own save: read"   on public.saves for select to authenticated using (auth.uid() = user_id);
create policy "own save: insert" on public.saves for insert to authenticated with check (auth.uid() = user_id);
create policy "own save: update" on public.saves for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own save: delete" on public.saves for delete to authenticated using (auth.uid() = user_id);

-- updated_at is set by the server so a device can't fake it; the client uses it for conflict detection
create or replace function public.touch_saves() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger saves_touch before insert or update on public.saves
  for each row execute function public.touch_saves();
