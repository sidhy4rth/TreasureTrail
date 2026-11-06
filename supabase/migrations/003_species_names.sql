-- Name fixes from testing every species against Pl@ntNet with reference photos (6 Nov 2026).

-- The AI often calls Bengaluru's pink trumpet trees Tabebuia pallida / heterophylla.
update public.species
set match_names = array(select distinct unnest(match_names || array['Tabebuia pallida', 'Tabebuia heterophylla']))
where scientific_name = 'Tabebuia rosea';

-- Areca palm was moved to Chrysalidocarpus by botanists; accept both names.
update public.species
set match_names = array(select distinct unnest(match_names || array['Chrysalidocarpus lutescens']))
where scientific_name = 'Dypsis lutescens';

-- Golden trumpet: older name still used by some sources.
update public.species
set match_names = array(select distinct unnest(match_names || array['Tabebuia chrysotricha']))
where scientific_name = 'Handroanthus chrysotrichus';

-- Very common campus fig the AI kept finding where people expect "banyan": its own species.
insert into public.species (common_name, scientific_name, match_names, kind, rarity, points, emoji, hint, fun_fact, tags)
select 'Indian laurel fig', 'Ficus microcarpa', '{Ficus retusa}', 'tree', 'common', 10, '🌲',
       'Small glossy oval leaves, a dense rounded crown, and thin roots dangling like a beard.',
       'Often called the Chinese banyan. It is so tough that it is a favourite for bonsai and roadside hedges.',
       '{shade}'
where not exists (select 1 from public.species where scientific_name = 'Ficus microcarpa');
