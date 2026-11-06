import { useState } from 'react';
import { useGameState, useSession } from '../lib/game';
import { Elegant, Icon, TopBar } from '../components/ui';

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
      <TopBar right={<span className="status-chip"><span className="live-dot" />LIVE</span>} />
      <div className="kicker" style={{ marginTop: '0.4rem' }}>Leaderboard</div>
      <h1 style={{ margin: '0.2rem 0 0.9rem' }}>Ranks</h1>
      <div className="tabs" style={{ marginBottom: '1rem' }}>
        <button className={tab === 'teams' ? 'on' : ''} onClick={() => setTab('teams')}>Crews</button>
        <button className={tab === 'solo' ? 'on' : ''} onClick={() => setTab('solo')}>Solo</button>
      </div>

      {frozen ? (
        <div className="card center stack" style={{ alignItems: 'center', padding: '2rem 1rem' }}>
          <Elegant mood="think" size={84} className="bob" />
          <h2>Leaderboard frozen</h2>
          <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>Scores are hidden for the final stretch. Keep snapping! Results are revealed at the ceremony.</p>
        </div>
      ) : !state ? (
        <p className="muted center">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="card center stack" style={{ alignItems: 'center', padding: '1.6rem 1rem' }}><Elegant mood="wave" size={72} /><p className="muted" style={{ margin: 0 }}>No {tab === 'teams' ? 'crews' : 'players'} yet. Be the first!</p></div>
      ) : (
        <>
          {top.length >= 1 && (
            <div className="podium">
              {[1, 0, 2].map((i) => {
                const r = top[i];
                if (!r) return <div key={i} />;
                return (
                  <div key={r.id} className={`step p${i + 1}`}>
                    {i === 0 && <span className="crown"><Icon name="crown" size={24} /></span>}
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
                  <div className="sub">{r.species} species{r.firsts ? ` · ${r.firsts} first` : ''}{r.sub ? ` · ${r.sub}` : ''}</div>
                </div>
                <div className="score">{r.score}</div>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="small muted center" style={{ marginTop: '1rem' }}>
        Crews score each species once (best find). First Finder +50%. Pending finds count once a judge approves.
      </p>
    </>
  );
}
