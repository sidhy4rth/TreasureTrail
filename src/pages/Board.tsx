import { useState } from 'react';
import { useGameState, useSession } from '../lib/game';
import { Sprig, TopBar } from '../components/ui';

type Tab = 'teams' | 'solo';

interface Row {
  id: string;
  name: string;
  emoji: string;
  score: number;
  species: number;
  firsts: number;
  sub?: string;
}

export default function Board() {
  const { session } = useSession();
  const me = session!.player;
  const { data: state } = useGameState(8000);
  const [tab, setTab] = useState<Tab>(me.team_id ? 'teams' : 'solo');

  const teamName = new Map(state?.teams.map((t) => [t.id, `${t.emoji} ${t.name}`]) ?? []);
  const rows: Row[] =
    tab === 'teams'
      ? (state?.teams ?? []).map((t) => ({ ...t, sub: `${t.members} member${t.members === 1 ? '' : 's'}` }))
      : (state?.players ?? []).map((p) => ({ ...p, sub: p.team_id ? teamName.get(p.team_id) : 'solo' }));
  const mineId = tab === 'teams' ? me.team_id : me.id;
  const frozen = state?.settings.frozen;
  const top = rows.slice(0, 3);

  return (
    <>
      <TopBar right={<span className="pill"><span className="dot" style={{ color: '#E4472F', animation: 'blink 1.6s infinite' }} /> LIVE</span>} />
      <h1 style={{ marginBottom: '0.75rem' }}>Leaderboard</h1>
      <div className="tabs" style={{ marginBottom: '1rem' }}>
        <button className={tab === 'teams' ? 'on' : ''} onClick={() => setTab('teams')}>👥 Teams</button>
        <button className={tab === 'solo' ? 'on' : ''} onClick={() => setTab('solo')}>🧍 Solo</button>
      </div>

      {frozen ? (
        <div className="card ink center stack" style={{ alignItems: 'center', padding: '2rem 1rem' }}>
          <Sprig mood="think" size={96} className="bob" />
          <h2 style={{ color: 'var(--sun)' }}>Leaderboard frozen</h2>
          <p style={{ margin: 0, opacity: 0.8 }}>Scores are hidden for the final stretch. Keep hunting! Results are revealed at the ceremony.</p>
        </div>
      ) : !state ? (
        <p className="muted center">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="card center stack" style={{ alignItems: 'center' }}><Sprig mood="wave" size={96} /><p className="muted" style={{ margin: 0, fontWeight: 800 }}>No {tab === 'teams' ? 'teams' : 'players'} yet. Be the first!</p></div>
      ) : (
        <>
          {top.length >= 1 && (
            <div className="podium">
              {[1, 0, 2].map((i) => {
                const r = top[i];
                if (!r) return <div key={i} />;
                return (
                  <div key={r.id} className={`step p${i + 1}`}>
                    {i === 0 && (
                      <svg className="crown" viewBox="0 0 40 28" aria-hidden="true"><path d="M4 24 L2 6 L12 14 L20 2 L28 14 L38 6 L36 24 Z" fill="#FFC93C" stroke="#1B2A1F" strokeWidth="3" strokeLinejoin="round" /></svg>
                    )}
                    <div className="em">{r.emoji}</div>
                    <div className="who">{r.name}</div>
                    {r.id === mineId && <span className="me-tag">YOU</span>}
                    <div className="block">
                      {i + 1}
                      <small>{r.score} pts</small>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="board">
            {rows.map((r, i) => (
              <div key={r.id} className={`rank-row ${r.id === mineId ? 'me' : ''}`}>
                <div className="pos">{i + 1}</div>
                <div className="avatar">{r.emoji}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="name">{r.name}{r.id === mineId ? ' (you)' : ''}</div>
                  <div className="sub">{r.species} species{r.firsts ? ` · 🥇×${r.firsts}` : ''}{r.sub ? ` · ${r.sub}` : ''}</div>
                </div>
                <div className="score">{r.score}</div>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="small muted center" style={{ marginTop: '1rem' }}>
        Teams score each species once (best find). 🥇 First Finder = +50%. Pending finds count once a judge approves.
      </p>
    </>
  );
}
