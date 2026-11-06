import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useGameState, useMyFinds, useSession, useSpecies } from '../lib/game';
import { distanceM, fmtCoord, watchGps, type Fix } from '../lib/geo';
import { loadImage, processPhoto } from '../lib/image';
import { enqueue, type SubmitBody, type SubmitResult } from '../lib/queue';
import type { Species } from '../lib/types';
import { RarityPill, Sprig, burst } from '../components/ui';

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
      // Staff testing without GPS get the hunt-zone centre.
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
        <Link to="/" className="btn sm ghost">✕ Close</Link>
        <GpsChip fix={fix} err={gpsErr} accOk={accOk} inside={inside} dist={dist} maxAcc={st?.max_accuracy_m} staff={staff} />
      </div>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} hidden />

      {phase === 'shoot' && (
        <>
          <div className="viewfinder">
            <svg className="vf-bokeh" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              <circle cx="30" cy="60" r="60" fill="#3E9A55" /><circle cx="270" cy="100" r="80" fill="#256B39" /><circle cx="240" cy="340" r="90" fill="#3E9A55" />
              <circle cx="50" cy="330" r="70" fill="#24603A" /><circle cx="150" cy="30" r="40" fill="#5DB86C" /><circle cx="250" cy="220" r="18" fill="#C6F06B" opacity="0.5" />
              <g stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none"><path d="M24 90V64h26" /><path d="M276 90V64h-26" /><path d="M24 310v26h26" /><path d="M276 310v26h-26" /></g>
            </svg>
            <div className="vf-inner">
              <Sprig mood="snap" size={112} className="wiggle" />
              <h2>Find a leaf. Get close.</h2>
              <p>Fill the frame with one leaf or flower. Sharp and bright beats far away.</p>
              {chosen && <span className="pill" style={{ marginTop: '0.25rem' }}>Hunting: {chosen.emoji} {chosen.common_name}</span>}
            </div>
          </div>
          {notStarted && !staff && <div className="notice">The hunt hasn't started yet. Hang tight!</div>}
          {over && !staff && <div className="notice">The hunt is over. Head to the ceremony! 🏆</div>}
          {!gpsReady && !gpsErr && !staff && <div className="notice">Waiting for a good GPS fix. Step into the open, away from buildings.</div>}
          {gpsErr && <div className="error">{gpsErr}</div>}
          {err && <div className="error">{err}</div>}
          <button className="btn sun big block" onClick={openCamera} disabled={!canShoot}>📸 Open camera</button>
          {staff && <p className="small muted center">Staff mode: GPS, geofence and hunt times aren't enforced for you.</p>}
        </>
      )}

      {(phase === 'pick' || phase === 'sending') && preview && shot && (
        <>
          <div className="viewfinder" style={{ aspectRatio: 'auto', background: 'var(--ink)' }}>
            <img src={preview} alt="Your photo" style={{ maxHeight: '42vh', objectFit: 'contain' }} />
          </div>
          <div className="small muted center">📍 {fmtCoord(shot.fix.lat, shot.fix.lng)} · ±{Math.round(shot.fix.accuracy)} m · {shot.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>

          {phase === 'sending' ? (
            <div className="card center stack" style={{ alignItems: 'center', background: '#e3f4ff' }}>
              <Sprig mood="think" size={96} className="bob" />
              <b style={{ fontFamily: 'var(--display)', fontSize: '1.3rem' }}>{step}</b>
              <span className="small muted">Keep this screen open.</span>
            </div>
          ) : (
            <>
              <h2>What did you find?</h2>
              <input className="input" placeholder="Search: neem, hibiscus, palm…" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="species-pick">
                {aiOn ? (
                  <button className={`species-opt ask ${choice === null ? 'on' : ''}`} onClick={() => setChoice(null)} style={{ gridColumn: '1 / -1' }}>
                    <Sprig mood="think" size={42} />
                    <span className="nm" style={{ fontSize: '0.95rem' }}>Not sure? Ask Sprig<br /><span className="small" style={{ fontWeight: 700 }}>The plant AI names it for you</span></span>
                  </button>
                ) : (
                  <div className="notice" style={{ gridColumn: '1 / -1' }}>🙋 Judges are checking every photo by hand right now. Pick your best guess, and points land when a judge approves.</div>
                )}
                {options.map((s) => {
                  const done = owned.has(s.id);
                  return (
                    <button key={s.id} className={`species-opt ${choice === s.id ? 'on' : ''} ${done ? 'done' : ''}`} disabled={done} onClick={() => setChoice(s.id)}>
                      <span className="em">{s.emoji}</span>
                      <span className="nm">
                        {s.common_name}
                        <br />
                        <span className="small" style={{ fontWeight: 800, color: s.id === bountyId && !done ? '#B03A22' : 'var(--muted)' }}>
                          {done ? '✓ in journal' : s.id === bountyId ? `🎯 WANTED ×${state?.bounty?.multiplier}` : `${s.points} pts`}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {err && <div className="error">{err}</div>}
              <button className="btn leaf big block" disabled={choice === undefined} onClick={submit}>
                {choice === undefined ? 'Pick a species' : choice === null ? 'Ask Sprig →' : `Press ${chosen?.common_name ?? ''} into my journal`}
              </button>
              <button className="btn ghost block" onClick={again}>Retake photo</button>
            </>
          )}
        </>
      )}

      {phase === 'queued' && (
        <div className="card center stack result" style={{ alignItems: 'center' }}>
          <Sprig mood="snap" size={110} className="bob" />
          <h2>Saved. Waiting for signal</h2>
          <p className="muted">No internet right now. Your find is safe on this phone with its GPS tag and time, and it uploads automatically when you're back online.</p>
          <button className="btn sun block" onClick={again}>📸 Snap another</button>
          <Link to="/" className="btn ghost block">Back to journal</Link>
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
  if (!inside && !staff) return <span className="gps-chip bad"><span className="dot" />Outside hunt zone{dist ? ` (${Math.round(dist)} m)` : ''}</span>;
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
      {counted && <div className="sunburst" aria-hidden="true" />}
      {counted && r.find?.is_first && <div><span className="ribbon">FIRST ON CAMPUS!</span></div>}
      {counted && <div className="big-pts stroke-title">+{pts}</div>}
      {preview && (
        <div className="polaroid">
          <img src={preview} alt="" />
          <div className="cap">{sp ? `${sp.emoji} ${sp.common_name}` : 'Mystery plant'}</div>
        </div>
      )}
      {counted ? (
        <>
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            {sp && <RarityPill rarity={sp.rarity} />}
            {r.find?.is_first && <span className="pill ok">First Finder +50%</span>}
            {r.bounty_mult > 1 && <span className="pill legendary">WANTED ×{r.bounty_mult}</span>}
          </div>
          <div className="row" style={{ justifyContent: 'center', alignItems: 'flex-end', gap: '0.25rem' }}>
            <Sprig mood="cheer" size={92} />
            <div className="bubble sky" style={{ textAlign: 'left', maxWidth: 210, marginBottom: 40 }}>
              {sp?.common_name ?? aiName ? <>{sp?.common_name ?? aiName}!</> : 'Nice find!'}{aiPct != null ? ` I'm ${aiPct}% sure.` : ''} Judges may still double-check.
            </div>
          </div>
          {sp?.fun_fact && (
            <div className="card fact">
              <div className="fact-lbl">🔓 Fact unlocked</div>
              <div className="hand">{sp.fun_fact}</div>
            </div>
          )}
        </>
      ) : (
        <>
          <Sprig mood="think" size={104} className="bob" />
          <h2>Sent to the judges</h2>
          <p className="muted" style={{ margin: 0 }}>
            {r.flags.includes('ai_disagrees') && aiName ? <>The AI thinks this looks more like <b>{aiName}</b>{aiPct != null ? ` (${aiPct}%)` : ''}. </> : null}
            {r.flags.includes('ai_no_plant') ? "The AI couldn't spot a plant clearly. " : null}
            {r.flags.includes('unknown_species') && aiName ? <>The AI says <b>{aiName}</b>, which isn't on our list yet. </> : null}
            {r.flags.includes('duplicate_photo') ? 'This photo looks like one already uploaded. ' : null}
            {r.flags.includes('ai_off') ? 'Judges are checking every photo by hand right now. ' : null}
            A judge will check it, and your points land the moment it's approved.
          </p>
        </>
      )}
      <button className="btn sun big block" onClick={onAgain}>📸 Snap another</button>
      <button className="btn ghost block" onClick={onHome}>Back to journal</button>
    </div>
  );
}
