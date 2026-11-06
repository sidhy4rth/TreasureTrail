-- Simpler scoring (organisers' call, 6 Nov 2026): three tiers instead of four.
-- Uncommon folds into Common. Common 10 · Rare 25 · Legendary 50.
-- First on campus +50% and bounties are unchanged. Scores are computed live
-- from species.points, so every existing find re-scores automatically.
update public.species set rarity = 'common' where rarity = 'uncommon';
update public.species set points = case rarity
  when 'common' then 10 when 'rare' then 25 when 'legendary' then 50 else points end;
