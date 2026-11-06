import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import '../live.css';
import { rpc } from '../lib/api';
import { fmtCountdown, serverOffset, useGameState, useNow, usePoll, useSpecies } from '../lib/game';
import type { BoardPlayer, BoardTeam, FeedItem, GameState, MapPoint, Species } from '../lib/types';
import CampusMap from '../components/CampusMap';
import { useLandmarks } from '../lib/landmarks';
import { Elegant, burst, ordinal } from '../components/ui';

type Mode = 'teams' | 'solo';
const ROTATE_MS = 15000;
const ROW_STEP = 5.85; // em: row height + gap

interface Row {
  id: string;
  emoji: string;
  name: string;
  meta: string;
  score: number;
}

function teamRows(teams: BoardTeam[]): Row[] {
  return teams.slice(0, 8).map((t) => ({
    id: t.id,
    emoji: t.emoji,
    name: t.name,
    meta: `${t.members} ${t.members === 1 ? 'member' : 'members'} · ${t.species} species${t.firsts ? ` · ${t.firsts} first` : ''}`,
    score: t.score,
  }));
}

function soloRows(players: BoardPlayer[], teams: BoardTeam[]): Row[] {
  const tn = new Map(teams.map((t) => [t.id, t.name]));
  return players.slice(0, 8).map((p) => ({
    id: p.id,
    emoji: p.emoji,
    name: p.name,
    meta: `${p.team_id ? (tn.get(p.team_id) ?? 'Crew') : 'Solo'} · ${p.species} species${p.firsts ? ` · ${p.firsts} first` : ''}`,
    score: p.score,
  }));
}

// ------------------------------------------------------------------ leaderboard
function Board({ rows }: { rows: Row[] }) {
  // Keep DOM order stable (sorted by id) so rows slide when their rank changes.
  const prev = useRef<Map<string, number>>(new Map());
  const [bumped, setBumped] = useState<Set<string>>(new Set());
  const order = useMemo(() => [...rows].sort((a, b) => a.id.localeCompare(b.id)), [rows]);

  useEffect(() => {
    const b = new Set<string>();
    rows.forEach((r) => {
      const old = prev.current.get(r.id);
      if (old !== undefined && r.score > old) b.add(r.id);
    });
    prev.current = new Map(rows.map((r) => [r.id, r.score]));
    if (b.size) {
      setBumped(b);
      const t = setTimeout(() => setBumped(new Set()), 1000);
      return () => clearTimeout(t);
    }
  }, [rows]);

  const rank = new Map(rows.map((r, i) => [r.id, i]));
  return (
    <div className="lv-board">
      {order.map((r) => {
        const i = rank.get(r.id)!;
        return (
          <div
            key={r.id}
            className={`lv-row lv-r${i + 1} ${bumped.has(r.id) ? 'lv-bump' : ''}`}
            style={{ transform: `translateY(${i * ROW_STEP}em)` }}
          >
            <div className="lv-pos">{i + 1}</div>
            <div className="lv-em">{r.emoji}</div>
            <div style={{ minWidth: 0 }}>
              <div className="lv-name">{r.name}</div>
              <div className="lv-meta">{r.meta}</div>
            </div>
            <div className="lv-score">{r.score}</div>
          </div>
        );
      })}
    </div>
  );
}

