begin;

create extension if not exists pgtap;
select plan(13);

insert into auth.users (id, email)
values
  ('10000000-0000-4000-8000-000000000001', 'owner@test.local'),
  ('10000000-0000-4000-8000-000000000002', 'reader@test.local'),
  ('10000000-0000-4000-8000-000000000003', 'writer@test.local'),
  ('10000000-0000-4000-8000-000000000004', 'stranger@test.local');

insert into public.trips (id, user_id, title, cities)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'RLS trip',
  '[{"id":"city","label":"City"}]'
);

insert into public.trip_members (trip_id, user_id, email, access)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'reader@test.local', 'read'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'writer@test.local', 'write');

insert into public.ideas (id, trip_id, user_id, city, title)
values (
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'city',
  'Original'
);

set local role anon;
select is((select count(*) from public.trips), 0::bigint, 'anonymous users see no trips');
select is((select count(*) from public.ideas), 0::bigint, 'anonymous users see no ideas');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*) from public.trips), 0::bigint, 'unrelated users see no trips');
select is((select count(*) from public.ideas), 0::bigint, 'unrelated users see no ideas');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.trips), 1::bigint, 'readers see shared trips');
select is((select count(*) from public.ideas), 1::bigint, 'readers see shared ideas');
select is_empty(
  $$update public.ideas set title = 'Reader edit' where id = '30000000-0000-4000-8000-000000000001' returning 1$$,
  'readers cannot edit ideas'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select results_eq(
  $$update public.ideas set title = 'Writer edit' where id = '30000000-0000-4000-8000-000000000001' returning 1$$,
  $$values (1)$$,
  'writers can edit ideas'
);
select is_empty(
  $$update public.trips set title = 'Writer trip edit' where id = '20000000-0000-4000-8000-000000000001' returning 1$$,
  'writers cannot edit trips'
);
select is((select public.can_write_trip('20000000-0000-4000-8000-000000000001')), true, 'writer permission helper agrees with RLS');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$update public.trips set title = 'Owner edit' where id = '20000000-0000-4000-8000-000000000001' returning 1$$,
  $$values (1)$$,
  'owners can edit trips'
);
select lives_ok(
  $$select public.share_trip('20000000-0000-4000-8000-000000000001', 'stranger@test.local', 'read')$$,
  'owners can share with an existing account'
);
reset role;

delete from public.trips where id = '20000000-0000-4000-8000-000000000001';
select is((select count(*) from public.ideas where trip_id = '20000000-0000-4000-8000-000000000001'), 0::bigint, 'trip deletion cascades to ideas');

select * from finish();
rollback;
