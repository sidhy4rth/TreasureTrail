import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fmtCountdown, serverOffset, useGameState, useMyFinds, useNow, useSession, useSpecies } from '../lib/game';
import { computeBadges, TAG_LABEL } from '../lib/badges';
import { flushQueue, listQueue } from '../lib/queue';
import type { MyFind, Species } from '../lib/types';
import { RarityPill, Sheet, Sprig, TopBar, burst, ordinal, toast } from '../components/ui';

type Filter = 'all' | 'found' | 'missing';
const RANK = { legendary: 0, rare: 1, uncommon: 2, common: 3 } as const;

export default function Journal() {
  const { session } = useSession();
  const me = session!.player;
  const { data: state } = useGameState(10000);
  const { data: finds, reload } = useMyFinds(me.id, 15000);
  const { list: species, byId } = useSpecies();
  const now = useNow(1000) + serverOffset(state);
  const nav = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Species | null>(null);
  const [queued, setQueued] = useState(0);

  // Retry offline finds when we land here or come back online.
  useEffect(() => {
    let alive = true;
    const run = async () => {
      if ((await listQueue()).length === 0) return alive && setQueued(0);
      const res = await flushQueue();
      for (const r of res) {
        if (r.ok) {
          toast(`Uploaded: ${r.label} ✓`);
          if (r.result?.find?.is_first) burst('big');
        } else toast(`${r.label}: ${r.error}`);
      }
      if (res.length) void reload();
      if (alive) setQueued((await listQueue()).length);
    };
    void run();
    const t = setInterval(run, 20000);
    window.addEventListener('online', run);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener('online', run);
    };
  }, [reload]);

  const mine = useMemo(() => {
    const m = new Map<number, MyFind>();
    for (const f of finds ?? []) {
      if (!f.species_id || f.status === 'rejected') continue;
      const cur = m.get(f.species_id);
      if (!cur || (cur.status === 'pending' && f.status !== 'pending')) m.set(f.species_id, f);
    }
    return m;
  }, [finds]);

  const myRow = state?.players.find((p) => p.id === me.id);
  const myRank = state ? state.players.findIndex((p) => p.id === me.id) + 1 : 0;
  const myTeam = state?.teams.find((t) => t.id === me.team_id);
  const teamRank = state && myTeam ? state.teams.findIndex((t) => t.id === myTeam.id) + 1 : 0;
  const frozen = state?.settings.frozen;
  const myScore = (finds ?? []).reduce((a, f) => a + (f.pts ?? 0), 0);
  const pending = (finds ?? []).filter((f) => f.status === 'pending');
  const mystery = pending.filter((f) => !f.species_id);
  const rejected = (finds ?? []).filter((f) => f.status === 'rejected');
  const badges = computeBadges(finds ?? [], byId);
  const earned = badges.filter((b) => b.earned).length;

  const sorted = [...species].sort((a, b) => {
    const fa = mine.has(a.id) ? 0 : 1;
    const fb = mine.has(b.id) ? 0 : 1;
    return fa - fb || RANK[a.rarity] - RANK[b.rarity] || a.common_name.localeCompare(b.common_name);
  });
  const shown = sorted.filter((s) => (filter === 'all' ? true : filter === 'found' ? mine.has(s.id) : !mine.has(s.id)));

  const st = state?.settings;
  const startMs = st?.starts_at ? new Date(st.starts_at).getTime() : null;
  const endMs = st?.ends_at ? new Date(st.ends_at).getTime() : null;
  const bounty = state?.bounty;
  const bountySp = bounty ? byId.get(bounty.species_id) : undefined;
  const foundInfo = (id: number) => state?.found.find((f) => f.species_id === id);

  return (
    <>
      <TopBar right={<Link to="/team" className="pill mechip">{me.emoji} {me.display_name}</Link>} />

      <div className="card ink stack" style={{ marginBottom: '1rem', marginTop: '1.4rem' }}>
        <Sprig mood="cheer" size={80} className="peek" />
        <div className="row spread" style={{ alignItems: 'flex-start', paddingRight: 72 }}>
          <div>
            <div className="lbl-lime">Your score</div>
            <div className="score-big">{myScore}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            {startMs && now < startMs ? (
              <><div className="lbl-lime">Starts in</div><div className="cd">{fmtCountdown(startMs - now)}</div></>
            ) : endMs && now < endMs ? (
              <><div className="lbl-lime">Time left</div><div className="cd">{fmtCountdown(endMs - now)}</div></>
            ) : endMs && now >= endMs ? (
              <div className="cd">Hunt over!</div>
            ) : (
              <><div className="lbl-lime">Status</div><div className="cd">Hunt on!</div></>
            )}
          </div>
        </div>
        <div className="scorecard">
          <div className="stat"><b>{frozen ? '🔒' : myRank ? ordinal(myRank) : '–'}</b><span>solo rank</span></div>
          <div className="stat"><b>{mine.size}<small>/{species.length}</small></b><span>species</span></div>
          <div className="stat"><b>{myRow?.firsts ?? (finds ?? []).filter((f) => f.is_first).length}</b><span>first finds</span></div>
        </div>
        {myTeam && (
          <Link to="/team" className="teamline">
            <span>{myTeam.emoji} Team <b>{myTeam.name}</b> · {myTeam.species} sp</span>
            <span className="tl-score">{frozen ? '🔒' : `${ordinal(teamRank)} · ${myTeam.score} pts`}</span>
          </Link>
        )}
        {!me.team_id && <Link to="/team" className="teamline"><span>➕ Join or start a team</span></Link>}
      </div>

      {bounty && bountySp && (
        <button className="bounty" style={{ width: '100%', marginBottom: '1.1rem', cursor: 'pointer', textAlign: 'left' }} onClick={() => nav(`/snap?species=${bountySp.id}`)}>
          <span className="em">{bountySp.emoji}</span>
          <div className="grow">
            <div className="wanted">WANTED · {fmtCountdown(new Date(bounty.ends_at).getTime() - now)} LEFT</div>
            <div className="bname">{bountySp.common_name}</div>
            <div className="small" style={{ fontWeight: 800 }}>{mine.has(bountySp.id) ? "Already in your journal. Tell your team!" : bountySp.hint}</div>
          </div>
          <span className="x">×{bounty.multiplier}</span>
        </button>
      )}

      {queued > 0 && <div className="notice" style={{ marginBottom: '1rem' }}>📶 {queued} find{queued > 1 ? 's' : ''} waiting for signal. We'll upload automatically.</div>}

      <Link to="/snap" className="btn sun big block" style={{ marginBottom: '1.4rem' }}>📸 Snap a leaf</Link>

      {(pending.length > 0 || rejected.length > 0) && (
        <div className="card stack" style={{ marginBottom: '1rem' }}>
          {pending.length > 0 && <div className="row"><span className="pill pending">⏳ {pending.length} with the judges</span><span className="small muted">Points land when a judge approves.</span></div>}
          {mystery.map((f) => (
            <div key={f.id} className="row">
              <img src={f.thumb_url} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 10 }} />
              <div className="small"><b>Mystery plant</b><br /><span className="muted">AI guess: {f.ai_common || f.ai_name || 'unknown'}. A judge will name it.</span></div>
            </div>
          ))}
          {rejected.slice(0, 3).map((f) => (
            <div key={f.id} className="row">
              <img src={f.thumb_url} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 10, filter: 'grayscale(1)' }} />
              <div className="small"><span className="pill rejected">Not accepted</span> <span className="muted">{f.judge_note || "The judges couldn't confirm this one."}</span></div>
            </div>
          ))}
        </div>
      )}

      <div className="row spread" style={{ marginBottom: '0.6rem' }}>
        <h2>Herbarium</h2>
        <span className="pill ok" style={{ fontSize: '0.8rem' }}>{mine.size} / {species.length} pressed</span>
      </div>
      <div className="tabs" style={{ marginBottom: '0.9rem' }}>
        {(['all', 'found', 'missing'] as Filter[]).map((f) => (
          <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'found' ? 'Found' : 'Still hiding'}
          </button>
        ))}
      </div>
      <div className="herbarium">
        {shown.map((s) => {
          const f = mine.get(s.id);
          const fi = foundInfo(s.id);
          return (
            <button key={s.id} className={`specimen ${f ? 'found' : 'locked'} ${s.rarity}`} onClick={() => setOpen(s)}>
              <div className="art">
                {f ? <img src={f.thumb_url} alt={s.common_name} loading="lazy" /> : <span>{s.emoji}</span>}
                {f?.status === 'pending' && <span className="corner pill pending">⏳</span>}
                {f?.is_first && <span className="corner pill legendary">🥇</span>}
                {!f && fi && <span className="corner pill" title="Found by others">👀 {fi.finders}</span>}
              </div>
              <div className="label">
                {f ? s.common_name : s.rarity === 'legendary' ? '✨ ???' : '???'}
                <div className="muted" style={{ fontWeight: 700 }}>{s.points} pts</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="row spread" style={{ margin: '1.5rem 0 0.6rem' }}>
        <h2>Badges</h2>
        <span className="pill ok" style={{ fontSize: '0.8rem' }}>{earned} / {badges.length}</span>
      </div>
      <div className="badges">
        {badges.map((b) => (
          <div key={b.id} className={`badge ${b.earned ? '' : 'off'}`} title={b.how} onClick={() => toast(`${b.emoji} ${b.name}: ${b.how}${b.earned ? ' ✓' : ''}`)}>
            <div className="em">{b.emoji}</div>
            <div className="nm">{b.name}</div>
          </div>
        ))}
      </div>

      {open && (
        <SpeciesSheet s={open} find={mine.get(open.id)} info={foundInfo(open.id)} onClose={() => setOpen(null)} onSnap={() => nav(`/snap?species=${open.id}`)} />
      )}
    </>
  );
}

function SpeciesSheet({ s, find, info, onClose, onSnap }: {
  s: Species; find?: MyFind; info?: { finders: number; first_name: string; first_team: string | null }; onClose: () => void; onSnap: () => void;
}) {
  return (
    <Sheet onClose={onClose}>
      <div className="stack">
        {find ? (
          <div className="polaroid"><img src={find.photo_url} alt={s.common_name} /><div className="cap">{s.common_name}</div></div>
        ) : (
          <div className="center" style={{ fontSize: '4.5rem', filter: 'brightness(0)', opacity: 0.16 }}>{s.emoji}</div>
        )}
        <div className="row spread">
          <div>
            <h2>{find ? `${s.emoji} ${s.common_name}` : 'Unknown specimen'}</h2>
            {find && <div className="muted" style={{ fontStyle: 'italic' }}>{s.scientific_name}</div>}
          </div>
          <RarityPill rarity={s.rarity} />
        </div>
        <div className="card fact">
          <div className="fact-lbl">{find ? 'Did you know?' : 'Riddle'}</div>
          <div className="hand">{find ? s.fun_fact : s.hint}</div>
        </div>
        <div className="row wrap">
          <span className="pill">{s.points} pts</span>
          <span className="pill">{s.kind}</span>
          {find && s.tags.map((t) => <span key={t} className="pill">{TAG_LABEL[t] ?? t}</span>)}
        </div>
        {info ? (
          <div className="small">🥇 First found by <b>{info.first_name}</b>{info.first_team ? ` (${info.first_team})` : ''} · {info.finders} explorer{info.finders > 1 ? 's' : ''} so far</div>
        ) : (
          <div className="small">Nobody has found this yet. Be first for +50%! 🥇</div>
        )}
        {find && (
          <div className="small muted">
            {find.status === 'pending' ? '⏳ Waiting for a judge.' : find.status === 'approved' ? '✅ Approved by a judge.' : '🤖 AI agreed.'}
            {find.pts != null && ` · +${find.pts} pts`}
            {find.is_first && ' · 🥇 First on campus!'}
          </div>
        )}
        {!find && <button className="btn sun block" onClick={onSnap}>📸 I found it!</button>}
        <button className="btn ghost block" onClick={onClose}>Close</button>
      </div>
    </Sheet>
  );
}
