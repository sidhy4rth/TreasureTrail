import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useGameState, useMyFinds, useSession, useSpecies } from '../lib/game';
import { distanceM, fmtCoord, watchGps, type Fix } from '../lib/geo';
import { loadImage, processPhoto } from '../lib/image';
import { enqueue, type SubmitBody, type SubmitResult } from '../lib/queue';
import type { Species } from '../lib/types';
import { Elegant, Icon, RarityPill, burst } from '../components/ui';

type Phase = 'shoot' | 'pick' | 'sending' | 'done' | 'queued';

export default function Snap() {
  const { session } = useSession();
  const me = session!.player;
  const staff = me.role !== 'player';
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { data: state } = useGameState(15000);
  const { list, byId } = useSpecies();
  const { data: finds } = useMyFinds(me.id, 30000);

  const [fix, setFix] = useState<Fix | null>(null);
  const [gpsErr, setGpsErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('shoot');
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [shot, setShot] = useState<{ fix: Fix; at: Date } | null>(null);
  const [choice, setChoice] = useState<number | null | undefined>(undefined); // undefined = nothing picked, null = not sure
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState('');
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const clickFix = useRef<Fix | null>(null);

  useEffect(
    () =>
      watchGps(
        (f) => {
          setGpsErr(null);
          setFix((prev) => (!prev || f.accuracy <= prev.accuracy + 5 || f.at - prev.at > 15000 ? f : prev));
        },
        setGpsErr,
      ),
    [],
  );

  useEffect(() => {
    const pre = Number(params.get('species'));
    if (pre) setChoice(pre);
  }, [params]);

  const st = state?.settings;
  const aiOn = st?.ai_enabled !== false;
  const dist = fix && st ? distanceM(fix.lat, fix.lng, st.geofence_lat, st.geofence_lng) : null;
  const inside = !st?.geofence_on || (dist != null && st != null && dist <= st.geofence_radius_m);
  const accOk = !!fix && !!st && fix.accuracy <= st.max_accuracy_m;
  const now = Date.now();
  const notStarted = !!st?.starts_at && now < new Date(st.starts_at).getTime();
  const over = !!st?.ends_at && now > new Date(st.ends_at).getTime();
  const gpsReady = !!fix && accOk && inside;
  const canShoot = staff || (gpsReady && !notStarted && !over);

  const owned = useMemo(() => {
    const s = new Set<number>();
    for (const f of finds ?? []) if (f.species_id && f.status !== 'rejected') s.add(f.species_id);
    return s;
  }, [finds]);

  const bountyId = state?.bounty?.species_id;
  const options = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return list
      .filter((s) => !needle || s.common_name.toLowerCase().includes(needle) || s.scientific_name.toLowerCase().includes(needle))
      .sort((a, b) => Number(owned.has(a.id)) - Number(owned.has(b.id)) || Number(b.id === bountyId) - Number(a.id === bountyId) || a.common_name.localeCompare(b.common_name));
  }, [list, q, owned, bountyId]);

  useEffect(() => {
    if (!aiOn && choice === null) setChoice(undefined);
  }, [aiOn, choice]);

  function openCamera() {
    setErr(null);
    clickFix.current = fix;
    fileRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const f = clickFix.current ?? fix;
    if (!f && !staff) {
      setErr('No GPS fix yet. Wait for the green GPS chip, then take the photo.');
      return;
    }
    try {
      const im = await loadImage(file);
      setImg(im);
      setPreview(im.src);
      // Staff testing without GPS get the trail-zone centre.
      const useFix = f ?? { lat: st?.geofence_lat ?? 12.72976, lng: st?.geofence_lng ?? 77.70876, accuracy: 999, at: Date.now() };
      setShot({ fix: useFix, at: new Date() });
      setPhase('pick');
    } catch (er) {
      setErr((er as Error).message);
    }
  }

  async function submit() {
    if (!img || !shot || choice === undefined) return;
    setErr(null);
    setPhase('sending');
    const sp = choice ? byId.get(choice) : undefined;
    let body: SubmitBody | null = null;
    try {
      setStep('Stamping the geotag…');
      const p = await processPhoto(img, {
        lat: shot.fix.lat,
        lng: shot.fix.lng,
        accuracy: shot.fix.accuracy,
        at: shot.at,
        species: sp?.common_name ?? 'Mystery plant',
        player: me.display_name,
        team: session?.team?.name ?? null,
      });
      setPreview(p.previewUrl);
      body = {
        speciesId: choice,
        lat: shot.fix.lat,
        lng: shot.fix.lng,
        accuracy: shot.fix.accuracy,
        capturedAt: shot.at.toISOString(),
        phash: p.phash,
        image: p.image,
        thumb: p.thumb,
      };
      setStep('Uploading & asking the plant AI…');
      const r = await api<SubmitResult>('submit', body);
      setResult(r);
      setPhase('done');
      if (r.status === 'provisional' || r.status === 'approved') {
        const rar = r.species?.rarity;
        burst(rar === 'legendary' ? 'legendary' : r.find?.is_first ? 'big' : 'normal');
        navigator.vibrate?.([30, 40, 60]);
      }
    } catch (e) {
      if (body && e instanceof ApiError && (e.status === 0 || e.status >= 500)) {
        await enqueue(body, sp?.common_name ?? 'Mystery plant');
        setPhase('queued');
        return;
      }
      setErr((e as Error).message);
      setPhase('pick');
    }
  }

  function again() {
    setImg(null);
    setShot(null);
    setChoice(undefined);
    setResult(null);
    setPreview(null);
    setErr(null);
    setQ('');
    setPhase('shoot');
  }

  const chosen: Species | undefined = choice ? byId.get(choice) : undefined;

  return (
    <div className="stack">
      <div className="row spread">
        <Link to="/" className="icon-btn" aria-label="Close"><Icon name="close" /></Link>
        <GpsChip fix={fix} err={gpsErr} accOk={accOk} inside={inside} dist={dist} maxAcc={st?.max_accuracy_m} staff={staff} />
      </div>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} hidden />

      {phase === 'shoot' && (
        <>
          <div className="viewfinder">
            <span className="vf-corners" aria-hidden="true">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" vectorEffect="non-scaling-stroke">
                <path d="M0 14V0h14M86 0h14v14M100 86v14H86M14 100H0V86" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 3 }} />
              </svg>
            </span>
            <div className="vf-inner">
              <Elegant mood="snap" size={96} className="wiggle" />
              <h2>Find a leaf. Get close.</h2>
              <p>Fill the frame with one leaf or flower. Sharp and bright beats far away.</p>
              {chosen && <span className="pill ok" style={{ marginTop: '0.25rem' }}>LOOKING FOR {chosen.emoji} {chosen.common_name.toUpperCase()}</span>}
            </div>
          </div>
          {notStarted && !staff && <div className="notice">The trail opens soon. Hang tight!</div>}
          {over && !staff && <div className="notice">The trail is closed. Head to the ceremony!</div>}
          {!gpsReady && !gpsErr && !staff && <div className="notice">Waiting for a good GPS fix. Step into the open, away from buildings.</div>}
          {gpsErr && <div className="error">{gpsErr}</div>}
          {err && <div className="error">{err}</div>}
          <button className="btn sun big block" onClick={openCamera} disabled={!canShoot}><Icon name="snap" size={20} />Open camera</button>
          {staff && <p className="small muted center">Staff mode: GPS, trail zone and trail times aren't enforced for you.</p>}
        </>
      )}

      {(phase === 'pick' || phase === 'sending') && preview && shot && (
        <>
          <div className="photo-frame">
            <img src={preview} alt="Your photo" />
          </div>
          <div className="meta-line">{fmtCoord(shot.fix.lat, shot.fix.lng)} · ±{Math.round(shot.fix.accuracy)} m · {shot.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>

          {phase === 'sending' ? (
            <div className="card center stack" style={{ alignItems: 'center', padding: '1.5rem 1rem' }}>
              <Elegant mood="think" size={84} className="bob" />
              <b style={{ fontSize: '1.15rem', letterSpacing: '-0.02em' }}>{step}</b>
              <span className="small muted">Keep this screen open.</span>
            </div>
          ) : (
            <>
              <h2>What did you find?</h2>
              <input className="input" placeholder="Search: neem, hibiscus, palm…" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="species-pick">
                {aiOn ? (
                  <button className={`species-opt ask ${choice === null ? 'on' : ''}`} onClick={() => setChoice(null)} style={{ gridColumn: '1 / -1' }}>
                    <Elegant mood="think" size={40} />
                    <span className="nm" style={{ fontSize: '0.95rem' }}>Not sure? Ask Elegant<span className="sub">The plant AI names it for you</span></span>
                  </button>
                ) : (
                  <div className="notice" style={{ gridColumn: '1 / -1' }}>Judges are checking every photo by hand right now. Pick your best guess, and points land when a judge approves.</div>
                )}
                {options.map((s) => {
                  const done = owned.has(s.id);
                  return (
                    <button key={s.id} className={`species-opt ${choice === s.id ? 'on' : ''} ${done ? 'done' : ''}`} disabled={done} onClick={() => setChoice(s.id)}>
                      <span className="em">{s.emoji}</span>
                      <span className="nm">
                        {s.common_name}
                        <span className={`sub ${s.id === bountyId && !done ? 'bounty' : ''}`}>
                          {done ? 'snapped ✓' : s.id === bountyId ? `BOUNTY ×${state?.bounty?.multiplier}` : `${s.points} pts`}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {err && <div className="error">{err}</div>}
              <button className="btn leaf big block" disabled={choice === undefined} onClick={submit}>
                {choice === undefined ? 'Pick a species' : choice === null ? 'Ask Elegant' : `Add ${chosen?.common_name ?? ''} to Snap Nature`}
              </button>
              <button className="btn ghost block" onClick={again}>Retake photo</button>
            </>
          )}
        </>
      )}

      {phase === 'queued' && (
        <div className="card center stack result" style={{ alignItems: 'center', padding: '1.5rem 1rem' }}>
          <Elegant mood="snap" size={92} className="bob" />
          <h2>Saved. Waiting for signal</h2>
          <p className="muted">No internet right now. Your find is safe on this phone with its GPS tag and time, and it uploads automatically when you're back online.</p>
          <button className="btn sun block" onClick={again}><Icon name="snap" size={20} />Snap another</button>
          <Link to="/" className="btn ghost block">Back to trail</Link>
        </div>
      )}

      {phase === 'done' && result && <ResultCard r={result} preview={preview} onAgain={again} onHome={() => nav('/')} />}
    </div>
  );
}

function GpsChip({ fix, err, accOk, inside, dist, maxAcc, staff }: {
  fix: Fix | null; err: string | null; accOk: boolean; inside: boolean; dist: number | null; maxAcc?: number; staff: boolean;
}) {
  if (err) return <span className="gps-chip bad"><span className="dot" />GPS off</span>;
  if (!fix) return <span className="gps-chip wait"><span className="dot" />Finding GPS…</span>;
  if (!inside && !staff) return <span className="gps-chip bad"><span className="dot" />Outside trail zone{dist ? ` (${Math.round(dist)} m)` : ''}</span>;
  if (!accOk && !staff) return <span className="gps-chip wait"><span className="dot" />GPS ±{Math.round(fix.accuracy)} m (need ±{maxAcc})</span>;
  return <span className="gps-chip good"><span className="dot" />GPS locked ±{Math.round(fix.accuracy)} m</span>;
}

function ResultCard({ r, preview, onAgain, onHome }: { r: SubmitResult; preview: string | null; onAgain: () => void; onHome: () => void }) {
  const counted = r.status === 'provisional' || r.status === 'approved';
  const sp = r.species;
  const pts = r.find?.pts ?? 0;
  const aiPct = r.ai.score != null ? Math.round(r.ai.score * 100) : null;
  const aiName = r.ai.common || r.ai.name;
  return (
    <div className="stack result">
      {counted && <div className="result-glow" aria-hidden="true" />}
      {counted && r.find?.is_first && <div><span className="ribbon">FIRST ON CAMPUS</span></div>}
      {counted && <div className="big-pts">+{pts}</div>}
      {preview && (
        <div className="polaroid">
          <img src={preview} alt="" />
          <div className="cap"><span>{sp ? `${sp.emoji} ${sp.common_name}` : 'Mystery plant'}</span>{sp && <span className="sci">{sp.scientific_name}</span>}</div>
        </div>
      )}
      {counted ? (
        <>
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            {sp && <RarityPill rarity={sp.rarity} />}
            {r.find?.is_first && <span className="pill ok">FIRST FINDER +50%</span>}
            {r.bounty_mult > 1 && <span className="pill ok">BOUNTY ×{r.bounty_mult}</span>}
          </div>
          <div className="row" style={{ justifyContent: 'center', alignItems: 'flex-end', gap: '0.5rem', textAlign: 'left' }}>
            <span className="elegant-badge" style={{ width: 52, height: 52 }}><Elegant mood="cheer" size={38} /></span>
            <div className="bubble" style={{ maxWidth: 240 }}>
              {sp?.common_name ?? aiName ? <b>{sp?.common_name ?? aiName}!</b> : <b>Nice find!</b>}{aiPct != null ? <> I'm <span className="lime">{aiPct}%</span> sure.</> : ''} Judges may still double-check.
            </div>
          </div>
          {sp?.fun_fact && (
            <div className="card fact">
              <div className="fact-lbl">Fact unlocked</div>
              <div className="hand">{sp.fun_fact}</div>
            </div>
          )}
        </>
      ) : (
        <>
          <Elegant mood="think" size={88} className="bob" />
          <h2>Sent to the judges</h2>
          <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
            {r.flags.includes('ai_disagrees') && aiName ? <>Elegant thinks this looks more like <b style={{ color: 'var(--text)' }}>{aiName}</b>{aiPct != null ? ` (${aiPct}%)` : ''}. </> : null}
            {r.flags.includes('ai_no_plant') ? "Elegant couldn't spot a plant clearly. " : null}
            {r.flags.includes('unknown_species') && aiName ? <>Elegant says <b style={{ color: 'var(--text)' }}>{aiName}</b>, which isn't on the list yet. </> : null}
            {r.flags.includes('duplicate_photo') ? 'This photo looks like one already uploaded. ' : null}
            {r.flags.includes('ai_off') ? 'Judges are checking every photo by hand right now. ' : null}
            A judge will check it, and your points land the moment it's approved.
          </p>
        </>
      )}
      <button className="btn sun big block" onClick={onAgain}><Icon name="snap" size={20} />Snap another</button>
      <button className="btn ghost block" onClick={onHome}>Back to trail</button>
    </div>
  );
}
