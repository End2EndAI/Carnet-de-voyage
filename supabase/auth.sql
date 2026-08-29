-- Carnet de voyage — accès par lien magique, restreint à une liste d'adresses
-- À exécuter APRÈS supabase/schema.sql.

-- 1. La liste des personnes autorisées
create table if not exists public.allowed_emails (
  email    text primary key,
  note     text,
  added_at timestamptz not null default now()
);

alter table public.allowed_emails enable row level security;

drop policy if exists "allowed_emails_select" on public.allowed_emails;
create policy "allowed_emails_select" on public.allowed_emails
  for select to authenticated using (true);
-- Aucune politique d'écriture : la liste ne se modifie que depuis le
-- dashboard Supabase ou avec la clé service_role. L'application ne peut pas
-- s'auto-ajouter des accès.

-- 2. Le test d'appartenance
-- `security definer` : la fonction lit allowed_emails en contournant la RLS,
-- sinon le test échouerait pour quelqu'un qui n'est pas encore autorisé.
create or replace function public.is_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_allowed() from public;
grant execute on function public.is_allowed() to authenticated;

-- 3. Les idées ne sont plus lisibles publiquement
-- `to authenticated` écarte d'emblée le rôle anon : sans session, la table
-- est invisible, y compris en lecture.
drop policy if exists "ideas_select" on public.ideas;
drop policy if exists "ideas_insert" on public.ideas;
drop policy if exists "ideas_update" on public.ideas;
drop policy if exists "ideas_delete" on public.ideas;

create policy "ideas_select" on public.ideas
  for select to authenticated using (public.is_allowed());
create policy "ideas_insert" on public.ideas
  for insert to authenticated with check (public.is_allowed());
create policy "ideas_update" on public.ideas
  for update to authenticated using (public.is_allowed()) with check (public.is_allowed());
create policy "ideas_delete" on public.ideas
  for delete to authenticated using (public.is_allowed());

-- 4. Les personnes autorisées
-- Ajoutez ou retirez des lignes ici pour ouvrir ou fermer l'accès.
-- Une adresse retirée perd l'accès dès sa requête suivante, mais sa session
-- reste techniquement valide : révoquez-la aussi dans Authentication > Users.
insert into public.allowed_emails (email, note) values
  ('REMPLACER@exemple.com', 'Louis'),
  ('jade.albrand@gmail.com', 'Jade')
on conflict (email) do nothing;
