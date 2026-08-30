-- Carnet de voyage — schéma multi-comptes
--
-- À exécuter dans le SQL Editor du projet Supabase. Idempotent : le fichier
-- passe aussi bien sur une base neuve que sur l'ancienne base mono-carnet,
-- dont les données sont conservées puis reprises dans un voyage (section 6).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Ancienne base mono-carnet — mise de côté, jamais supprimée
-- ---------------------------------------------------------------------------
-- L'ancienne table `ideas` avait un identifiant texte (slug) et aucune notion
-- de propriétaire. On la renomme plutôt que de la perdre : la section 6 en
-- reprend le contenu.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ideas'
      and column_name = 'id' and data_type = 'text'
  ) then
    alter table public.ideas rename to ideas_legacy;
  end if;
end $$;

-- L'accès par liste blanche n'a plus lieu d'être : chacun crée son compte et
-- ne voit que ses propres données (politiques RLS plus bas).
drop function if exists public.is_allowed() cascade;
drop table if exists public.allowed_emails cascade;

-- ---------------------------------------------------------------------------
-- 2. Horodatage automatique
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Voyages
-- ---------------------------------------------------------------------------
-- `cities` : [{ "id": "seoul", "label": "Séoul", "native": "서울", "note": "3 nuits" }]
-- `answers` : les réponses du questionnaire de création, gardées pour pouvoir
--             relancer une génération avec le même contexte.
create table if not exists public.trips (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null,
  native_name text,
  start_date  date,
  end_date    date,
  cities      jsonb not null default '[]'::jsonb,
  answers     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists trips_user_idx on public.trips (user_id, created_at desc);

drop trigger if exists trips_touch_updated_at on public.trips;
create trigger trips_touch_updated_at
  before update on public.trips
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Idées de visite
-- ---------------------------------------------------------------------------
-- `description` et `when_note` : « desc » et « when » sont réservés en SQL.
-- `user_id` est redondant avec trips.user_id, mais permet une politique RLS
-- qui tient en une comparaison, sans sous-requête sur trips à chaque ligne.
create table if not exists public.ideas (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  city        text not null,
  title       text not null,
  kr          text,
  type        text,
  verdict     text not null default 'voir'
                check (verdict in ('oui', 'option', 'voir', 'non')),
  note        text,
  description text,
  zone        text,
  avis        text,
  when_note   text,
  lat         double precision,
  lng         double precision,
  origin      text not null default 'perso',
  favori      boolean not null default false,
  position    integer not null default 0,
  updated_at  timestamptz not null default now()
);

create index if not exists ideas_trip_idx on public.ideas (trip_id, position);

drop trigger if exists ideas_touch_updated_at on public.ideas;
create trigger ideas_touch_updated_at
  before update on public.ideas
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Cloisonnement par compte
-- ---------------------------------------------------------------------------
-- `to authenticated` écarte le rôle anon : sans session, les tables sont
-- invisibles. `user_id = auth.uid()` fait le reste : un compte ne voit et
-- n'écrit que ses propres lignes. Les colonnes user_id ont auth.uid() pour
-- valeur par défaut, le client n'a donc jamais à l'envoyer — et le `with
-- check` l'empêche d'écrire au nom de quelqu'un d'autre s'il essaie.
-- `security definer` : la fonction lit `trips` sans repasser par la RLS, ce
-- qui éviterait une récursion entre les politiques des deux tables.
create or replace function public.owns_trip(trip uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.trips where id = trip and user_id = auth.uid());
$$;

revoke all on function public.owns_trip(uuid) from public;
grant execute on function public.owns_trip(uuid) to authenticated;

alter table public.trips enable row level security;
alter table public.ideas enable row level security;

drop policy if exists "trips_select" on public.trips;
drop policy if exists "trips_insert" on public.trips;
drop policy if exists "trips_update" on public.trips;
drop policy if exists "trips_delete" on public.trips;

create policy "trips_select" on public.trips
  for select to authenticated using (user_id = auth.uid());
create policy "trips_insert" on public.trips
  for insert to authenticated with check (user_id = auth.uid());
create policy "trips_update" on public.trips
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "trips_delete" on public.trips
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "ideas_select" on public.ideas;
drop policy if exists "ideas_insert" on public.ideas;
drop policy if exists "ideas_update" on public.ideas;
drop policy if exists "ideas_delete" on public.ideas;

-- À l'écriture, on vérifie en plus que le voyage visé appartient bien au
-- compte : sans ça, rien n'empêcherait d'insérer une idée dans le voyage de
-- quelqu'un d'autre. Invisible pour la victime (son select filtre sur son
-- propre user_id), mais une écriture qui n'a pas lieu d'être.
create policy "ideas_select" on public.ideas
  for select to authenticated
  using (user_id = auth.uid());

create policy "ideas_insert" on public.ideas
  for insert to authenticated
  with check (user_id = auth.uid() and public.owns_trip(trip_id));

create policy "ideas_update" on public.ideas
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.owns_trip(trip_id));

create policy "ideas_delete" on public.ideas
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 6. Reprise de l'ancien carnet Corée du Sud
-- ---------------------------------------------------------------------------
-- Les idées de l'ancienne table sont rattachées au plus ancien compte existant
-- sous forme d'un voyage normal. Sans compte en base, ou si le voyage a déjà
-- été repris, le bloc ne fait rien — et `ideas_legacy` reste là dans tous les
-- cas, à supprimer à la main une fois la reprise vérifiée.
do $$
declare
  owner_id  uuid;
  trip_id   uuid;
  moved     integer;
begin
  if to_regclass('public.ideas_legacy') is null then return; end if;

  select id into owner_id from auth.users order by created_at limit 1;
  if owner_id is null then
    raise notice 'Aucun compte en base : reprise du carnet Corée reportée. Relancez ce fichier après votre inscription.';
    return;
  end if;

  if exists (select 1 from public.trips where user_id = owner_id and title = 'Corée du Sud') then
    return;
  end if;

  insert into public.trips (user_id, title, native_name, start_date, end_date, cities)
  values (
    owner_id, 'Corée du Sud', '대한민국', date '2026-09-24', date '2026-10-10',
    '[{"id":"seoul","label":"Séoul","native":"서울","note":"2 séjours · 7 nuits"},
      {"id":"jeju","label":"Jeju","native":"제주","note":"3 nuits"},
      {"id":"busan","label":"Busan","native":"부산","note":"4 nuits"},
      {"id":"gyeongju","label":"Gyeongju","native":"경주","note":"Day trip depuis Busan"},
      {"id":"jeonju","label":"Jeonju","native":"전주","note":"2 nuits"}]'::jsonb
  )
  returning id into trip_id;

  insert into public.ideas (
    trip_id, user_id, city, title, kr, type, verdict, note, description,
    zone, avis, when_note, lat, lng, origin, favori, position
  )
  select
    trip_id, owner_id, city, title, kr, type, verdict, note, description,
    zone, avis, when_note, lat, lng, origin, favori, position
  from public.ideas_legacy;

  get diagnostics moved = row_count;
  raise notice 'Carnet Corée du Sud repris : % idées.', moved;
end $$;
