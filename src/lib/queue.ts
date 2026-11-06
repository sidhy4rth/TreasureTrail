// Finds that couldn't upload (no signal) wait here, with the GPS + time from
// the moment they were taken, and retry automatically.
import { get, set } from 'idb-keyval';
import { api, ApiError } from './api';
import type { MyFind, Species } from './types';

export interface SubmitBody {
  speciesId: number | null;
  lat: number;
  lng: number;
  accuracy: number;
  capturedAt: string;
  phash: string;
  image: string;
  thumb: string;
}

export interface SubmitResult {
  find: MyFind | null;
  species: Species | null;
  status: MyFind['status'];
  flags: string[];
  ai: { name: string | null; common: string | null; score: number | null; match: boolean | null };
  bounty_mult: number;
}

export interface Queued {
  id: string;
  label: string;
  queuedAt: number;
  body: SubmitBody;
}

const KEY = 'cq.queue.v1';

export async function listQueue(): Promise<Queued[]> {
  try {
    return ((await get(KEY)) as Queued[] | undefined) ?? [];
  } catch {
    return [];
  }
}

export async function enqueue(body: SubmitBody, label: string) {
  const list = await listQueue();
  list.push({ id: crypto.randomUUID(), label, queuedAt: Date.now(), body });
  await set(KEY, list);
}

/** Network-ish failures worth retrying later. */
export const retryable = (e: unknown) => e instanceof ApiError && (e.status === 0 || e.status >= 500 || e.status === 429);

let flushing = false;

/** Sends queued finds. Returns what happened to each, in order. */
export async function flushQueue(): Promise<{ label: string; ok: boolean; result?: SubmitResult; error?: string }[]> {
  if (flushing) return [];
  flushing = true;
  const out: { label: string; ok: boolean; result?: SubmitResult; error?: string }[] = [];
  try {
    const list = await listQueue();
    const keep: Queued[] = [];
    for (const q of list) {
      try {
        const result = await api<SubmitResult>('submit', q.body);
        out.push({ label: q.label, ok: true, result });
      } catch (e) {
        if (retryable(e)) keep.push(q);
        else out.push({ label: q.label, ok: false, error: (e as Error).message });
      }
    }
    // Keep anything queued while we were sending.
    const seen = new Set(list.map((q) => q.id));
    const latest = await listQueue();
    await set(KEY, [...keep, ...latest.filter((q) => !seen.has(q.id))]);
  } finally {
    flushing = false;
  }
  return out;
}