function LeaderPanel({ state }: { state: GameState | null }) {
  const hasTeams = (state?.teams.length ?? 0) > 0;
  const [mode, setMode] = useState<Mode>('teams');
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setMode((m) => (m === 'teams' ? 'solo' : 'teams'));
      setCycle((c) => c + 1);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, []);

  const shown: Mode = hasTeams ? mode : 'solo';
  const frozen = state?.settings.frozen;
  const rows = state ? (shown === 'teams' ? teamRows(state.teams) : soloRows(state.players, state.teams)) : [];
  const anyScore = rows.some((r) => r.score > 0);

  return (
    <section className="lv-panel">
      <div className="lv-head">
        <div>
          <span className="lv-kicker">Live ranks</span>
          <h2>{shown === 'teams' ? 'Top crews' : 'Top explorers'}</h2>
        </div>
        {hasTeams && (
          <div className="lv-switch">
            <span className={shown === 'teams' ? 'on' : ''}>Crews</span>
            <span className={shown === 'solo' ? 'on' : ''}>Solo</span>
          </div>
        )}
      </div>
      {frozen ? (
        <div className="lv-frozen">
          <Elegant mood="think" size={120} className="bob" />
          <h3>Ranks frozen</h3>
          <p>Final results at the ceremony. Keep snapping.</p>
          <div className="lv-qmarks">
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n}>
                <span>{ordinal(n)}</span>
                <span>???</span>
              </div>
            ))}
          </div>
        </div>
      ) : rows.length === 0 || !anyScore ? (
        <div className="lv-empty">
          <div>
            <Elegant mood="wave" size={130} />
            <b>{rows.length === 0 ? 'Waiting for explorers to join…' : 'Waiting for the first find…'}</b>
            <br />
            Scan the QR code to play.
          </div>
        </div>
      ) : (
        <Board rows={rows} />
      )}
      {hasTeams && !frozen && <div key={cycle} className="lv-progress" style={{ animationDuration: `${ROTATE_MS}ms` }} />}
    </section>
  );
}

