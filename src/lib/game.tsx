import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, loadSession, rpc, saveSession, type Session } from './api';
import type { GameState, MyFind, Species } from './types';

// ------------------------------------------------------------------ session context
interface SessionCtx {
  session: Session | null;
  setSession: (s: Session | null) => void;
  refreshMe: () => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<SessionCtx>(null as unknown as SessionCtx);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setState] = useState<Session | null>(() => loadSession());

  const setSession = useCallback((s: Session | null) => {
    saveSession(s);
    setState(s);
  }, []);

  const refreshMe = useCallback(async () => {
    const cur = loadSession();
    if (!cur) return;
    try {
      const me = await api<Pick<Session, 'player' | 'team'>>('auth', { action: 'me' });
      setSession({ ...cur, ...me });
    } catch (e) {
      if ((e as { status?: number }).status === 401) setSession(null);
    }
  }, [setSession]);

  const logout = useCallback(() => setSession(null), [setSession]);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  return <Ctx.Provider value={{ session, setSession, refreshMe, logout }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);

// ------------------------------------------------------------------ polling
/** Polls fn every `ms` while the tab is visible. */
export function usePoll<T>(fn: () => Promise<T>, ms: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const lastJson = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await fnRef.current();
      // Most polls return exactly what we already have: skip the re-render.
      let json: string | null = null;
      try {
        json = JSON.stringify(next);
      } catch {
        /* not serialisable: always update */
      }
      if (json === null || json !== lastJson.current) {
        lastJson.current = json;
        setData(next);
      }
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!alive) return;
      if (document.visibilityState === 'visible') await load();
      if (alive) t = setTimeout(tick, ms);
    };
    void tick();
    const onVis = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      clearTimeout(t);
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, load, ...deps]);

  return { data, error, reload: load };
}

export const useGameState = (ms = 10000) => usePoll(() => rpc<GameState>('game_state'), ms);

export function useMyFinds(pid: string | undefined, ms = 15000) {
  return usePoll(() => (pid ? rpc<MyFind[]>('my_finds', { pid }) : Promise.resolve([] as MyFind[])), ms, [pid]);
}

// ------------------------------------------------------------------ species (cached)
let speciesCache: Species[] | null = null;
let speciesPromise: Promise<Species[]> | null = null;

export function fetchSpecies(force = false): Promise<Species[]> {
  if (speciesCache && !force) return Promise.resolve(speciesCache);
  if (!speciesPromise || force) {
    speciesPromise = rpc<Species[]>('species_list').then((s) => {
      speciesCache = s;
      return s;
    }).finally(() => {
      speciesPromise = null;
    });
  }
  return speciesPromise;
}

export function useSpecies() {
  const [list, setList] = useState<Species[]>(speciesCache ?? []);
  useEffect(() => {
    let alive = true;
    fetchSpecies().then((s) => alive && setList(s)).catch(() => {});
    const t = setInterval(() => fetchSpecies(true).then((s) => alive && setList(s)).catch(() => {}), 120000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  const byId = useMemo(() => new Map(list.map((s) => [s.id, s])), [list]);
  return { list, byId };
}

// ------------------------------------------------------------------ helpers
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Server clock offset so countdowns agree with the database. */
export function serverOffset(state: GameState | null) {
  return state ? new Date(state.now).getTime() - Date.now() : 0;
}

export function fmtCountdown(ms: number) {
  if (ms <= 0) return '0:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}
