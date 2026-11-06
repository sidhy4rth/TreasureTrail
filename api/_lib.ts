import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

// ------------------------------------------------------------------ env + client
function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

let client: SupabaseClient | null = null;
export function db(): SupabaseClient {
  if (!client) {
    client = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

// ------------------------------------------------------------------ errors + routing
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;

/** Wraps a handler: method check, JSON body guard, HttpError → JSON, anything else → 500. */
export function route(methods: string[], fn: Handler) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!methods.includes(req.method ?? '')) fail(405, 'Method not allowed');
      if (req.method === 'POST' && (typeof req.body !== 'object' || req.body === null)) {
        fail(400, 'Expected a JSON body');
      }
      const out = await fn(req, res);
      if (!res.headersSent) res.status(200).json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) {
        if (!res.headersSent) res.status(e.status).json({ error: e.message });
        return;
      }
      console.error(e);
      if (!res.headersSent) res.status(500).json({ error: 'Something broke on our side. Try again in a moment.' });
    }
  };
}

/** Throws a 500-style error when a Supabase call failed. */
export function check<T>(r: { data: T; error: { message: string } | null }, what: string): T {
  if (r.error) {
    console.error(`${what}:`, r.error);
    throw new Error(`${what}: ${r.error.message}`);
  }
  return r.data;
}

// ------------------------------------------------------------------ body helpers
export function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function cleanName(v: unknown, what = 'Name'): string {
  const s = str(v).replace(/\s+/g, ' ');
  if ([...s].length < 2 || [...s].length > 24) fail(422, `${what} must be 2–24 characters.`);
  return s;
}

export function cleanEmoji(v: unknown, fallback: string): string {
  const s = str(v);
  if (!s) return fallback;
  if ([...s].length > 8) fail(422, 'Pick a single emoji.');
  return s;
}

export function cleanPin(v: unknown): string {
  const s = typeof v === 'number' ? String(v).padStart(4, '0') : str(v);
  if (!/^\d{4}$/.test(s)) fail(422, 'PIN must be exactly 4 digits.');
  return s;
}

export function normStudentId(v: unknown): string {
  const s = str(v).toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9\-/]{3,20}$/.test(s)) fail(422, 'Enter your student ID (3–20 letters or numbers).');
  return s;
}

// ------------------------------------------------------------------ tokens
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const b64url = (b: Buffer) => b.toString('base64url');

function sign(payload: string): Buffer {
  return crypto.createHmac('sha256', env('SESSION_SECRET')).update(payload).digest();
}

export function makeToken(pid: string): string {
  const payload = b64url(Buffer.from(JSON.stringify({ pid, iat: Date.now() })));
  return `${payload}.${b64url(sign(payload))}`;
}

export function readToken(token: string): string | null {
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return null;
  const expected = sign(payload);
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const { pid, iat } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof pid !== 'string' || typeof iat !== 'number') return null;
    if (Date.now() - iat > TOKEN_TTL_MS) return null;
    return pid;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ players
export type Role = 'player' | 'judge' | 'admin';

export interface PlayerRow {
  id: string;
  display_name: string;
  student_id: string;
  pin_hash: string;
  team_id: string | null;
  role: Role;
  emoji: string;
  failed_logins: number;
  locked_until: string | null;
  created_at: string;
}

export function publicPlayer(p: PlayerRow) {
  return {
    id: p.id,
    display_name: p.display_name,
    student_id: p.student_id,
    team_id: p.team_id,
    role: p.role,
    emoji: p.emoji,
  };
}

export async function requirePlayer(req: VercelRequest, roles?: Role[]): Promise<PlayerRow> {
  const h = req.headers.authorization ?? '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  const pid = token ? readToken(token) : null;
  if (!pid) fail(401, 'Your session expired. Log in again.');
  const r = await db().from('players').select('*').eq('id', pid).maybeSingle();
  const p = check(r, 'load player') as PlayerRow | null;
  if (!p) fail(401, 'Your session expired. Log in again.');
  if (roles && !roles.includes(p.role)) fail(403, 'Only organisers can do that.');
  return p;
}

export const isStaff = (p: PlayerRow) => p.role === 'judge' || p.role === 'admin';

// ------------------------------------------------------------------ PINs
function scrypt(pin: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    crypto.scrypt(pin, salt, 32, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pin, salt);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [kind, saltB64, hashB64] = stored.split('$');
  if (kind !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const key = await scrypt(pin, Buffer.from(saltB64, 'base64'));
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

// ------------------------------------------------------------------ geo
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ------------------------------------------------------------------ teams
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function teamCode(): string {
  const bytes = crypto.randomBytes(5);
  let out = '';
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

export async function teamDetails(teamId: string | null) {
  if (!teamId) return null;
  const t = check(await db().from('teams').select('id, name, code, emoji').eq('id', teamId).maybeSingle(), 'load team');
  if (!t) return null;
  const members = check(
    await db()
      .from('players')
      .select('id, display_name, emoji')
      .eq('team_id', teamId)
      .order('created_at'),
    'load members',
  );
  return { ...t, members: members ?? [] };
}

// ------------------------------------------------------------------ settings
export interface Settings {
  id: number;
  event_name: string;
  starts_at: string | null;
  ends_at: string | null;
  geofence_on: boolean;
  geofence_lat: number;
  geofence_lng: number;
  geofence_radius_m: number;
  max_accuracy_m: number;
  frozen_at: string | null;
  ai_enabled?: boolean;
  updated_at: string;
}

export async function getSettings(): Promise<Settings> {
  const s = check(await db().from('settings').select('*').eq('id', 1).single(), 'load settings');
  return s as Settings;
}

// ------------------------------------------------------------------ species
export interface SpeciesRow {
  id: number;
  common_name: string;
  scientific_name: string;
  match_names: string[];
  kind: string;
  rarity: string;
  points: number;
  emoji: string;
  hint: string;
  fun_fact: string;
  tags: string[];
  active: boolean;
}

export const RARITY_POINTS: Record<string, number> = { common: 10, uncommon: 20, rare: 40, legendary: 80 };

// ------------------------------------------------------------------ landmarks
export interface Landmark {
  id: number;
  name: string;
  short: string;
  lat: number;
  lng: number;
}

export async function loadLandmarks(): Promise<Landmark[]> {
  return check(await db().from('landmarks').select('id, name, short, lat, lng'), 'load landmarks') as Landmark[];
}

/** Label of the closest landmark within 250 m, or null. */
export function nearLabel(lms: Landmark[], lat: number, lng: number): string | null {
  let best: Landmark | null = null;
  let bestD = 250;
  for (const l of lms) {
    const d = distanceM(lat, lng, l.lat, l.lng);
    if (d <= bestD) {
      best = l;
      bestD = d;
    }
  }
  return best ? best.short || best.name : null;
}
