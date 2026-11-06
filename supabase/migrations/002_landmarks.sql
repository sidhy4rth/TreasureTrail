-- Campus landmarks (Learning Centre 1, Library, ...) placed by admins.
-- Finds are tagged with the nearest landmark within 250 m at read time.

create table public.landmarks (
  id serial primary key,
  name text not null check (char_length(name) between 1 and 40),
  short text not null default '' check (char_length(short) <= 10),
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now()
);
alter table public.landmarks enable row level security;

create or replace function public.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql immutable as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

create or replace function public.near_label(plat double precision, plng double precision)
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(l.short, ''), l.name)
  from landmarks l
  where distance_m(plat, plng, l.lat, l.lng) <= 250
  order by distance_m(plat, plng, l.lat, l.lng)
  limit 1;
$$;

-- Landmarks + where the finds are clustering (counted finds per nearest landmark).
create or replace function public.landmarks_state()
returns json
language sql stable security definer set search_path = public as $$
  with lm as (select id, name, short, lat, lng from landmarks),
  tagged as (
    select near_label(f.lat, f.lng) near
    from finds f join scored_finds('infinity') s on s.find_id = f.id
  )
  select json_build_object(
    'landmarks', coalesce((select json_agg(lm order by lm.name) from lm), '[]'),
    'hotspots', coalesce((
      select json_agg(h order by h.finds desc) from (
        select near, count(*)::int finds from tagged where near is not null
        group by near order by count(*) desc limit 5
      ) h), '[]')
  );
$$;

-- Feed and map pins now say which landmark a find was near.
create or replace function public.feed(n int default 16)
returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(x order by x.created_at desc), '[]') from (
    select f.id, f.thumb_url, f.photo_url, f.species_id, f.status, f.created_at, f.captured_at,
           p.display_name player, p.emoji player_emoji, t.name team, t.emoji team_emoji,
           case when (select frozen_at from settings) is null then l.pts end pts,
           l.is_first, f.bounty_mult, near_label(f.lat, f.lng) near
    from finds f
    join players p on p.id = f.player_id
    left join teams t on t.id = p.team_id
    join scored_finds('infinity') l on l.find_id = f.id
    order by f.created_at desc
    limit least(n, 40)
  ) x;
$$;

create or replace function public.map_points()
returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
    'id', f.id, 'lat', round(f.lat::numeric, 6), 'lng', round(f.lng::numeric, 6),
    'species_id', f.species_id, 'player_id', f.player_id, 'thumb', f.thumb_url,
    'player', p.display_name, 'first', l.is_first, 'at', f.captured_at,
    'near', near_label(f.lat, f.lng))), '[]')
  from finds f
  join players p on p.id = f.player_id
  join scored_finds('infinity') l on l.find_id = f.id;
$$;

revoke all on function public.near_label(double precision, double precision) from public, anon, authenticated;
grant execute on function public.landmarks_state() to anon, authenticated;
grant execute on function public.feed(int) to anon, authenticated;
grant execute on function public.map_points() to anon, authenticated;
