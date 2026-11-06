import { distanceM } from './geo';
import type { MyFind, Species } from './types';

export interface Badge {
  id: string;
  emoji: string;
  name: string;
  how: string;
  earned: boolean;
}

/** Badges are bragging rights only: no points, worked out from your counted finds. */
export function computeBadges(finds: MyFind[], byId: Map<number, Species>): Badge[] {
  const counted = finds.filter((f) => (f.status === 'provisional' || f.status === 'approved') && f.species_id);
  const sp = counted.map((f) => byId.get(f.species_id!)).filter(Boolean) as Species[];
  const withTag = (t: string) => sp.filter((s) => s.tags.includes(t)).length;
  const times = counted.map((f) => new Date(f.created_at).getTime()).sort((a, b) => a - b);
  let speedRun = false;
  for (let i = 0; i + 2 < times.length; i++) if (times[i + 2] - times[i] <= 5 * 60_000) speedRun = true;
  let spread = 0;
  for (let i = 0; i < counted.length; i++)
    for (let j = i + 1; j < counted.length; j++)
      spread = Math.max(spread, distanceM(counted[i].lat, counted[i].lng, counted[j].lat, counted[j].lng));

  const b = (id: string, emoji: string, name: string, how: string, earned: boolean): Badge => ({ id, emoji, name, how, earned });
  return [
    b('sprout', '🌱', 'First Sprout', 'Log your first find', counted.length >= 1),
    b('ten', '🔟', 'Ten Down', '10 species in your journal', counted.length >= 10),
    b('trees', '🌳', 'Tree Hugger', 'Find 8 different trees', sp.filter((s) => s.kind === 'tree').length >= 8),
    b('herbal', '🌿', 'Herbalist', 'Find 4 medicinal plants', withTag('medicinal') >= 4),
    b('pollinator', '🦋', 'Pollinator Pal', 'Find 4 pollinator plants', withTag('pollinator') >= 4),
    b('native', '🏡', 'Homegrown', 'Find 6 native species', withTag('native') >= 6),
    b('invasive', '🚩', 'Invasion Spotter', 'Report 2 invasive species', withTag('invasive') >= 2),
    b('rare', '💠', 'Sharp Eye', 'Find a rare species', sp.some((s) => s.rarity === 'rare')),
    b('legend', '💎', 'Legend', 'Find a legendary species', sp.some((s) => s.rarity === 'legendary')),
    b('first', '🥇', 'Trailblazer', 'Be first on campus to find a species', counted.some((f) => f.is_first)),
    b('bounty', '🎯', 'Treasure Seeker', 'Snap a bounty species', counted.some((f) => f.bounty_mult > 1)),
    b('speed', '⚡', 'Speed Run', '3 finds within 5 minutes', speedRun),
    b('explorer', '🧭', 'Explorer', 'Finds 300 m apart', spread >= 300),
    b('sacred', '🪔', 'Temple Garden', 'Find 3 sacred plants', withTag('sacred') >= 3),
    b('fruit', '🍉', 'Fruit Basket', 'Find 4 fruit trees', withTag('fruit') >= 4),
    b('twenty', '🏆', 'Botanist', '20 species in your journal', counted.length >= 20),
  ];
}

export const TAG_LABEL: Record<string, string> = {
  native: '🏡 Native',
  medicinal: '🌿 Medicinal',
  pollinator: '🦋 Pollinator',
  invasive: '🚩 Invasive',
  fruit: '🍉 Fruit',
  sacred: '🪔 Sacred',
  shade: '⛱️ Shade',
};

export const RARITY_LABEL: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  legendary: 'Legendary',
};
