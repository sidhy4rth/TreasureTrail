import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fmtCountdown, serverOffset, useGameState, useMyFinds, useNow, useSession, useSpecies } from '../lib/game';
import { computeBadges, TAG_LABEL } from '../lib/badges';
import { flushQueue, listQueue } from '../lib/queue';
import type { MyFind, Species } from '../lib/types';
import { Elegant, Icon, RarityPill, Sheet, TopBar, burst, ordinal, toast } from '../components/ui';

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
  // The countdown re-renders this page every second; keep the heavier work keyed on its real inputs.
  const badges = useMemo(() => computeBadges(finds ?? [], byId), [finds, byId]);
  const earned = badges.filter((b) => b.earned).length;

  const sorted = useMemo(
    () =>
      [...species].sort((a, b) => {
        const fa = mine.has(a.id) ? 0 : 1;
        const fb = mine.has(b.id) ? 0 : 1;
        return fa - fb || RANK[a.rarity] - RANK[b.rarity] || a.common_name.localeCompare(b.common_name);
      }),
    [species, mine],
  );
  const shown = useMemo(
    () => sorted.filter((s) => (filter === 'all' ? true : filter === 'found' ? mine.has(s.id) : !mine.has(s.id))),
    [sorted, filter, mine],
  );

  const st = state?.settings;
  const startMs = st?.starts_at ? new Date(st.starts_at).getTime() : null;
  const endMs = st?.ends_at ? new Date(st.ends_at).getTime() : null;
  const bounty = state?.bounty;
  const bountySp = bounty ? byId.get(bounty.species_id) : undefined;
  const foundInfo = (id: number) => state?.found.find((f) => f.species_id === id);

  const total = species.length;
  const ringC = 2 * Math.PI * 46;
  const ringLen = total ? (mine.size / total) * ringC : 0;
  const firsts = myRow?.firsts ?? (finds ?? []).filter((f) => f.is_first).length;

  return (
    <>
      <TopBar right={<Link to="/team" className="me-btn" aria-label={`${me.display_name}'s profile`}>{me.emoji}</Link>} />

      <div className="status-chip">
        {startMs && now < startMs ? (
          <><span className="live-dot still" style={{ background: 'var(--warn)' }} />Trail opens in <span className="lime">{fmtCountdown(startMs - now)}</span></>
        ) : endMs && now < endMs ? (
          <><span className="live-dot" />Trail is live · <span className="lime">{fmtCountdown(endMs - now)}</span> left</>
        ) : endMs && now >= endMs ? (
          <><span className="live-dot still" style={{ background: 'var(--muted)' }} />Trail closed</>
        ) : (
          <><span className="live-dot" />Trail is live</>
        )}
      </div>

      <section className="score-row" aria-label="Your progress">
        <div>
          <div className="kicker">Your score</div>
          <div className="score-num"><b>{myScore}</b><span>pts</span></div>
        </div>
        <div className="ring">
          <svg width="108" height="108" viewBox="0 0 108 108" aria-hidden="true">
            <circle cx="54" cy="54" r="46" fill="none" stroke="var(--border)" strokeWidth="8" />
            <circle cx="54" cy="54" r="46" fill="none" stroke="var(--lime)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${ringLen} ${ringC}`} transform="rotate(-90 54 54)" />
          </svg>
          <div className="ring-in">
            <b>{mine.size}<small>/{total}</small></b>
            <span>SPECIES</span>
          </div>
        </div>
      </section>

      <div className="stat-strip">
        <div><b>{frozen ? 'Hidden' : myRank ? ordinal(myRank) : '–'}</b><span>Solo rank</span></div>
        <div><b>{firsts}</b><span>First finds</span></div>
        {myTeam ? (
          <Link to="/team"><b>{frozen ? 'Hidden' : ordinal(teamRank)} {!frozen && <small>{myTeam.score}</small>}</b><span>{myTeam.name}</span></Link>
        ) : (
          <Link to="/team"><b className="lime" style={{ fontSize: 16, paddingTop: 4 }}>Join one</b><span>No crew yet</span></Link>
        )}
      </div>

      {bounty && bountySp && (
        <button className="bounty" style={{ marginTop: '0.9rem' }} onClick={() => nav(`/snap?species=${bountySp.id}`)}>
          <span className="em">{bountySp.emoji}</span>
          <span className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="wanted">BOUNTY · {fmtCountdown(new Date(bounty.ends_at).getTime() - now)} LEFT</span>
            <span className="bname">{bountySp.common_name}</span>
            <span className="bhint">{mine.has(bountySp.id) ? 'Already in your Snap Nature. Tell your crew!' : bountySp.hint}</span>
          </span>
          <span className="x">×{bounty.multiplier}</span>
        </button>
      )}

      <Link to="/snap" className="ask-elegant" style={{ marginTop: '0.8rem' }}>
        <span className="elegant-badge"><Elegant mood="think" size={30} /></span>
        <span className="bubble">
          Not sure what you found? <span className="lime" style={{ fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>Ask Elegant</span>
          <span className="sub" style={{ display: 'block' }}>ele · <span className="kn">ಎಲೆ</span> · leaf, in Kannada</span>
        </span>
      </Link>

      {queued > 0 && <div className="notice" style={{ marginTop: '1rem' }}>{queued} find{queued > 1 ? 's' : ''} waiting for signal. They'll upload automatically.</div>}

      {(pending.length > 0 || rejected.length > 0) && (
        <div className="card stack" style={{ marginTop: '1rem' }}>
          {pending.length > 0 && <div className="row wrap"><span className="pill pending">{pending.length} WITH JUDGES</span><span className="small muted">Points land when a judge approves.</span></div>}
          {mystery.map((f) => (
            <div key={f.id} className="row">
              <img src={f.thumb_url} alt="" loading="lazy" decoding="async" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 10 }} />
              <div className="small"><b>Mystery plant</b><br /><span className="muted">Elegant's guess: {f.ai_common || f.ai_name || 'unknown'}. A judge will name it.</span></div>
            </div>
          ))}
          {rejected.slice(0, 3).map((f) => (
            <div key={f.id} className="row">
              <img src={f.thumb_url} alt="" loading="lazy" decoding="async" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 10, filter: 'grayscale(1)' }} />
              <div className="small"><span className="pill rejected">NOT ACCEPTED</span> <span className="muted">{f.judge_note || "The judges couldn't confirm this one."}</span></div>
            </div>
          ))}
        </div>
      )}

      <div className="section-head">
        <h2>Snap Nature</h2>
        <span className="mono">{mine.size}/{total} snapped</span>
      </div>
      <div className="tabs" style={{ marginBottom: '0.9rem' }}>
        {(['all', 'found', 'missing'] as Filter[]).map((f) => (
          <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'found' ? 'Snapped' : 'Still hiding'}
          </button>
        ))}
      </div>
      <div className="herbarium">
        {shown.map((s) => {
          const f = mine.get(s.id);
          const fi = foundInfo(s.id);
          const isBounty = bounty?.species_id === s.id;
          if (f) {
            return (
              <button key={s.id} className={`specimen found ${s.rarity} ${f.status === 'pending' ? 'pending' : ''}`} onClick={() => setOpen(s)}>
                <span className="art">
                  <img src={f.thumb_url} alt={s.common_name} loading="lazy" decoding="async" />
                  {f.status === 'pending' ? <span className="tag">JUDGING</span> : f.is_first ? <span className="tag first">1ST</span> : f.bounty_mult > 1 ? <span className="tag bounty">×{f.bounty_mult}</span> : null}
                </span>
                <span className="label">
                  <span className="nm">{s.common_name}</span>
                  {f.status === 'pending' ? <span className="pts soon">soon</span> : <span className="pts">+{f.pts ?? s.points}</span>}
                </span>
              </button>
            );
          }
          return (
            <button key={s.id} className={`specimen locked ${s.rarity}`} onClick={() => setOpen(s)} aria-label={`Unknown ${s.rarity} species, ${s.points} points`}>
              <span className="art">
                <span className="lockbox">
                  <Icon name="lock" size={16} />
                  <b>???</b>
                  <span>{s.rarity} · {s.points}</span>
                </span>
                {isBounty ? <span className="tag bounty" style={{ left: 'auto', right: 7 }}>×{bounty?.multiplier}</span> : fi ? <span className="tag seen" title="Found by others">{fi.finders} found</span> : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="section-head">
        <h2>Badges</h2>
        <span className="mono">{earned}/{badges.length}</span>
      </div>
      <div className="badges">
        {badges.map((b) => (
          <div key={b.id} className={`badge ${b.earned ? '' : 'off'}`} title={b.how} onClick={() => toast(`${b.name}: ${b.how}${b.earned ? ' ✓' : ''}`)}>
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
          <div className="polaroid" style={{ maxWidth: '100%' }}>
            <img src={find.photo_url} alt={s.common_name} decoding="async" />
            <div className="cap"><span>{s.common_name}</span><span className="sci">{s.scientific_name}</span></div>
          </div>
        ) : (
          <div className="center" style={{ fontSize: '4rem', filter: 'grayscale(1) brightness(0.4)', opacity: 0.5, padding: '0.5rem 0' }}>{s.emoji}</div>
        )}
        <div className="row spread" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="kicker">{find ? 'In your Snap Nature' : 'Still hiding'}</div>
            <h2 style={{ marginTop: 4 }}>{find ? `${s.emoji} ${s.common_name}` : 'Unknown species'}</h2>
          </div>
          <RarityPill rarity={s.rarity} />
        </div>
        <div className="card fact">
          <div className="fact-lbl">{find ? 'Did you know' : 'Riddle'}</div>
          <div className="hand">{find ? s.fun_fact : s.hint}</div>
        </div>
        <div className="row wrap">
          <span className="pill">{s.points} PTS</span>
          <span className="pill">{s.kind.toUpperCase()}</span>
          {find && s.tags.map((t) => <span key={t} className="pill">{TAG_LABEL[t] ?? t}</span>)}
        </div>
        {info ? (
          <div className="small muted">First found by <b style={{ color: 'var(--text)' }}>{info.first_name}</b>{info.first_team ? ` (${info.first_team})` : ''} · {info.finders} explorer{info.finders > 1 ? 's' : ''} so far</div>
        ) : (
          <div className="small muted">Nobody has found this yet. Be first for <span className="lime">+50%</span>.</div>
        )}
        {find && (
          <div className="small muted">
            {find.status === 'pending' ? 'Waiting for a judge.' : find.status === 'approved' ? 'Approved by a judge.' : 'Elegant agreed.'}
            {find.pts != null && <> · <span className="lime">+{find.pts} pts</span></>}
            {find.is_first && ' · First on campus'}
          </div>
        )}
        {!find && <button className="btn sun big block" onClick={onSnap}><Icon name="snap" size={20} />I found it</button>}
        <button className="btn ghost block" onClick={onClose}>Close</button>
      </div>
    </Sheet>
  );
}
