-- Trust-boundary validation: clients can call PostgREST directly, so these
-- checks belong in Postgres rather than only in React.
alter table public.trips
  add constraint trips_title_length check (char_length(btrim(title)) between 1 and 160),
  add constraint trips_date_order check (start_date is null or end_date is null or end_date >= start_date),
  add constraint trips_cities_array check (jsonb_typeof(cities) = 'array'),
  add constraint trips_answers_object check (jsonb_typeof(answers) = 'object');

alter table public.ideas
  add constraint ideas_city_length check (char_length(btrim(city)) between 1 and 120),
  add constraint ideas_title_length check (char_length(btrim(title)) between 1 and 200),
  add constraint ideas_lat_range check (lat is null or lat between -90 and 90),
  add constraint ideas_lng_range check (lng is null or lng between -180 and 180),
  add constraint ideas_origin_valid check (origin in ('perso', 'suggestion', 'carnet')),
  add constraint ideas_position_nonnegative check (position >= 0);

-- The generated baseline contained Supabase's broad default grants. These
-- functions are only useful to authenticated requests and RLS triggers.
revoke all on function public.owns_trip(uuid) from anon, authenticated;
revoke all on function public.can_read_trip(uuid) from anon, authenticated;
revoke all on function public.can_write_trip(uuid) from anon, authenticated;
revoke all on function public.share_trip(uuid, text, text) from anon, authenticated;
revoke all on function public.set_idea_owner() from anon, authenticated;
revoke all on function public.touch_updated_at() from anon, authenticated;

grant execute on function public.owns_trip(uuid) to authenticated;
grant execute on function public.can_read_trip(uuid) to authenticated;
grant execute on function public.can_write_trip(uuid) to authenticated;
grant execute on function public.share_trip(uuid, text, text) to authenticated;