// ------------------------------------------------------------------ feed
function Feed({ items, byId, frozen }: { items: FeedItem[]; byId: Map<number, Species>; frozen: boolean }) {
  const seen = useRef<Set<string> | null>(null);
  const fresh = useMemo(() => {
    const f = new Set<string>();
    if (seen.current) items.forEach((i) => !seen.current!.has(i.id) && f.add(i.id));
    seen.current = new Set([...(seen.current ?? []), ...items.map((i) => i.id)]);
    return f;
  }, [items]);

  return (
    <section className="lv-panel">
      <div className="lv-head">
        <div>
          <span className="lv-kicker">Snap Nature</span>
          <h2>Just found</h2>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="lv-empty">
          <div>
            <Elegant mood="snap" size={120} className="bob" />
            <b>Waiting for the first find…</b>
          </div>
        </div>
      ) : (
        <div className="lv-feed">
          {items.slice(0, 8).map((f) => {
            const sp = byId.get(f.species_id);
            const legend = sp?.rarity === 'legendary';
            const who = f.team ? `${f.player} · ${f.team}` : f.player;
            return (
              <div key={f.id} className={`lv-card ${legend ? 'lv-legend' : ''} ${fresh.has(f.id) ? 'lv-new' : ''}`}>
                <img src={f.thumb_url} alt="" loading="lazy" decoding="async" />
                <div style={{ minWidth: 0 }}>
                  <div className="lv-cname">
                    {sp?.emoji ?? '🌿'} {sp?.common_name ?? 'A plant'}
                  </div>
                  <div className="lv-cwho">{who}{f.near ? ` · near ${f.near}` : ''}</div>
                  <div className="lv-cpts">
                    {!frozen && f.pts !== null && <span className="lv-chip pts">+{f.pts}</span>}
                    {legend && <span className="lv-chip gold">Legendary</span>}
                    {sp?.rarity === 'rare' && <span className="lv-chip rare">Rare</span>}
                    {f.bounty_mult > 1 && <span className="lv-chip bounty">Bounty ×{f.bounty_mult}</span>}
                  </div>
                </div>
                {f.is_first && <div className="lv-ribbon">FIRST</div>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ top bar bits
function Clock({ state }: { state: GameState | null }) {
  const now = useNow(1000) + serverOffset(state);
  const s = state?.settings;
  const start = s?.starts_at ? new Date(s.starts_at).getTime() : null;
  const end = s?.ends_at ? new Date(s.ends_at).getTime() : null;
  let label = 'Status';
  let value = 'Trail is live';
  let word = true;
  let urgent = false;
  if (start && now < start) {
    label = 'Trail opens in';
    value = fmtCountdown(start - now);
    word = false;
  } else if (end && now < end) {
    label = 'Trail is live · time left';
    value = fmtCountdown(end - now);
    word = false;
    urgent = end - now < 5 * 60_000;
  } else if (end && now >= end) {
    label = 'Status';
    value = 'Trail closed';
  }
  return (
    <div className={`lv-clock ${urgent ? 'lv-urgent' : ''}`}>
      <div className="lv-label">{label}</div>
      <div className={`lv-num ${word ? 'lv-word' : ''}`}>{value}</div>
    </div>
  );
}

function Qr() {
  const [src, setSrc] = useState('');
  const url = window.location.origin;
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: '#0B1A10', light: '#FFFFFF' } }).then(setSrc).catch(() => {});
  }, [url]);
  return (
    <div className="lv-qr">
      {src && <img src={src} alt="QR code to join" />}
      <div>
        <b>Scan to play</b>
        <span>{url.replace(/^https?:\/\//, '')}</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ bounty
function BountyBanner({ state, byId }: { state: GameState; byId: Map<number, Species> }) {
  const now = useNow(1000) + serverOffset(state);
  const b = state.bounty;
  if (!b) return null;
  const sp = byId.get(b.species_id);
  const left = new Date(b.ends_at).getTime() - now;
  if (left <= 0) return null;
  return (
    <div className="lv-bounty" key={b.id}>
      <div className="lv-bem">{sp?.emoji ?? '🎯'}</div>
      <div>
        <div className="lv-wanted">BOUNTY · {fmtCountdown(left)} LEFT</div>
        <div className="lv-bname">{sp?.common_name ?? 'Mystery plant'}</div>
        {sp?.hint && <div className="lv-bhint">“{sp.hint}”</div>}
      </div>
      <div className="lv-bx">
        <div className="lv-mult">×{b.multiplier}</div>
        <span>POINTS</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ ticker
function Ticker({ state, species, byId }: { state: GameState | null; species: Species[]; byId: Map<number, Species> }) {
  const found = state?.found ?? [];
  const foundSp = found.map((f) => byId.get(f.species_id)).filter(Boolean) as Species[];
  const count = (t: string) => foundSp.filter((s) => s.tags.includes(t)).length;
  const items: string[] = [];
  if (foundSp.length) {
    items.push(`<i>/</i><b>${foundSp.length}</b> of ${species.length} species snapped so far`);
    items.push(`<i>/</i><b>${count('native')}</b> native species found`);
    items.push(`<i>/</i><b>${count('pollinator')}</b> pollinator plants mapped`);
    items.push(`<i>/</i><b>${count('medicinal')}</b> medicinal plants logged`);
    items.push(`<i>/</i><b>${count('invasive')}</b> invasive species reported`);
  }
  const pool = foundSp.length ? foundSp : species;
  // A stable rotation of facts (recent discoveries first).
  const facts = [...pool].reverse().slice(0, 14);
  for (const s of facts) if (s.fun_fact) items.push(`<i>/</i>${s.emoji} <b>${escapeHtml(s.common_name)}.</b> ${escapeHtml(s.fun_fact)}`);
  if (!items.length) items.push('<i>/</i>Leave the class. Discover the biodiversity along campus. Snap it.');
  const html = items.map((i) => `<span>${i}</span>`).join('');
  const chars = items.join('').length;
  return (
    <footer className="lv-ticker">
      <div className="lv-tlabel">DID YOU KNOW</div>
      <div className="lv-track" style={{ animationDuration: `${Math.max(40, chars / 6)}s` }} dangerouslySetInnerHTML={{ __html: html + html }} />
    </footer>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// ------------------------------------------------------------------ celebrations
interface Cheer {
  key: string;
  emoji: string;
  text: string;
}

function useCelebrations(items: FeedItem[] | null, byId: Map<number, Species>) {
  const seen = useRef<Set<string> | null>(null);
  const [queue, setQueue] = useState<Cheer[]>([]);
  const [current, setCurrent] = useState<Cheer | null>(null);

  useEffect(() => {
    if (!items || byId.size === 0) return;
    if (!seen.current) {
      seen.current = new Set(items.map((i) => i.id));
      return;
    }
    const add: Cheer[] = [];
    for (const f of [...items].reverse()) {
      if (seen.current.has(f.id)) continue;
      seen.current.add(f.id);
      const sp = byId.get(f.species_id);
      const who = f.team ? `Crew ${f.team}` : f.player;
      if (sp?.rarity === 'legendary') {
        add.push({ key: f.id, emoji: '✨', text: `LEGENDARY! ${who} found ${f.is_first ? 'the first ' : 'a '}${sp.common_name}!` });
      } else if (f.is_first && sp) {
        add.push({ key: f.id, emoji: '🥇', text: `${who} found the first ${sp.common_name}!` });
      } else if (f.bounty_mult > 1 && sp) {
        add.push({ key: f.id, emoji: '🎯', text: `Bounty caught! ${who} bagged the ${sp.common_name}.` });
      }
    }
    if (add.length) setQueue((q) => [...q, ...add].slice(-6));
  }, [items, byId]);

  useEffect(() => {
    if (current || queue.length === 0) return;
    const [next, ...rest] = queue;
    setCurrent(next);
    setQueue(rest);
    burst(next.emoji === '✨' ? 'legendary' : 'big');
    const t = setTimeout(() => setCurrent(null), 3600);
    return () => clearTimeout(t);
  }, [queue, current]);

  return current;
}

// ------------------------------------------------------------------ reveal
function Reveal({ state, onDone }: { state: GameState; onDone: () => void }) {
  // Snapshot the standings once so polling can't reshuffle the reveal mid-way.
  const [{ useTeams, list }] = useState(() => {
    const teams = state.teams.some((t) => t.score > 0);
    return {
      useTeams: teams,
      list: teams
        ? state.teams.slice(0, 5).map((t) => ({ id: t.id, emoji: t.emoji, name: t.name, score: t.score }))
        : state.players.slice(0, 5).map((p) => ({ id: p.id, emoji: p.emoji, name: p.name, score: p.score })),
    };
  });
  const [shown, setShown] = useState(0); // how many revealed, counting up from the bottom
  const total = list.length;

  useEffect(() => {
    if (total === 0) {
      const t = setTimeout(onDone, 2500);
      return () => clearTimeout(t);
    }
    if (shown < total) {
      const t = setTimeout(() => setShown((s) => s + 1), shown === 0 ? 2500 : shown === total - 1 ? 3200 : 2000);
      return () => clearTimeout(t);
    }
    burst('legendary');
    const t1 = setTimeout(() => burst('legendary'), 1500);
    const t2 = setTimeout(onDone, 9000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [shown, total, onDone]);

  // list[0] is 1st place. Reveal from last to first.
  const revealed = list.slice(total - shown).reverse(); // e.g. [5th, 4th, ...]
  return (
    <div className="lv-reveal" onClick={onDone}>
      <div className="lv-kicker">LEAVE THE CLASS · TREASURE TRAIL</div>
      <h2>{useTeams ? 'Final crew standings' : 'Final standings'}</h2>
      {shown < total && <div className="lv-drum">DRUMROLL…</div>}
      <div className="lv-rlist">
        {revealed.map((r) => {
          const pos = list.findIndex((x) => x.id === r.id) + 1;
          return (
            <div key={r.id} className={`lv-rcard ${pos === 1 ? 'lv-champ' : ''}`}>
              <div className="lv-rpos">{ordinal(pos)}</div>
              <div className="lv-rem">{r.emoji}</div>
              <div className="lv-rname">{r.name}</div>
              <div className="lv-rscore">{r.score}</div>
            </div>
          );
        })}
      </div>
      {total === 0 && <div className="lv-drum">No scores yet</div>}
    </div>
  );
}

// ------------------------------------------------------------------ page
export default function Live() {
  const { data: state } = useGameState(4000);
  const { data: feed } = usePoll(() => rpc<FeedItem[]>('feed', { n: 14 }), 4000);
  const { data: points } = usePoll(() => rpc<MapPoint[]>('map_points'), 25000);
  const { data: lm } = useLandmarks(25000);
  const { list: species, byId } = useSpecies();
  const cheer = useCelebrations(feed, byId);
  const [revealing, setRevealing] = useState(false);
  const endReveal = useCallback(() => setRevealing(false), []);
  const wasFrozen = useRef<boolean | null>(null);

  useEffect(() => {
    document.title = 'TREASURE TRAIL · Live';
  }, []);

  useEffect(() => {
    if (!state) return;
    const f = state.settings.frozen;
    if (wasFrozen.current === true && !f) setRevealing(true);
    wasFrozen.current = f;
  }, [state]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.();
      }
      if ((e.key === 'r' || e.key === 'R') && state && !state.settings.frozen) setRevealing(true);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [state]);

  const s = state?.settings;
  const center: [number, number] = s ? [s.geofence_lat, s.geofence_lng] : [12.72976, 77.70876];
  const foundCount = state?.found.length ?? 0;

  return (
    <div className="lv-root">
      <header className="lv-top">
        <div className="lv-brand">
          <div className="lv-mark">
            <Elegant mood="wave" size={62} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="lv-kicker">Leave the Class</div>
            <div className="lv-titlerow">
              <h1>{s?.event_name && s.event_name !== 'Canopy Quest' ? s.event_name.toUpperCase() : 'TREASURE TRAIL'}</h1>
              <span className="lv-live"><i />LIVE</span>
            </div>
            <div className="lv-sub">Leave the class. Discover the biodiversity along campus. Snap it.</div>
          </div>
        </div>
        <div className="lv-stats">
          <div className="lv-stat">
            <b>
              {foundCount}
              <small>/{species.length || '—'}</small>
            </b>
            <span>Species</span>
          </div>
          <div className="lv-stat">
            <b>{state?.stats.finds ?? 0}</b>
            <span>Finds</span>
          </div>
          <div className="lv-stat">
            <b>{state?.stats.players ?? 0}</b>
            <span>Explorers</span>
          </div>
          <div className="lv-stat">
            <b>{state?.stats.teams ?? 0}</b>
            <span>Crews</span>
          </div>
        </div>
        <Clock state={state} />
        <Qr />
      </header>

      <main className="lv-main">
        <LeaderPanel state={state} />
        <div className="lv-mapwrap">
          {s && (
            <CampusMap
              key={`${s.geofence_lat},${s.geofence_lng}`}
              center={center}
              radius={s.geofence_on ? s.geofence_radius_m : undefined}
              points={points ?? []}
              byId={byId}
              zoom={17}
              interactive={false}
              className="lv-map"
              landmarks={lm?.landmarks}
              bigLabels
            />
          )}
          {state && <BountyBanner state={state} byId={byId} />}
          <div className="lv-maptag">
            <b>{points?.length ?? 0}</b> geotagged finds
            {lm && lm.hotspots[0] ? (
              <>
                {' · hotspot '}
                <b>{lm.hotspots[0].near}</b> ({lm.hotspots[0].finds})
              </>
            ) : null}
          </div>
          {cheer && (
            <div className="lv-celebrate" key={cheer.key}>
              <Elegant mood="cheer" size={90} />
              <span>{cheer.text}</span>
            </div>
          )}
        </div>
        <Feed items={feed ?? []} byId={byId} frozen={!!s?.frozen} />
      </main>

      <Ticker state={state} species={species} byId={byId} />
      <div className="lv-hint">F fullscreen · R replay reveal</div>
      {revealing && state && <Reveal state={state} onDone={endReveal} />}
    </div>
  );
}
