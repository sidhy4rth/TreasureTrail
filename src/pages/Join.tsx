import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, type Session } from '../lib/api';
import { useSession } from '../lib/game';
import type { Team } from '../lib/types';
import { Elegant, Icon, toast } from '../components/ui';

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
      toast(teamMode === 'join' ? `You joined ${r.team.name}!` : `Crew ${r.team.name} created. Share code ${r.team.code}`);
      nav(teamMode === 'create' ? '/team' : '/', { replace: true });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app" style={{ paddingBottom: '2.5rem' }}>
      <header className="join-hero">
        <span className="kicker lime">Leave the Class</span>
        <h1>TREASURE<br />TRAIL</h1>
        <p className="tagline">Leave the class. Discover the biodiversity along campus. <span className="lime">Snap it.</span></p>
      </header>

      <div className="card meet">
        <span className="elegant-badge"><Elegant mood="wave" size={40} /></span>
        <div>
          <p><b>Meet Elegant.</b> ELE·gant, because <span className="kn lime">ಎಲೆ</span> (ele) is Kannada for leaf. Snap something you can't name and it tells you what it is.</p>
          <div className="ele">ele · <span className="kn">ಎಲೆ</span> · leaf</div>
        </div>
      </div>

      {step === 'account' && (
        <form className="card stack" onSubmit={submit}>
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
            <label htmlFor="sid">Registration number</label>
            <input id="sid" className="input" value={sid} onChange={(e) => setSid(e.target.value.toUpperCase())} maxLength={40} placeholder="Your university registration number" autoCapitalize="characters" autoComplete="username" required />
          </div>
          <div className="field">
            <label htmlFor="pin">{mode === 'new' ? 'Pick a 4-digit PIN' : 'Your 4-digit PIN'}</label>
            <input id="pin" className="input pin" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" pattern="\d{4}" placeholder="••••" autoComplete={mode === 'new' ? 'new-password' : 'current-password'} required />
            {mode === 'new' && <span className="small muted">Remember it. It's how you log back in on another phone.</span>}
          </div>
          {mode === 'new' && (
            <div className="field">
              <label>Pick an avatar</label>
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
            {busy ? 'One sec…' : mode === 'new' ? <>Start the trail <Icon name="arrow" size={20} /></> : <>Log in <Icon name="arrow" size={20} /></>}
          </button>
        </form>
      )}

      {step === 'team' && (
        <form className="card stack" onSubmit={team}>
          <h2>Got a crew?</h2>
          <p className="muted" style={{ margin: 0 }}>
            Your finds always count for you on the Solo board. Join a crew (up to 4) and they count for the crew too.
          </p>
          <div className="tabs">
            <button type="button" className={teamMode === 'join' ? 'on' : ''} onClick={() => setTeamMode('join')}>Join with a code</button>
            <button type="button" className={teamMode === 'create' ? 'on' : ''} onClick={() => setTeamMode('create')}>Start a crew</button>
          </div>
          {teamMode === 'join' ? (
            <div className="field">
              <label htmlFor="code">Crew code</label>
              <input id="code" className="input pin" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))} placeholder="ABCDE" autoCapitalize="characters" required />
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="tn">Crew name</label>
                <input id="tn" className="input" value={teamName} onChange={(e) => setTeamName(e.target.value)} maxLength={24} placeholder="e.g. Root Access" required />
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
          <button className="btn leaf big block" disabled={busy}>{busy ? 'One sec…' : teamMode === 'join' ? 'Join crew' : 'Create crew'}</button>
          <button type="button" className="btn ghost block" onClick={() => nav('/', { replace: true })}>Skip, I'll play solo</button>
        </form>
      )}

      <p className="foot-note">
        Photos are geotagged with your location on campus and shown on the live leaderboard. Alliance University.
      </p>
    </div>
  );
}
