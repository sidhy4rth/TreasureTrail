-- AI kill switch: admins (or the "Sprig, go to sleep" phrase) can turn off the
-- plant-ID AI so every find goes to the judges. On by default.

alter table public.settings add column if not exists ai_enabled boolean not null default true;

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
      'max_accuracy_m', st.max_accuracy_m, 'ai_enabled', st.ai_enabled),
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

grant execute on function public.game_state() to anon, authenticated;
