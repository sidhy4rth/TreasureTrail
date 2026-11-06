import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import '../staff.css';
import { api, type Session } from '../lib/api';
import { timeAgo, useNow, usePoll, useSession, useSpecies } from '../lib/game';
import type { Player, Role } from '../lib/types';
import { Elegant, Logo, Sheet, Spinner, toast } from '../components/ui';

// ------------------------------------------------------------------ staff gate (shared with /admin)
export function StaffGate({ roles, title, children }: { roles: Role[]; title: string; children: ReactNode }) {
  const { session, setSession, logout } = useSession();
  const [studentId, setStudentId] = useState('');
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (session && roles.includes(session.player.role)) return <>{children}</>;

  const login = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<Session>('auth', { action: 'login', studentId, pin });
      setSession(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const promote = async () => {
    if (!session) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ player: Player }>('auth', { action: 'promote', code: code.trim() });
      setSession({ ...session, player: r.player });
      if (!roles.includes(r.player.role)) setErr(`That code makes you a ${r.player.role}. This page needs ${roles.join(' or ')}.`);
      else toast(`You're now a ${r.player.role}.`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="st-wrap narrow" style={{ paddingTop: '2.5rem' }}>
      <div className="card stack">
        <div className="row">
          <Logo size={40} />
          <div>
            <div className="st-kicker">TREASURE TRAIL · staff</div>
            <h2>{title}</h2>
            <div className="muted small">Organisers and judges only</div>
          </div>
        </div>
        {!session ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void login();
            }}
          >
            <div className="field">
              <label htmlFor="sg-id">Student / staff ID</label>
              <input id="sg-id" className="input" value={studentId} onChange={(e) => setStudentId(e.target.value)} autoComplete="username" />
            </div>
            <div className="field">
              <label htmlFor="sg-pin">4-digit PIN</label>
              <input
                id="sg-pin"
                className="input pin"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                autoComplete="current-password"
                type="password"
              />
            </div>
            {err && <div className="error">{err}</div>}
            <button className="btn block" disabled={busy || !studentId || pin.length !== 4}>
              {busy ? 'Logging in…' : 'Log in'}
            </button>
            <div className="small muted center">
              New here? <Link to="/join">Join first</Link>, then come back with your staff code.
            </div>
          </form>
        ) : (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void promote();
            }}
          >
            <div className="notice">
              Logged in as {session.player.emoji} {session.player.display_name} ({session.player.role}). Enter your staff code to unlock this page.
            </div>
            <div className="field">
              <label htmlFor="sg-code">Staff code</label>
              <input id="sg-code" className="input" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" placeholder="JUDGE-…" />
            </div>
            {err && <div className="error">{err}</div>}
            <button className="btn block" disabled={busy || !code.trim()}>
              {busy ? 'Checking…' : 'Unlock'}
            </button>
            <button type="button" className="btn ghost block" onClick={logout}>
              Log out
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ judge queue
interface JudgeItem {
  id: string;
  player_id: string;
  species_id: number | null;
  claimed_species_id: number | null;
  photo_url: string;
  thumb_url: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  near?: string | null;
  captured_at: string;
  created_at: string;
  ai_name: string | null;
  ai_common: string | null;
  ai_score: number | null;
  ai_match: boolean | null;
  ai_raw: { name?: string; common?: string; score?: number }[] | null;
  flags: string[];
  status: string;
  judged_at: string | null;
  judge_note: string | null;
  player_name: string;
  player_emoji: string;
  team_name: string | null;
  team_emoji: string | null;
  species_name: string | null;
  species_scientific: string | null;
  species_emoji: string | null;
  claimed_name: string | null;
  judge_name: string | null;
}

const FLAG_TEXT: Record<string, [string, 'warn' | 'bad' | 'info']> = {
  ai_disagrees: ['AI disagrees', 'warn'],
  ai_unavailable: ['AI offline', 'info'],
  ai_off: ['Manual mode · AI switched off', 'info'],
  ai_no_plant: ['AI saw no plant', 'warn'],
  unknown_species: ['Not on the list', 'warn'],
  duplicate_photo: ['Same photo as another player', 'bad'],
};

function aiTop(raw: JudgeItem['ai_raw']) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 3).map((r) => {
    const o = r as Record<string, unknown>;
    const name = (o.name ?? o.scientificName ?? o.scientific ?? '') as string;
    const common = (o.common ?? o.commonName ?? '') as string;
    const score = typeof o.score === 'number' ? o.score : null;
    return { name, common, score };
  });
}

