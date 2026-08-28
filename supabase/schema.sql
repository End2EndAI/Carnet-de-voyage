-- Carnet de voyage — schéma Supabase
-- À exécuter dans le SQL Editor du projet Supabase.

create table if not exists public.ideas (
  id          text primary key,
  city        text not null,
  title       text not null,
  kr          text,
  type        text,
  verdict     text not null default 'voir'
                check (verdict in ('oui', 'option', 'voir', 'non')),
  note        text,
  description text,          -- « desc » est un mot réservé en SQL
  zone        text,
  avis        text,
  when_note   text,          -- « when » est un mot réservé en SQL
  lat         double precision,
  lng         double precision,
  origin      text not null default 'carnet',
  position    integer not null default 0,
  updated_at  timestamptz not null default now()
);

create index if not exists ideas_city_idx on public.ideas (city);
create index if not exists ideas_position_idx on public.ideas (position);

-- Horodatage automatique
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ideas_touch_updated_at on public.ideas;
create trigger ideas_touch_updated_at
  before update on public.ideas
  for each row execute function public.touch_updated_at();

-- Row Level Security
-- Le carnet est un usage personnel sans compte : la clé anon a un accès
-- complet à cette table. Toute personne connaissant l'URL du site peut donc
-- lire et modifier les idées. Pour cloisonner par utilisateur, activez
-- Supabase Auth et remplacez `true` par `auth.uid() = user_id`.
alter table public.ideas enable row level security;

drop policy if exists "ideas_select" on public.ideas;
drop policy if exists "ideas_insert" on public.ideas;
drop policy if exists "ideas_update" on public.ideas;
drop policy if exists "ideas_delete" on public.ideas;

create policy "ideas_select" on public.ideas for select using (true);
create policy "ideas_insert" on public.ideas for insert with check (true);
create policy "ideas_update" on public.ideas for update using (true) with check (true);
create policy "ideas_delete" on public.ideas for delete using (true);
