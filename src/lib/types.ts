export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type Role = 'player' | 'judge' | 'admin';
export type FindStatus = 'provisional' | 'pending' | 'approved' | 'rejected';

export interface Species {
  id: number;
  common_name: string;
  scientific_name: string;
  kind: string;
  rarity: Rarity;
  points: number;
  emoji: string;
  hint: string;
  fun_fact: string;
  tags: string[];
}

export interface Player {
  id: string;
  display_name: string;
  student_id: string;
  team_id: string | null;
  role: Role;
  emoji: string;
}

export interface Team {
  id: string;
  name: string;
  code: string;
  emoji: string;
  members: { id: string; display_name: string; emoji: string }[];
}

export interface Settings {
  event_name: string;
  starts_at: string | null;
  ends_at: string | null;
  frozen: boolean;
  ai_enabled?: boolean;
  frozen_at: string | null;
  geofence_on: boolean;
  geofence_lat: number;
  geofence_lng: number;
  geofence_radius_m: number;
  max_accuracy_m: number;
}

export interface BoardPlayer {
  id: string;
  name: string;
  emoji: string;
  team_id: string | null;
  score: number;
  species: number;
  firsts: number;
}

export interface BoardTeam {
  id: string;
  name: string;
  emoji: string;
  members: number;
  score: number;
  species: number;
  firsts: number;
}

export interface FoundSpecies {
  species_id: number;
  finders: number;
  first_name: string;
  first_team: string | null;
}

export interface Bounty {
  id: number;
  species_id: number;
  multiplier: number;
  ends_at: string;
}

export interface GameState {
  now: string;
  settings: Settings;
  players: BoardPlayer[];
  teams: BoardTeam[];
  found: FoundSpecies[];
  bounty: Bounty | null;
  stats: { finds: number; pending: number; players: number; teams: number };
}

export interface MyFind {
  id: string;
  species_id: number | null;
  claimed_species_id: number | null;
  status: FindStatus;
  thumb_url: string;
  photo_url: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  captured_at: string;
  created_at: string;
  ai_name: string | null;
  ai_common: string | null;
  ai_score: number | null;
  flags: string[];
  judge_note: string | null;
  bounty_mult: number;
  pts: number | null;
  is_first: boolean;
}

export interface FeedItem {
  id: string;
  thumb_url: string;
  photo_url: string;
  species_id: number;
  status: FindStatus;
  created_at: string;
  captured_at: string;
  player: string;
  player_emoji: string;
  team: string | null;
  team_emoji: string | null;
  pts: number | null;
  is_first: boolean;
  bounty_mult: number;
  near?: string | null;
}

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  species_id: number;
  player_id: string;
  thumb: string;
  player: string;
  first: boolean;
  at: string;
  near?: string | null;
}