function SpeciesPicker({ onPick, onClose }: { onPick: (id: number) => void; onClose: () => void }) {
  const { list } = useSpecies();
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list.filter((x) => !s || x.common_name.toLowerCase().includes(s) || x.scientific_name.toLowerCase().includes(s));
  }, [list, q]);
  return (
    <Sheet onClose={onClose}>
      <h3>Which species is it?</h3>
      <input className="input" style={{ marginTop: '0.6rem' }} placeholder="Search name or scientific name" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="jd-picklist">
        {shown.map((s) => (
          <button key={s.id} className="species-opt" onClick={() => onPick(s.id)}>
            <span className="em">{s.emoji}</span>
            <span>
              <span className="nm">{s.common_name}</span>
              <br />
              <span className="small muted">
                <i>{s.scientific_name}</i> · {s.points} pts
              </span>
            </span>
          </button>
        ))}
        {shown.length === 0 && <div className="muted small">No match. Add it from the admin page first.</div>}
      </div>
    </Sheet>
  );
}

function JudgeCard({ item, onDone }: { item: JudgeItem; onDone: (id: string) => void }) {
  const now = useNow(30000);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [picking, setPicking] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [busy, setBusy] = useState(false);

  const act = async (action: 'approve' | 'reject' | 'reassign', speciesId?: number) => {
    setBusy(true);
    try {
      await api('judge', { findId: item.id, action, speciesId, note: note.trim() || undefined });
      toast(action === 'reject' ? 'Rejected' : action === 'reassign' ? 'Species changed and approved' : 'Approved');
      onDone(item.id);
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  };

  const top = aiTop(item.ai_raw);
  const claimed = item.claimed_name ?? (item.claimed_species_id === null ? 'Not sure' : '?');
  const aiLabel = item.ai_common || item.ai_name;
  const needsSpecies = item.species_id === null;

  return (
    <div className="card jd-card">
      <img className="jd-photo" src={item.photo_url} alt="Submitted plant" onClick={() => setZoom(true)} loading="lazy" decoding="async" />
      <div className="jd-body">
        <div className="row spread wrap">
          <div style={{ fontWeight: 700 }}>
            {item.player_emoji} {item.player_name}
            {item.team_name && (
              <span className="muted">
                {' '}
                · {item.team_emoji} {item.team_name}
              </span>
            )}
          </div>
          <span className={`pill ${item.status === 'pending' ? 'pending' : 'ok'}`}>{item.status === 'pending' ? 'No points yet' : 'Points given'}</span>
        </div>

        <div className="jd-vs">
          <div className="jd-side">
            <div className="lbl">Player says</div>
            <div className="val">
              {item.species_emoji && item.species_id === item.claimed_species_id ? `${item.species_emoji} ` : ''}
              {claimed}
            </div>
            {item.species_id !== null && item.species_id !== item.claimed_species_id && (
              <div className="sci">Counted as {item.species_name}</div>
            )}
          </div>
          <div className={`jd-mark ${item.ai_match ? 'ok' : item.ai_score !== null ? 'no' : ''}`} aria-label={item.ai_match ? 'AI agrees' : item.ai_score !== null ? 'AI disagrees' : 'No AI answer'}>
            {item.ai_match ? '=' : item.ai_score !== null ? '≠' : '·'}
          </div>
          <div className="jd-side">
            <div className="lbl">AI guess</div>
            <div className="val">{aiLabel ?? '—'}</div>
            {item.ai_name && (
              <div className="sci">
                {item.ai_name}
                {item.ai_score !== null ? ` · ${Math.round(item.ai_score * 100)}%` : ''}
              </div>
            )}
          </div>
        </div>

        {top.length > 1 && (
          <div className="jd-ai">
            Other AI ideas:{' '}
            {top
              .slice(1)
              .map((t) => `${t.common || t.name}${t.score !== null ? ` ${Math.round(t.score * 100)}%` : ''}`)
              .join(' · ')}
          </div>
        )}

        {item.flags.length > 0 && (
          <div className="st-chips">
            {item.flags.map((f) => {
              const [t, kind] = FLAG_TEXT[f] ?? [f, 'warn'];
              return (
                <span key={f} className={`jd-flag ${kind}`}>
                  {t}
                </span>
              );
            })}
          </div>
        )}

        <div className="st-kv">
          <span>{timeAgo(item.created_at, now)}</span>
          {item.near && <span>near {item.near}</span>}
          {item.accuracy_m !== null && <span>GPS ±{Math.round(item.accuracy_m)} m</span>}
          <span>
            <a href={`https://maps.google.com/?q=${item.lat},${item.lng}`} target="_blank" rel="noreferrer">
              Open in Maps ↗
            </a>
          </span>
        </div>

        {rejecting ? (
          <div className="stack" style={{ gap: '0.5rem' }}>
            <input className="input" placeholder="Reason (optional, the player sees it)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="st-row2">
              <button className="btn ghost" onClick={() => setRejecting(false)} disabled={busy}>
                Cancel
              </button>
              <button className="btn jd-reject" onClick={() => act('reject')} disabled={busy}>
                Reject
              </button>
            </div>
          </div>
        ) : (
          <div className="jd-actions">
            <button className="btn jd-approve" disabled={busy} onClick={() => (needsSpecies ? setPicking(true) : act('approve'))}>
              Approve
            </button>
            <button className="btn jd-reject" disabled={busy} onClick={() => setRejecting(true)}>
              Reject
            </button>
            <button className="btn ghost" disabled={busy} onClick={() => setPicking(true)}>
              Change species
            </button>
          </div>
        )}
      </div>
      {picking && (
        <SpeciesPicker
          onClose={() => setPicking(false)}
          onPick={(id) => {
            setPicking(false);
            void act('reassign', id);
          }}
        />
      )}
      {zoom && (
        <div className="jd-full" onClick={() => setZoom(false)}>
          <img src={item.photo_url} alt="Full size" />
        </div>
      )}
    </div>
  );
}

function JudgeQueue() {
  const { session, logout } = useSession();
  const { data, error, reload } = usePoll(() => api<{ queue: JudgeItem[]; recent: JudgeItem[] }>('judge', undefined, 'GET'), 8000);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [showRecent, setShowRecent] = useState(false);
  const now = useNow(30000);

  const queue = (data?.queue ?? []).filter((q) => !done.has(q.id));
  const pending = queue.filter((q) => q.status === 'pending').length;

  return (
    <div className="st-wrap narrow">
      <div className="st-head">
        <div className="row">
          <Logo size={40} />
          <div>
            <div className="st-kicker">TREASURE TRAIL · judges</div>
            <h2>Judge queue</h2>
            <div className="small muted">
              {session?.player.emoji} {session?.player.display_name} · {session?.player.role}
            </div>
          </div>
        </div>
        <div className="st-links">
          {session?.player.role === 'admin' && (
            <Link className="btn sm ghost" to="/admin">
              Admin
            </Link>
          )}
          <button className="btn sm ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </div>

      <div className="card ink" style={{ marginBottom: '1rem' }}>
        <div className="scorecard">
          <div className="stat">
            <b>{data ? queue.length : '…'}</b>
            <span>waiting</span>
          </div>
          <div className="stat">
            <b>{data ? pending : '…'}</b>
            <span>no points yet</span>
          </div>
          <div className="stat">
            <b>{data ? queue.length - pending : '…'}</b>
            <span>flagged check</span>
          </div>
        </div>
      </div>

      {error && <div className="error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {!data && !error && <Spinner />}

      {data && queue.length === 0 && (
        <div className="card center stack jd-empty" style={{ padding: '2rem 1rem', alignItems: 'center' }}>
          <Elegant mood="cheer" size={84} />
          <h3>All caught up</h3>
          <div className="muted">New finds that need a look show up here automatically.</div>
          <button className="btn ghost" onClick={() => void reload()}>
            Refresh
          </button>
        </div>
      )}

      <div className="stack">
        {queue.map((item) => (
          <JudgeCard key={item.id} item={item} onDone={(id) => setDone((d) => new Set(d).add(id))} />
        ))}
      </div>

      {data && data.recent.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <button className="btn ghost block" onClick={() => setShowRecent((s) => !s)}>
            {showRecent ? 'Hide' : 'Show'} recently judged ({data.recent.length})
          </button>
          {showRecent && (
            <div className="stack" style={{ marginTop: '0.75rem', gap: '0.5rem' }}>
              {data.recent.map((r) => (
                <div key={r.id} className="card row" style={{ padding: '0.6rem' }}>
                  <img src={r.thumb_url} alt="" loading="lazy" decoding="async" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 10 }} />
                  <div className="grow">
                    <div style={{ fontWeight: 700 }}>
                      {r.species_emoji} {r.species_name ?? 'Unknown'} <span className={`pill ${r.status === 'rejected' ? 'rejected' : 'ok'}`}>{r.status}</span>
                    </div>
                    <div className="small muted">
                      {r.player_name} · by {r.judge_name ?? '?'} · {r.judged_at ? timeAgo(r.judged_at, now) : ''}
                      {r.judge_note ? ` · “${r.judge_note}”` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Judge() {
  return (
    <StaffGate roles={['judge', 'admin']} title="Judge queue">
      <JudgeQueue />
    </StaffGate>
  );
}
