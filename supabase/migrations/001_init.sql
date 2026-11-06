-- Canopy Quest schema. Every table has RLS on with no client policies:
-- browsers only read through the security-definer functions at the bottom,
-- and every write goes through the Vercel /api functions (service role).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- settings
create table public.settings (
  id int primary key default 1 check (id = 1),
  event_name text not null default 'Canopy Quest',
  starts_at timestamptz,
  ends_at timestamptz,
  geofence_on boolean not null default true,
  geofence_lat double precision not null default 12.72976,
  geofence_lng double precision not null default 77.70876,
  geofence_radius_m int not null default 600,
  max_accuracy_m int not null default 80,
  frozen_at timestamptz,          -- leaderboard hidden after this moment until revealed
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1);

-- ---------------------------------------------------------------- teams / players
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 24),
  code text not null unique,
  emoji text not null default '🌿',
  created_at timestamptz not null default now()
);
create unique index teams_name_ci on public.teams (lower(name));

create table public.players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 2 and 24),
  student_id text not null unique,
  pin_hash text not null,
  team_id uuid references public.teams on delete set null,
  role text not null default 'player' check (role in ('player', 'judge', 'admin')),
  emoji text not null default '🌱',
  failed_logins int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);
create index players_team on public.players (team_id);

-- ---------------------------------------------------------------- species
create table public.species (
  id serial primary key,
  common_name text not null,
  scientific_name text not null,
  match_names text[] not null default '{}',   -- extra accepted names; 'Genus *' = any species in genus
  kind text not null default 'tree' check (kind in ('tree', 'shrub', 'herb', 'palm', 'climber', 'grass')),
  rarity text not null default 'common' check (rarity in ('common', 'uncommon', 'rare', 'legendary')),
  points int not null default 10,
  emoji text not null default '🌿',
  hint text not null default '',
  fun_fact text not null default '',
  tags text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- finds
create table public.finds (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players on delete cascade,
  species_id int references public.species on delete set null,          -- final species
  claimed_species_id int references public.species on delete set null,  -- what the player picked
  photo_url text not null,
  thumb_url text not null,
  lat double precision not null,
  lng double precision not null,
  accuracy_m real,
  captured_at timestamptz not null,
  created_at timestamptz not null default now(),
  ai_name text,
  ai_common text,
  ai_score real,
  ai_match boolean,
  ai_raw jsonb,
  status text not null check (status in ('provisional', 'pending', 'approved', 'rejected')),
  flags text[] not null default '{}',
  phash text,
  bounty_mult real not null default 1,
  judged_by uuid references public.players on delete set null,
  judged_at timestamptz,
  judge_note text
);
create index finds_player on public.finds (player_id);
create index finds_species on public.finds (species_id);
create index finds_status on public.finds (status);
create index finds_created on public.finds (created_at desc);

-- ---------------------------------------------------------------- bounties
create table public.bounties (
  id serial primary key,
  species_id int not null references public.species on delete cascade,
  multiplier real not null default 2,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.settings enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.species enable row level security;
alter table public.finds enable row level security;
alter table public.bounties enable row level security;

-- ---------------------------------------------------------------- storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('finds', 'finds', true, 3145728, array['image/jpeg'])
on conflict (id) do nothing;

-- ================================================================ scoring
-- One row per counted find with its points. Counted = provisional or approved,
-- by a player (staff excluded), created before the cutoff (leaderboard freeze).
-- First Finder = earliest counted upload (server time) of that species campus-wide: +50%.
create or replace function public.scored_finds(cutoff timestamptz default 'infinity')
returns table (
  find_id uuid, player_id uuid, team_id uuid, species_id int,
  pts int, is_first boolean, captured_at timestamptz, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with c as (
    select f.id, f.player_id, p.team_id, f.species_id, f.captured_at, f.created_at,
           f.bounty_mult, s.points
    from finds f
    join species s on s.id = f.species_id
    join players p on p.id = f.player_id
    where f.status in ('provisional', 'approved')
      and p.role = 'player'
      and f.created_at <= cutoff
  ), firsts as (
    select distinct on (species_id) species_id, id
    from c order by species_id, created_at
  )
  select c.id, c.player_id, c.team_id, c.species_id,
         round(c.points * c.bounty_mult * case when fi.id is not null then 1.5 else 1 end)::int,
         fi.id is not null, c.captured_at, c.created_at
  from c left join firsts fi on fi.id = c.id;
$$;

-- ================================================================ public reads
-- Everything the phones and the projector poll. Small on purpose.
create or replace function public.game_state()
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  st settings;
  cutoff timestamptz;
  result json;
begin
  select * into st from settings where id = 1;
  cutoff := coalesce(st.frozen_at, 'infinity');

  with sf as (select * from scored_finds(cutoff)),
  per_player as (
    select player_id, species_id, max(pts) best, bool_or(is_first) first
    from sf group by 1, 2
  ),
  per_team as (
    select team_id, species_id, max(pts) best, bool_or(is_first) first
    from sf where team_id is not null group by 1, 2
  ),
  pl as (
    select p.id, p.display_name name, p.emoji, p.team_id,
           coalesce(sum(pp.best), 0)::int score,
           count(pp.species_id)::int species,
           count(*) filter (where pp.first)::int firsts
    from players p left join per_player pp on pp.player_id = p.id
    where p.role = 'player'
    group by p.id
  ),
  tm as (
    select t.id, t.name, t.emoji,
           (select count(*) from players p where p.team_id = t.id and p.role = 'player')::int members,
           coalesce(sum(pt.best), 0)::int score,
           count(pt.species_id)::int species,
           count(*) filter (where pt.first)::int firsts
    from teams t left join per_team pt on pt.team_id = t.id
    group by t.id
  ),
  live as (select * from scored_finds('infinity')),
  found_sp as (
    select l.species_id, count(distinct l.player_id)::int finders,
           (array_agg(p.display_name order by l.created_at))[1] first_name,
           (array_agg(t.name order by l.created_at))[1] first_team
    from live l join players p on p.id = l.player_id left join teams t on t.id = p.team_id
    group by l.species_id
  )
  select json_build_object(
    'now', now(),
    'settings', json_build_object(
      'event_name', st.event_name, 'starts_at', st.starts_at, 'ends_at', st.ends_at,
      'frozen', st.frozen_at is not null, 'frozen_at', st.frozen_at,
      'geofence_on', st.geofence_on, 'geofence_lat', st.geofence_lat,
      'geofence_lng', st.geofence_lng, 'geofence_radius_m', st.geofence_radius_m,
      'max_accuracy_m', st.max_accuracy_m),
    'players', coalesce((select json_agg(pl order by score desc, species desc, name) from pl), '[]'),
    'teams', coalesce((select json_agg(tm order by score desc, species desc, name) from tm), '[]'),
    'found', coalesce((select json_agg(found_sp) from found_sp), '[]'),
    'bounty', (select json_build_object('id', b.id, 'species_id', b.species_id,
                 'multiplier', b.multiplier, 'ends_at', b.ends_at)
               from bounties b where now() between b.starts_at and b.ends_at
               order by b.ends_at limit 1),
    'stats', json_build_object(
      'finds', (select count(*) from live),
      'pending', (select count(*) from finds where status = 'pending'),
      'players', (select count(*) from players where role = 'player'),
      'teams', (select count(*) from teams))
  ) into result;
  return result;
end $$;

create or replace function public.species_list()
returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(s order by s.points, s.common_name), '[]')
  from (select id, common_name, scientific_name, kind, rarity, points, emoji, hint,
               fun_fact, tags from species where active) s;
$$;

-- Latest finds for the live feed (counted ones; points hidden while frozen).
create or replace function public.feed(n int default 16)
returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(x order by x.created_at desc), '[]') from (
    select f.id, f.thumb_url, f.photo_url, f.species_id, f.status, f.created_at, f.captured_at,
           p.display_name player, p.emoji player_emoji, t.name team, t.emoji team_emoji,
           case when (select frozen_at from settings) is null then l.pts end pts,
           l.is_first, f.bounty_mult
    from finds f
    join players p on p.id = f.player_id
    left join teams t on t.id = p.team_id
    join scored_finds('infinity') l on l.find_id = f.id
    order by f.created_at desc
    limit least(n, 40)
  ) x;
$$;

-- Pins for the campus map.
create or replace function public.map_points()
returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
    'id', f.id, 'lat', round(f.lat::numeric, 6), 'lng', round(f.lng::numeric, 6),
    'species_id', f.species_id, 'player_id', f.player_id, 'thumb', f.thumb_url,
    'player', p.display_name, 'first', l.is_first, 'at', f.captured_at)), '[]')
  from finds f
  join players p on p.id = f.player_id
  join scored_finds('infinity') l on l.find_id = f.id;
$$;

-- One player's journal (their own finds, any status).
create or replace function public.my_finds(pid uuid)
returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(x order by x.created_at desc), '[]') from (
    select f.id, f.species_id, f.claimed_species_id, f.status, f.thumb_url, f.photo_url,
           f.lat, f.lng, f.accuracy_m, f.captured_at, f.created_at, f.ai_name, f.ai_common,
           f.ai_score, f.flags, f.judge_note, f.bounty_mult, l.pts, coalesce(l.is_first, false) is_first
    from finds f
    left join scored_finds('infinity') l on l.find_id = f.id
    where f.player_id = pid
  ) x;
$$;

revoke all on function public.scored_finds(timestamptz) from public, anon, authenticated;
grant execute on function public.game_state() to anon, authenticated;
grant execute on function public.species_list() to anon, authenticated;
grant execute on function public.feed(int) to anon, authenticated;
grant execute on function public.map_points() to anon, authenticated;
grant execute on function public.my_finds(uuid) to anon, authenticated;
