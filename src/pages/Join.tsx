import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, type Session } from '../lib/api';
import { useSession } from '../lib/game';
import type { Team } from '../lib/types';
import { Sprig, toast } from '../components/ui';

const AVATARS = ['🦜', '🐝', '🦋', '🐞', '🦎', '🐿️', '🦉', '🐸', '🐌', '🦚', '🐢', '🦔'];
const TEAM_EMOJI = ['🌿', '🌳', '🌵', '🍄', '🌻', '🌴', '🍁', '🌾'];

type Mode = 'new' | 'login';
type Step = 'account' | 'team';

export default function Join() {
  const { session, setSession } = useSession();
  const nav = useNavigate();
  const [mode, setMode] = useState<Mode>('new');
  const [step, setStep] = useState<Step>('account');
  const [name, setName] = useState('');
  const [sid, setSid] = useState('');
  const [pin, setPin] = useState('');
  const [emoji, setEmoji] = useState(AVATARS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [teamMode, setTeamMode] = useState<'join' | 'create'>('join');
  const [code, setCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamEmoji, setTeamEmoji] = useState(TEAM_EMOJI[0]);

  if (session && step === 'account') return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === 'new') {
        const r = await api<Session>('auth', { action: 'join', name, studentId: sid, pin, emoji });
        setSession(r);
        setStep('team');
      } else {
        const r = await api<Session>('auth', { action: 'login', studentId: sid, pin });
        setSession(r);
        toast(`Welcome back, ${r.player.display_name}!`);
        nav('/', { replace: true });
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function team(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const body = teamMode === 'join' ? { action: 'join', code } : { action: 'create', name: teamName, emoji: teamEmoji };
      const r = await api<{ team: Team; player: Session['player'] }>('team', body);
      if (session) setSession({ ...session, team: r.team, player: r.player });
      toast(teamMode === 'join' ? `You joined ${r.team.name}!` : `Team ${r.team.name} created. Share code ${r.team.code}`);
      nav(teamMode === 'create' ? '/team' : '/', { replace: true });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app" style={{ paddingBottom: '2rem' }}>
      <div className="scene">
        <svg className="bg" viewBox="0 0 390 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
          <g stroke="#1B2A1F" strokeWidth="4" strokeLinecap="round">
            <line x1="338" y1="8" x2="338" y2="18" /><line x1="380" y1="50" x2="370" y2="50" /><line x1="368" y1="20" x2="361" y2="27" /><line x1="308" y1="20" x2="315" y2="27" /><line x1="296" y1="50" x2="306" y2="50" />
          </g>
          <circle cx="338" cy="50" r="24" fill="#FFC93C" stroke="#1B2A1F" strokeWidth="4" />
          <path d="M282 176 Q282 160 298 160 Q303 148 317 151 Q327 141 340 151 Q354 151 352 165 Q360 173 349 179 L290 179 Q280 179 282 176 Z" fill="#fff" stroke="#1B2A1F" strokeWidth="4" strokeLinejoin="round" />
          <path d="M-20 268 Q90 200 200 240 Q300 275 420 220 L420 320 L-20 320 Z" fill="#8FE38A" stroke="#1B2A1F" strokeWidth="4" />
          <path d="M-20 292 Q120 258 240 280 Q330 292 420 266 L420 320 L-20 320 Z" fill="#4CC26A" stroke="#1B2A1F" strokeWidth="4" />
        </svg>
        <div className="head">
          <span className="org-pill">CoE · Nature Based Solutions</span>
          <h1 className="stroke-title">Canopy Quest</h1>
          <div className="tag">Hunt leaves. Snap them. Top the canopy.</div>
        </div>
        <div className="bubble">Hi! I'm Sprig. Let's find every leaf on campus!</div>
        <Sprig mood="wave" size={128} className="wiggle" />
      </div>

      {step === 'account' && (
        <form className="card stack" onSubmit={submit} style={{ marginTop: -6, position: 'relative', zIndex: 2 }}>
          <div className="tabs" role="tablist">
            <button type="button" className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}>New player</button>
            <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>I've played before</button>
          </div>

          {mode === 'new' && (
            <div className="field">
              <label htmlFor="nm">Your name on the leaderboard</label>
              <input id="nm" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="e.g. Priya S" autoComplete="nickname" required />
            </div>
          )}
          <div className="field">
            <label htmlFor="sid">Student ID</label>
            <input id="sid" className="input" value={sid} onChange={(e) => setSid(e.target.value.toUpperCase())} maxLength={20} placeholder="e.g. 2026BTECH0142" autoCapitalize="characters" autoComplete="username" required />
          </div>
          <div className="field">
            <label htmlFor="pin">{mode === 'new' ? 'Pick a 4-digit PIN' : 'Your 4-digit PIN'}</label>
            <input id="pin" className="input pin" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" pattern="\d{4}" placeholder="••••" autoComplete={mode === 'new' ? 'new-password' : 'current-password'} required />
            {mode === 'new' && <span className="small muted">Remember it. It's how you log back in on another phone.</span>}
          </div>
          {mode === 'new' && (
            <div className="field">
              <label>Pick your field buddy</label>
              <div className="buddies">
                {AVATARS.map((a) => (
                  <button type="button" key={a} className="buddy" onClick={() => setEmoji(a)} aria-label={`Avatar ${a}`} aria-pressed={emoji === a}>
                    {a}
                  </button>
                ))}
              </div>
            </div>
          )}
          {err && <div className="error">{err}</div>}
          <button className="btn sun big block" disabled={busy || pin.length !== 4}>
            {busy ? 'One sec…' : mode === 'new' ? "Let's hunt! →" : 'Log in →'}
          </button>
        </form>
      )}

      {step === 'team' && (
        <form className="card stack" onSubmit={team} style={{ marginTop: -6, position: 'relative', zIndex: 2 }}>
          <h2>Play with friends?</h2>
          <p className="muted" style={{ margin: 0 }}>
            Your finds always count for you on the Solo board. Join a team (up to 4) and they also count for your team.
          </p>
          <div className="tabs">
            <button type="button" className={teamMode === 'join' ? 'on' : ''} onClick={() => setTeamMode('join')}>Join with a code</button>
            <button type="button" className={teamMode === 'create' ? 'on' : ''} onClick={() => setTeamMode('create')}>Start a team</button>
          </div>
          {teamMode === 'join' ? (
            <div className="field">
              <label htmlFor="code">Team code</label>
              <input id="code" className="input pin" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))} placeholder="ABCDE" autoCapitalize="characters" required />
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="tn">Team name</label>
                <input id="tn" className="input" value={teamName} onChange={(e) => setTeamName(e.target.value)} maxLength={24} placeholder="e.g. Leaf Erikson" required />
              </div>
              <div className="buddies">
                {TEAM_EMOJI.map((a) => (
                  <button type="button" key={a} className="buddy" onClick={() => setTeamEmoji(a)} aria-pressed={teamEmoji === a}>
                    {a}
                  </button>
                ))}
              </div>
            </>
          )}
          {err && <div className="error">{err}</div>}
          <button className="btn leaf big block" disabled={busy}>{busy ? 'One sec…' : teamMode === 'join' ? 'Join team' : 'Create team'}</button>
          <button type="button" className="btn ghost block" onClick={() => nav('/', { replace: true })}>Skip, I'll play solo</button>
        </form>
      )}

      <p className="center small muted" style={{ marginTop: '1.25rem' }}>
        Photos are geotagged with your location on campus and shown on the live leaderboard.
      </p>
    </div>
  );
}
