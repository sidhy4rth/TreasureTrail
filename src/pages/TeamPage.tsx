import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useGameState, useSession } from '../lib/game';
import type { Player, Team } from '../lib/types';
import { Icon, TopBar, ordinal, toast } from '../components/ui';

const TEAM_EMOJI = ['🌿', '🌳', '🌵', '🍄', '🌻', '🌴', '🍁', '🌾'];
const AVATARS = ['🦜', '🐝', '🦋', '🐞', '🦎', '🐿️', '🦉', '🐸', '🐌', '🦚', '🐢', '🦔'];

export default function TeamPage() {
  const { session, setSession, logout, refreshMe } = useSession();
  const me = session!.player;
  const team = session!.team;
  const { data: state } = useGameState(15000);
  const [mode, setMode] = useState<'join' | 'create'>('join');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(TEAM_EMOJI[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState(me.display_name);
  const [newEmoji, setNewEmoji] = useState(me.emoji);

  async function call(body: object) {
    setErr(null);
    setBusy(true);
    try {
      const r = await api<{ team: Team | null; player: Player }>('team', body);
      setSession({ ...session!, team: r.team, player: r.player });
      return r;
    } catch (e) {
      setErr((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = await call(mode === 'join' ? { action: 'join', code } : { action: 'create', name, emoji });
    if (r?.team) toast(mode === 'join' ? `Welcome to ${r.team.name}!` : `Crew created! Share code ${r.team.code}`);
  }

  async function rename(e: FormEvent) {
    e.preventDefault();
    try {
      const r = await api<{ player: Player }>('auth', { action: 'rename', name: newName, emoji: newEmoji });
      setSession({ ...session!, player: r.player });
      setEditing(false);
      toast('Saved ✓');
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const teamRow = state?.teams.find((t) => t.id === team?.id);
  const teamRank = teamRow && state ? state.teams.indexOf(teamRow) + 1 : 0;
  const frozen = state?.settings.frozen;
  const playerScore = new Map(state?.players.map((p) => [p.id, p]) ?? []);

  async function share() {
    if (!team) return;
    const text = `Join my TREASURE TRAIL crew "${team.name}" with code ${team.code}. Leave the class, snap the campus: ${location.origin}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast('Copied invite ✓');
      }
    } catch {
      /* cancelled */
    }
  }

  return (
    <>
      <TopBar />
      {team ? (
        <div className="stack">
          <div className="card center stack" style={{ alignItems: 'center', padding: '1.4rem 1rem' }}>
            <div className="team-em">{team.emoji}</div>
            <div className="kicker">Your crew</div>
            <h1 style={{ fontSize: '2.1rem' }}>{team.name}</h1>
            <div className="kicker lime" style={{ marginTop: '0.4rem' }}>Crew code · up to 4</div>
            <div className="team-code">{team.code}</div>
            <button className="btn sun" onClick={share}><Icon name="share" size={18} />Invite a friend</button>
            <div className="stat-strip" style={{ width: '100%', textAlign: 'left' }}>
              <div><b>{frozen ? 'Hidden' : teamRank ? ordinal(teamRank) : '–'}</b><span>Crew rank</span></div>
              <div><b>{frozen ? '–' : teamRow?.score ?? 0}</b><span>Points</span></div>
              <div><b>{teamRow?.species ?? 0}</b><span>Species</span></div>
            </div>
          </div>
          <div className="card stack">
            <div className="kicker">Members · {team.members.length}/4</div>
            {team.members.map((m) => (
              <div key={m.id} className="row spread">
                <span className="row" style={{ gap: '0.6rem', minWidth: 0 }}><span className="buddy" style={{ cursor: 'default', width: 40, height: 40, fontSize: '1.2rem' }}>{m.emoji}</span> <span style={{ fontWeight: 600 }}>{m.display_name}{m.id === me.id ? <span className="muted"> (you)</span> : ''}</span></span>
                <span className="mono small muted">{frozen ? '' : `${playerScore.get(m.id)?.score ?? 0} pts · ${playerScore.get(m.id)?.species ?? 0} sp`}</span>
              </div>
            ))}
            <button className="btn sm ghost" onClick={() => void refreshMe()}>↻ Refresh</button>
          </div>
          <p className="small muted" style={{ margin: 0, lineHeight: 1.5 }}>Split up to cover more ground. Each species counts once for the crew, and your own finds still count on the Solo board.</p>
          {err && <div className="error">{err}</div>}
          {confirmLeave ? (
            <div className="card stack">
              <b>Leave {team.name}?</b>
              <span className="small muted">Your finds go with you. The crew loses the species only you found.</span>
              <div className="row">
                <button className="btn clay grow" disabled={busy} onClick={() => void call({ action: 'leave' }).then(() => setConfirmLeave(false))}>Yes, leave</button>
                <button className="btn ghost grow" onClick={() => setConfirmLeave(false)}>Stay</button>
              </div>
            </div>
          ) : (
            <button className="btn ghost block" onClick={() => setConfirmLeave(true)}>Leave crew</button>
          )}
        </div>
      ) : (
        <form className="card stack" onSubmit={submit}>
          <h2>Join or start a crew</h2>
          <p className="muted" style={{ margin: 0 }}>Crews of up to 4. You're on the Solo board either way.</p>
          <div className="tabs">
            <button type="button" className={mode === 'join' ? 'on' : ''} onClick={() => setMode('join')}>Join with a code</button>
            <button type="button" className={mode === 'create' ? 'on' : ''} onClick={() => setMode('create')}>Start a crew</button>
          </div>
          {mode === 'join' ? (
            <input className="input pin" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))} placeholder="ABCDE" aria-label="Crew code" required />
          ) : (
            <>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Crew name" aria-label="Crew name" required />
              <div className="buddies">
                {TEAM_EMOJI.map((a) => (
                  <button type="button" key={a} className="buddy" onClick={() => setEmoji(a)} aria-pressed={emoji === a}>{a}</button>
                ))}
              </div>
            </>
          )}
          {err && <div className="error">{err}</div>}
          <button className="btn leaf block" disabled={busy}>{mode === 'join' ? 'Join crew' : 'Create crew'}</button>
        </form>
      )}

      <hr className="dash" />
      <div className="card stack">
        <div className="row spread">
          <span className="row" style={{ gap: '0.6rem', minWidth: 0 }}><span className="buddy" style={{ cursor: 'default', width: 44, height: 44 }}>{me.emoji}</span><span><b>{me.display_name}</b><br /><span className="mono small muted">{me.student_id}</span></span></span>
          <button className="btn sm ghost" onClick={() => setEditing((v) => !v)}>{editing ? 'Cancel' : 'Edit'}</button>
        </div>
        {editing && (
          <form className="stack" onSubmit={rename}>
            <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={24} aria-label="Display name" />
            <div className="buddies">
              {AVATARS.map((a) => (
                <button type="button" key={a} className="buddy" onClick={() => setNewEmoji(a)} aria-pressed={newEmoji === a}>{a}</button>
              ))}
            </div>
            <button className="btn leaf">Save</button>
          </form>
        )}
        <div className="row wrap">
          {me.role !== 'player' && <Link to="/judge" className="btn sm ghost">Judge queue</Link>}
          {me.role === 'admin' && <Link to="/admin" className="btn sm ghost">Admin</Link>}
          {me.role === 'player' && <Link to="/judge" className="small muted">Organiser? Enter staff code</Link>}
        </div>
        <button className="btn sm ghost" onClick={logout}>Log out</button>
      </div>
    </>
  );
}
