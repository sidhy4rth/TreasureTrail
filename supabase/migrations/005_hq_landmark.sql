-- Featured landmarks (the CoE headquarters) get a bigger, highlighted signboard,
-- and landmark names may be longer so the full name fits.

alter table public.landmarks add column if not exists featured boolean not null default false;
alter table public.landmarks drop constraint if exists landmarks_name_check;
alter table public.landmarks add constraint landmarks_name_check check (char_length(name) between 1 and 80);
alter table public.landmarks drop constraint if exists landmarks_short_check;
alter table public.landmarks add constraint landmarks_short_check check (char_length(short) <= 16);

create or replace function public.landmarks_state()
returns json
language sql stable security definer set search_path = public as $$
  with lm as (select id, name, short, lat, lng, featured from landmarks),
  tagged as (
    select near_label(f.lat, f.lng) near
    from finds f join scored_finds('infinity') s on s.find_id = f.id
  )
  select json_build_object(
    'landmarks', coalesce((select json_agg(lm order by lm.featured desc, lm.name) from lm), '[]'),
    'hotspots', coalesce((
      select json_agg(h order by h.finds desc) from (
        select near, count(*)::int finds from tagged where near is not null
        group by near order by count(*) desc limit 5
      ) h), '[]')
  );
$$;
grant execute on function public.landmarks_state() to anon, authenticated;

-- Headquarters of the Center of Excellence for Nature Based Solutions, room AB 001
-- (pin from the organisers' Google Maps link, 6 Nov 2026).
insert into public.landmarks (name, short, lat, lng, featured)
select 'Center of Excellence · Nature Based Solutions', 'AB 001', 12.7276135, 77.7087205, true
where not exists (select 1 from public.landmarks where short = 'AB 001');
