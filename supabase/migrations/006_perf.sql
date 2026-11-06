-- Performance for event-day load.
-- 1. An index for "is this the first counted find of this species?" lookups.
-- 2. scored_finds breaks First Finder ties by id, so it's deterministic.
-- 3. my_finds only touches the asking player's rows instead of scoring every find.

create index if not exists finds_counted_species_order
  on public.finds (species_id, created_at, id)
  where status in ('provisional', 'approved');

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
    from c order by species_id, created_at, id
  )
  select c.id, c.player_id, c.team_id, c.species_id,
         round(c.points * c.bounty_mult * case when fi.id is not null then 1.5 else 1 end)::int,
         fi.id is not null, c.captured_at, c.created_at
  from c left join firsts fi on fi.id = c.id;
$$;
revoke all on function public.scored_finds(timestamptz) from public, anon, authenticated;

create or replace function public.my_finds(pid uuid)
returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(x order by x.created_at desc), '[]') from (
    select f.id, f.species_id, f.claimed_species_id, f.status, f.thumb_url, f.photo_url,
           f.lat, f.lng, f.accuracy_m, f.captured_at, f.created_at, f.ai_name, f.ai_common,
           f.ai_score, f.flags, f.judge_note, f.bounty_mult,
           case when k.counted
                then round(s.points * f.bounty_mult * case when k.first then 1.5 else 1 end)::int
           end pts,
           coalesce(k.counted and k.first, false) is_first
    from finds f
    join players me on me.id = f.player_id
    left join species s on s.id = f.species_id
    cross join lateral (
      select (f.status in ('provisional', 'approved') and s.id is not null and me.role = 'player') counted,
             not exists (
               select 1
               from finds f2
               join players p2 on p2.id = f2.player_id
               where f2.species_id = f.species_id
                 and f2.status in ('provisional', 'approved')
                 and p2.role = 'player'
                 and (f2.created_at, f2.id) < (f.created_at, f.id)
             ) first
    ) k
    where f.player_id = pid
  ) x;
$$;
grant execute on function public.my_finds(uuid) to anon, authenticated;
