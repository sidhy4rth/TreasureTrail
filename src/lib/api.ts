import type { Player, Team } from './types';

const SB_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/** Public read-only RPC straight to Supabase (no server hop). */
export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const headers: Record<string, string> = { apikey: SB_KEY, 'Content-Type': 'application/json' };
  if (SB_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SB_KEY}`;
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`Couldn't load ${fn} (${r.status})`);
  return r.json() as Promise<T>;
}

// ------------------------------------------------------------------ session
export interface Session {
  token: string;
  player: Player;
  team: Team | null;
}

const KEY = 'cq.session.v1';

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session | null) {
  if (s) localStorage.setItem(KEY, JSON.stringify(s));
  else localStorage.removeItem(KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Calls our Vercel functions with the player's token. */
export async function api<T>(path: 'auth' | 'team' | 'submit' | 'judge' | 'admin', body?: unknown, method: 'POST' | 'GET' = 'POST'): Promise<T> {
  const s = loadSession();
  const headers: Record<string, string> = {};
  if (s?.token) headers.Authorization = `Bearer ${s.token}`;
  if (method === 'POST') headers['Content-Type'] = 'application/json';
  let r: Response;
  try {
    r = await fetch(`/api/${path}`, { method, headers, body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined });
  } catch {
    throw new ApiError(0, 'No connection. Check your internet and try again.');
  }
  let data: unknown = null;
  try {
    data = await r.json();
  } catch {
    /* non-JSON */
  }
  if (!r.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `Something went wrong (${r.status}).`;
    throw new ApiError(r.status, msg);
  }
  return data as T;
}
