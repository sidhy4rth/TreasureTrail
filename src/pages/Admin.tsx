import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import '../staff.css';
import { api } from '../lib/api';
import { fetchSpecies, fmtCountdown, serverOffset, useGameState, useNow, useSession } from '../lib/game';
import type { Rarity, Role, Settings, Species } from '../lib/types';
import CampusMap from '../components/CampusMap';
import { Logo, RarityPill, Sheet, Spinner, toast } from '../components/ui';
import { StaffGate } from './Judge';
import LandmarkEditor from '../components/LandmarkEditor';

const toLocal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

async function run<T>(body: Record<string, unknown>, ok?: string): Promise<T | null> {
  try {
    const r = await api<T>('admin', body);
    if (ok) toast(ok);
    return r;
  } catch (e) {
    toast(`⚠️ ${(e as Error).message}`);
    return null;
  }
}

// ------------------------------------------------------------------ event settings
function EventSection({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [f, setF] = useState(() => ({
    event_name: settings.event_name,
    starts_at: toLocal(settings.starts_at),
    ends_at: toLocal(settings.ends_at),
    geofence_on: settings.geofence_on,
    geofence_lat: String(settings.geofence_lat),
    geofence_lng: String(settings.geofence_lng),
    geofence_radius_m: settings.geofence_radius_m,
    max_accuracy_m: settings.max_accuracy_m,
  }));
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    setBusy(true);
    const r = await run(
      {
        action: 'settings',
        patch: {
          event_name: f.event_name,
          starts_at: fromLocal(f.starts_at),
          ends_at: fromLocal(f.ends_at),
          geofence_on: f.geofence_on,
          geofence_lat: Number(f.geofence_lat),
          geofence_lng: Number(f.geofence_lng),
          geofence_radius_m: f.geofence_radius_m,
          max_accuracy_m: f.max_accuracy_m,
        },
      },
      'Event settings saved',
    );
    setBusy(false);
    if (r) onSaved();
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return toast("This browser can't share location.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setF((x) => ({ ...x, geofence_lat: p.coords.latitude.toFixed(6), geofence_lng: p.coords.longitude.toFixed(6) }));
        setLocating(false);
        toast(`Centre set (±${Math.round(p.coords.accuracy)} m). Remember to save.`);
      },
      (e) => {
        setLocating(false);
        toast(`⚠️ ${e.message || 'Location failed'}`);
      },
      { enableHighAccuracy: true, timeout: 20000 },
    );
  };

  const lat = Number(f.geofence_lat);
  const lng = Number(f.geofence_lng);
  const validCentre = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

  return (
    <section className="card st-section">
      <h2>Event</h2>
      <div className="stack">
        <div className="field">
          <label htmlFor="ev-name">Event name</label>
          <input id="ev-name" className="input" value={f.event_name} onChange={(e) => set('event_name', e.target.value)} />
        </div>
        <div className="st-row2 st-dates">
          <div className="field">
            <label htmlFor="ev-start">Starts</label>
            <input id="ev-start" type="datetime-local" className="input" value={f.starts_at} onChange={(e) => set('starts_at', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ev-end">Ends</label>
            <input id="ev-end" type="datetime-local" className="input" value={f.ends_at} onChange={(e) => set('ends_at', e.target.value)} />
          </div>
        </div>
        <div className="row wrap">
          <button className="btn sm ghost" onClick={() => set('starts_at', toLocal(new Date().toISOString()))}>
            Start now
          </button>
          <button className="btn sm ghost" onClick={() => set('ends_at', toLocal(new Date(Date.now() + 2 * 3600_000).toISOString()))}>
            End in 2 h
          </button>
          <button className="btn sm ghost" onClick={() => set('ends_at', toLocal(new Date(Date.now() + 3600_000).toISOString()))}>
            End in 1 h
          </button>
          <button
            className="btn sm ghost"
            onClick={() => {
              set('starts_at', '');
              set('ends_at', '');
            }}
          >
            Clear times
          </button>
        </div>
        <hr className="dash" />
        <label className="st-toggle">
          <input type="checkbox" checked={f.geofence_on} onChange={(e) => set('geofence_on', e.target.checked)} />
          Only accept photos taken inside the campus circle
        </label>
        <div className="st-row2">
          <div className="field">
            <label htmlFor="ev-lat">Centre latitude</label>
            <input id="ev-lat" className="input" inputMode="decimal" value={f.geofence_lat} onChange={(e) => set('geofence_lat', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ev-lng">Centre longitude</label>
            <input id="ev-lng" className="input" inputMode="decimal" value={f.geofence_lng} onChange={(e) => set('geofence_lng', e.target.value)} />
          </div>
        </div>
        <button className="btn sm ghost" onClick={useMyLocation} disabled={locating}>
          {locating ? 'Finding you…' : 'Use my current location as centre'}
        </button>
        <div className="field">
          <label htmlFor="ev-radius">Radius: {f.geofence_radius_m} m</label>
          <input
            id="ev-radius"
            type="range"
            className="st-range"
            min={100}
            max={2000}
            step={25}
            value={f.geofence_radius_m}
            onChange={(e) => set('geofence_radius_m', Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="ev-acc">Reject GPS fuzzier than: ±{f.max_accuracy_m} m</label>
          <input
            id="ev-acc"
            type="range"
            className="st-range"
            min={20}
            max={300}
            step={10}
            value={f.max_accuracy_m}
            onChange={(e) => set('max_accuracy_m', Number(e.target.value))}
          />
        </div>
        {validCentre && (
          <CampusMap
            key={`${lat},${lng}`}
            center={[lat, lng]}
            radius={f.geofence_on ? f.geofence_radius_m : undefined}
            points={[]}
            byId={new Map()}
            zoom={15}
            className="st-minimap"
          />
        )}
        <button className="btn leaf block" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save event settings'}
        </button>
        <div className="small muted">Organisers (judge/admin) skip the time window, GPS accuracy and campus circle, so you can test from anywhere.</div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ live controls
interface BountyRow {
  id: number;
  species_id: number;
  multiplier: number;
  starts_at: string;
  ends_at: string;
}

/** Kill switch for the plant-ID AI. Off = every find goes to the judges. */
function AiSwitch({ settings, onChange }: { settings: Settings; onChange: () => void }) {
  const on = settings.ai_enabled !== false;
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const flip = async () => {
    setBusy(true);
    const r = await run({ action: 'settings', patch: { ai_enabled: !on } }, on ? 'AI off. Judges check every photo now.' : 'AI back on.');
    setBusy(false);
    setConfirm(false);
    if (r) onChange();
  };
  return (
    <div className="stack">
      <h3>Plant AI · {on ? 'ON' : 'OFF (judges only)'}</h3>
      <div className="small muted">
        {on
          ? 'If the AI runs out of checks or misbehaves, switch it off: every new find goes to the judge queue and "Ask Elegant" is hidden.'
          : 'Every new find waits for a judge. Switch the AI back on to give instant points again.'}
      </div>
      {confirm ? (
        <div className="row">
          <button className={`btn grow ${on ? 'clay' : 'leaf'}`} disabled={busy} onClick={flip}>{on ? 'Yes, switch AI off' : 'Yes, switch AI on'}</button>
          <button className="btn ghost" onClick={() => setConfirm(false)}>Cancel</button>
        </div>
      ) : (
        <button className={`btn block ${on ? 'ghost' : 'leaf'}`} onClick={() => setConfirm(true)}>{on ? 'Switch to judges only' : 'Turn the AI back on'}</button>
      )}
    </div>
  );
}

function LiveSection({ settings, species, onChange }: { settings: Settings; species: Species[]; onChange: () => void }) {
  const [bounties, setBounties] = useState<BountyRow[]>([]);
  const [sid, setSid] = useState<number | ''>('');
  const [mult, setMult] = useState(2);
  const [mins, setMins] = useState(15);
  const [busy, setBusy] = useState(false);
  const now = useNow(1000);
  const byId = useMemo(() => new Map(species.map((s) => [s.id, s])), [species]);

  const load = async () => {
    const r = await run<{ bounties: BountyRow[] }>({ action: 'bounties' });
    if (r) setBounties(r.bounties);
  };
  useEffect(() => {
    void load();
  }, []);

  const active = bounties.filter((b) => new Date(b.ends_at).getTime() > now && new Date(b.starts_at).getTime() <= now);

  const launch = async () => {
    if (sid === '') return toast('Pick a species first.');
    setBusy(true);
    const r = await run({ action: 'bounty', speciesId: sid, multiplier: mult, minutes: mins }, `Bounty live for ${mins} min`);
    setBusy(false);
    if (r) {
      void load();
      onChange();
    }
  };

  const freeze = async () => {
    if (await run({ action: settings.frozen ? 'reveal' : 'freeze' }, settings.frozen ? 'Revealed. Watch the projector.' : 'Ranks frozen')) onChange();
  };

  return (
    <section className="card st-section">
      <h2>Live controls</h2>
      <div className="stack">
        <div className="st-big-btns">
          <button className={`btn big ${settings.frozen ? 'sun' : ''}`} onClick={freeze}>
            {settings.frozen ? 'Reveal results' : 'Freeze board'}
          </button>
          <Link className="btn big ghost" to="/live" target="_blank">
            Open projector
          </Link>
        </div>
        <div className="small muted">
          {settings.frozen
            ? `Frozen since ${new Date(settings.frozen_at!).toLocaleTimeString()}. Players keep scoring in secret. Reveal plays a countdown on /live.`
            : 'Freeze in the last 10–15 minutes for suspense. Reveal plays the countdown on the projector.'}
        </div>
        <hr className="dash" />
        <AiSwitch settings={settings} onChange={onChange} />
        <hr className="dash" />
        <h3>Bounty</h3>
        <select className="input" value={sid} onChange={(e) => setSid(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Pick a species…</option>
          {species.map((s) => (
            <option key={s.id} value={s.id}>
              {s.emoji} {s.common_name} ({s.points} pts)
            </option>
          ))}
        </select>
        <div className="row wrap">
          <span className="small" style={{ fontWeight: 800 }}>
            Multiplier
          </span>
          {[2, 3].map((m) => (
            <button key={m} className={`st-choice ${mult === m ? 'on' : ''}`} onClick={() => setMult(m)}>
              ×{m}
            </button>
          ))}
          <span className="small" style={{ fontWeight: 800, marginLeft: '0.5rem' }}>
            For
          </span>
          {[5, 10, 15, 30].map((m) => (
            <button key={m} className={`st-choice ${mins === m ? 'on' : ''}`} onClick={() => setMins(m)}>
              {m}m
            </button>
          ))}
        </div>
        <button className="btn sun block" onClick={launch} disabled={busy || sid === ''}>
          Launch bounty
        </button>
        {active.map((b) => {
          const sp = byId.get(b.species_id);
          return (
            <div key={b.id} className="bounty">
              <div className="em">{sp?.emoji ?? '🌿'}</div>
              <div className="grow">
                <div style={{ fontWeight: 700 }}>Bounty · {sp?.common_name ?? `#${b.species_id}`}</div>
                <div className="small">
                  ×{b.multiplier} · {fmtCountdown(new Date(b.ends_at).getTime() - now)} left
                </div>
              </div>
              <button
                className="btn sm"
                onClick={async () => {
                  if (await run({ action: 'bounty_end', id: b.id }, 'Bounty ended')) {
                    void load();
                    onChange();
                  }
                }}
              >
                End now
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ species
interface AdminSpecies extends Species {
  match_names: string[];
  active: boolean;
}

const EMPTY_SPECIES = {
  id: null as number | null,
  common_name: '',
  scientific_name: '',
  match_names: '',
  kind: 'tree',
  rarity: 'common' as Rarity,
  points: '',
  emoji: '🌿',
  hint: '',
  fun_fact: '',
  tags: '',
  active: true,
};

function SpeciesSection({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<AdminSpecies[] | null>(null);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<typeof EMPTY_SPECIES | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await run<{ species: AdminSpecies[] }>({ action: 'species_list' });
    if (r) setRows(r.species);
  };
  useEffect(() => {
    void load();
  }, []);

  const shown = (rows ?? []).filter((s) => {
    const t = q.trim().toLowerCase();
    return !t || s.common_name.toLowerCase().includes(t) || s.scientific_name.toLowerCase().includes(t);
  });

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    const r = await run(
      {
        action: 'species_upsert',
        species: { ...edit, points: edit.points === '' ? null : Number(edit.points) },
      },
      edit.id ? 'Species updated' : 'Species added',
    );
    setBusy(false);
    if (r) {
      setEdit(null);
      void load();
      void fetchSpecies(true);
      onChange();
    }
  };

  const openEdit = (s: AdminSpecies) =>
    setEdit({
      id: s.id,
      common_name: s.common_name,
      scientific_name: s.scientific_name,
      match_names: s.match_names.join(', '),
      kind: s.kind,
      rarity: s.rarity,
      points: String(s.points),
      emoji: s.emoji,
      hint: s.hint,
      fun_fact: s.fun_fact,
      tags: s.tags.join(', '),
      active: s.active,
    });

  const toggle = async (s: AdminSpecies) => {
    const r = await run({ action: 'species_toggle', id: s.id, active: !s.active }, s.active ? 'Hidden from players' : 'Back in the game');
    if (r) {
      void load();
      void fetchSpecies(true);
    }
  };

  return (
    <section className="card st-section">
      <div className="row spread wrap" style={{ marginBottom: '0.75rem' }}>
        <h2 style={{ margin: 0 }}>Species ({rows?.filter((r) => r.active).length ?? '…'} active)</h2>
        <button className="btn sm leaf" onClick={() => setEdit({ ...EMPTY_SPECIES })}>
          + Add species
        </button>
      </div>
      <input className="input" placeholder="Search species" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: '0.6rem' }} />
      {!rows ? (
        <Spinner />
      ) : (
        <div className="st-tablewrap">
          <table className="simple">
            <thead>
              <tr>
                <th></th>
                <th>Name</th>
                <th>Rarity</th>
                <th>Pts</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.id} className={s.active ? '' : 'st-inactive'}>
                  <td style={{ fontSize: '1.3rem' }}>{s.emoji}</td>
                  <td onClick={() => openEdit(s)} style={{ cursor: 'pointer' }}>
                    <b>{s.common_name}</b>
                    <div className="small muted">
                      <i>{s.scientific_name}</i>
                    </div>
                  </td>
                  <td>
                    <RarityPill rarity={s.rarity} />
                  </td>
                  <td>{s.points}</td>
                  <td>
                    <input type="checkbox" checked={s.active} onChange={() => void toggle(s)} aria-label={`Active: ${s.common_name}`} />
                  </td>
                  <td>
                    <button className="btn sm ghost" onClick={() => openEdit(s)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && (
        <Sheet onClose={() => setEdit(null)}>
          <div className="stack">
            <h3>{edit.id ? 'Edit species' : 'Add species'}</h3>
            <div className="st-row2">
              <div className="field">
                <label>Common name</label>
                <input className="input" value={edit.common_name} onChange={(e) => setEdit({ ...edit, common_name: e.target.value })} />
              </div>
              <div className="field">
                <label>Emoji</label>
                <input className="input" value={edit.emoji} onChange={(e) => setEdit({ ...edit, emoji: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Scientific name (what the AI returns)</label>
              <input className="input" value={edit.scientific_name} onChange={(e) => setEdit({ ...edit, scientific_name: e.target.value })} placeholder="Azadirachta indica" />
            </div>
            <div className="field">
              <label>Other accepted names (comma separated; “Genus *” accepts the whole genus)</label>
              <input className="input" value={edit.match_names} onChange={(e) => setEdit({ ...edit, match_names: e.target.value })} placeholder="Ficus *, Ficus religiosa" />
            </div>
            <div className="st-row3">
              <div className="field">
                <label>Kind</label>
                <select className="input" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>
                  {['tree', 'shrub', 'herb', 'palm', 'climber', 'grass'].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Rarity</label>
                <select
                  className="input"
                  value={edit.rarity}
                  onChange={(e) => setEdit({ ...edit, rarity: e.target.value as Rarity, points: '' })}
                >
                  {['common', 'uncommon', 'rare', 'legendary'].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Points</label>
                <input
                  className="input"
                  inputMode="numeric"
                  value={edit.points}
                  placeholder={String({ common: 10, uncommon: 20, rare: 40, legendary: 80 }[edit.rarity])}
                  onChange={(e) => setEdit({ ...edit, points: e.target.value.replace(/\D/g, '') })}
                />
              </div>
            </div>
            <div className="field">
              <label>Riddle hint (shown on the locked card)</label>
              <textarea className="input" value={edit.hint} onChange={(e) => setEdit({ ...edit, hint: e.target.value })} />
            </div>
            <div className="field">
              <label>Fun fact (shown after it's found + on the projector)</label>
              <textarea className="input" value={edit.fun_fact} onChange={(e) => setEdit({ ...edit, fun_fact: e.target.value })} />
            </div>
            <div className="field">
              <label>Tags (native, medicinal, pollinator, invasive, fruit, sacred, shade)</label>
              <input className="input" value={edit.tags} onChange={(e) => setEdit({ ...edit, tags: e.target.value })} />
            </div>
            <div className="st-row2">
              <button className="btn ghost" onClick={() => setEdit(null)}>
                Cancel
              </button>
              <button className="btn leaf" onClick={save} disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ players
interface AdminPlayer {
  id: string;
  display_name: string;
  student_id: string;
  team_id: string | null;
  role: Role;
  emoji: string;
  team_name: string | null;
  team_code: string | null;
  locked_until: string | null;
  finds: { provisional: number; pending: number; approved: number; rejected: number };
}

function PlayerRow({ p, meId, onChanged }: { p: AdminPlayer; meId: string; onChanged: () => void }) {
  const [mode, setMode] = useState<null | 'pin' | 'delete'>(null);
  const [pin, setPin] = useState('');
  const counted = p.finds.provisional + p.finds.approved;
  return (
    <tr>
      <td>
        <b>
          {p.emoji} {p.display_name}
        </b>
        <div className="small muted">{p.student_id}</div>
        {mode === 'pin' && (
          <div className="st-inline">
            <input className="input" inputMode="numeric" maxLength={4} placeholder="New PIN" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
            <button
              className="btn sm leaf"
              disabled={pin.length !== 4}
              onClick={async () => {
                if (await run({ action: 'reset_pin', playerId: p.id, pin }, `PIN reset for ${p.display_name}`)) {
                  setMode(null);
                  setPin('');
                }
              }}
            >
              Set
            </button>
            <button className="btn sm ghost" onClick={() => setMode(null)}>
              Cancel
            </button>
          </div>
        )}
        {mode === 'delete' && (
          <div className="st-inline">
            <span className="small" style={{ fontWeight: 800, color: '#9a3412' }}>
              Delete {p.display_name} and all {counted + p.finds.pending + p.finds.rejected} finds?
            </span>
            <button
              className="btn sm clay"
              onClick={async () => {
                if (await run({ action: 'delete_player', playerId: p.id }, 'Player deleted')) onChanged();
              }}
            >
              Delete
            </button>
            <button className="btn sm ghost" onClick={() => setMode(null)}>
              Cancel
            </button>
          </div>
        )}
      </td>
      <td>{p.team_name ? `${p.team_name} (${p.team_code})` : <span className="muted">Solo</span>}</td>
      <td>
        <select
          className="input"
          style={{ padding: '0.3rem 0.4rem', fontSize: '0.85rem', minWidth: '5.6rem' }}
          value={p.role}
          disabled={p.id === meId}
          onChange={async (e) => {
            if (await run({ action: 'set_role', playerId: p.id, role: e.target.value }, 'Role updated')) onChanged();
          }}
        >
          <option value="player">player</option>
          <option value="judge">judge</option>
          <option value="admin">admin</option>
        </select>
      </td>
      <td className="small">
        <span style={{ fontFamily: 'var(--st-mono)', whiteSpace: 'nowrap' }} title={`${counted} counted · ${p.finds.pending} waiting · ${p.finds.rejected} rejected`}>
          {counted}<span className="muted"> / </span>{p.finds.pending}<span className="muted"> / </span>{p.finds.rejected}
        </span>
        {p.locked_until && new Date(p.locked_until).getTime() > Date.now() && <div className="pill rejected">locked</div>}
      </td>
      <td>
        <div className="row" style={{ gap: '0.3rem' }}>
          <button className="btn sm ghost" onClick={() => setMode('pin')}>
            PIN
          </button>
          {p.id !== meId && (
            <button className="btn sm ghost" onClick={() => setMode('delete')}>
              🗑
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function PlayersSection({ meId }: { meId: string }) {
  const [data, setData] = useState<{ players: AdminPlayer[]; teams: { id: string }[] } | null>(null);
  const [q, setQ] = useState('');
  const load = async () => {
    const r = await run<{ players: AdminPlayer[]; teams: { id: string }[] }>({ action: 'players' });
    if (r) setData(r);
  };
  useEffect(() => {
    void load();
  }, []);
  const shown = (data?.players ?? []).filter((p) => {
    const t = q.trim().toLowerCase();
    return !t || p.display_name.toLowerCase().includes(t) || p.student_id.toLowerCase().includes(t) || (p.team_name ?? '').toLowerCase().includes(t);
  });
  return (
    <section className="card st-section">
      <div className="row spread wrap" style={{ marginBottom: '0.75rem' }}>
        <h2 style={{ margin: 0 }}>
          Players ({data?.players.length ?? '…'}) · Crews ({data?.teams.length ?? '…'})
        </h2>
        <button className="btn sm ghost" onClick={() => void load()}>
          ↻ Refresh
        </button>
      </div>
      <input className="input" placeholder="Search name, student ID or crew" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: '0.6rem' }} />
      {!data ? (
        <Spinner />
      ) : (
        <div className="st-tablewrap">
          <table className="simple">
            <thead>
              <tr>
                <th>Player</th>
                <th>Crew</th>
                <th>Role</th>
                <th style={{ whiteSpace: 'nowrap' }}>Ok / wait / no</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <PlayerRow key={p.id} p={p} meId={meId} onChanged={() => void load()} />
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No players yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ export + danger
interface ExportRow {
  id: string;
  captured_at: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  near: string | null;
  status: string;
  species_common: string | null;
  species_scientific: string | null;
  player_name: string | null;
  student_id: string | null;
  team: string | null;
  photo_url: string;
  ai_name: string | null;
  ai_score: number | null;
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function ExportSection() {
  const [busy, setBusy] = useState(false);
  const get = async () => {
    setBusy(true);
    const r = await run<{ rows: ExportRow[] }>({ action: 'export' });
    setBusy(false);
    return r?.rows ?? null;
  };
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const csv = async () => {
    const rows = await get();
    if (!rows) return;
    const cols: (keyof ExportRow)[] = ['captured_at', 'species_common', 'species_scientific', 'status', 'lat', 'lng', 'accuracy_m', 'near', 'player_name', 'student_id', 'team', 'ai_name', 'ai_score', 'photo_url', 'id'];
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    download(`campus-plant-inventory-${stamp}.csv`, [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n'), 'text/csv');
    toast(`📄 ${rows.length} finds exported`);
  };
  const geojson = async () => {
    const rows = await get();
    if (!rows) return;
    const fc = {
      type: 'FeatureCollection',
      features: rows
        .filter((r) => r.status !== 'rejected')
        .map((r) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
          properties: { species: r.species_common, scientific: r.species_scientific, status: r.status, captured_at: r.captured_at, accuracy_m: r.accuracy_m, finder: r.player_name, team: r.team, photo: r.photo_url },
        })),
    };
    download(`campus-plant-inventory-${stamp}.geojson`, JSON.stringify(fc, null, 1), 'application/geo+json');
    toast(`🗺️ ${fc.features.length} finds exported`);
  };
  return (
    <section className="card st-section">
      <h2>Campus plant inventory</h2>
      <div className="small muted" style={{ marginBottom: '0.75rem' }}>
        Every geotagged find with species, time and photo link, for the records. GeoJSON opens in QGIS, geojson.io or Google Earth (rejected finds left out).
      </div>
      <div className="st-row2">
        <button className="btn" onClick={csv} disabled={busy}>
          Download CSV
        </button>
        <button className="btn" onClick={geojson} disabled={busy}>
          Download GeoJSON
        </button>
      </div>
    </section>
  );
}

function DangerSection({ onReset }: { onReset: () => void }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <section className="card st-section st-danger">
      <h2>Danger zone</h2>
      <div className="small muted" style={{ marginBottom: '0.6rem' }}>
        Deletes every find, photo, crew, bounty and player account (organiser accounts stay). Use it to wipe test data before the trail opens. This can't be undone.
      </div>
      <div className="st-inline">
        <input className="input" placeholder="Type RESET" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <button
          className="btn clay"
          disabled={typed !== 'RESET' || busy}
          onClick={async () => {
            setBusy(true);
            const r = await run<{ deleted_finds: number }>({ action: 'reset', confirm: 'RESET' });
            setBusy(false);
            if (r) {
              toast(`🧹 Reset done: ${r.deleted_finds} finds removed`);
              setTyped('');
              onReset();
            }
          }}
        >
          Reset all game data
        </button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ page
function AdminPanel() {
  const { session, logout } = useSession();
  const { data: state, reload } = useGameState(15000);
  const [species, setSpecies] = useState<Species[]>([]);
  const [epoch, setEpoch] = useState(0);
  const now = useNow(1000) + serverOffset(state);

  useEffect(() => {
    fetchSpecies(true).then(setSpecies).catch(() => {});
  }, [epoch]);

  const refresh = () => {
    void reload();
    setEpoch((e) => e + 1);
  };

  const s = state?.settings;
  let status = 'No times set: the trail is open';
  if (s?.starts_at && now < new Date(s.starts_at).getTime()) status = `Trail opens in ${fmtCountdown(new Date(s.starts_at).getTime() - now)}`;
  else if (s?.ends_at && now < new Date(s.ends_at).getTime()) status = `Live: ${fmtCountdown(new Date(s.ends_at).getTime() - now)} left`;
  else if (s?.ends_at) status = 'Trail closed';

  return (
    <div className="st-wrap">
      <div className="st-head">
        <div className="row">
          <Logo size={38} />
          <div>
            <div className="st-kicker">TREASURE TRAIL · organisers</div>
            <h2>Admin</h2>
            <div className="small muted">
              {session?.player.emoji} {session?.player.display_name} · {status}
              {s?.frozen ? ' · frozen' : ''}
            </div>
          </div>
        </div>
        <div className="st-links">
          <Link className="btn sm ghost" to="/live" target="_blank">
            Projector
          </Link>
          <Link className="btn sm ghost" to="/judge">
            Judge{state?.stats.pending ? ` (${state.stats.pending})` : ''}
          </Link>
          <Link className="btn sm ghost" to="/poster" target="_blank">
            Poster
          </Link>
          <Link className="btn sm ghost" to="/">
            Play
          </Link>
          <button className="btn sm ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </div>

      {state && (
        <div className="card ink" style={{ marginBottom: '1rem' }}>
          <div className="st-stats">
            <div className="stat">
              <b>{state.stats.players}</b>
              <span>players</span>
            </div>
            <div className="stat">
              <b>{state.stats.teams}</b>
              <span>crews</span>
            </div>
            <div className="stat">
              <b>{state.stats.finds}</b>
              <span>counted finds</span>
            </div>
            <div className="stat">
              <b>{state.stats.pending}</b>
              <span>to judge</span>
            </div>
            <div className="stat">
              <b>
                {state.found.length}/{species.length}
              </b>
              <span>species found</span>
            </div>
          </div>
        </div>
      )}

      {!state || !s ? (
        <Spinner />
      ) : (
        <div className="st-grid two">
          <div className="stack">
            <LiveSection settings={s} species={species} onChange={refresh} />
            <EventSection key={`${s.event_name}|${s.starts_at}|${s.ends_at}|${s.geofence_lat}|${s.geofence_lng}|${s.geofence_radius_m}|${s.geofence_on}|${s.max_accuracy_m}`} settings={s} onSaved={refresh} />
            <section className="card st-section">
              <h2>Campus landmarks</h2>
              <LandmarkEditor center={[s.geofence_lat, s.geofence_lng]} radius={s.geofence_on ? s.geofence_radius_m : undefined} />
            </section>
            <ExportSection />
          </div>
          <div className="stack">
            <SpeciesSection onChange={refresh} />
            <PlayersSection key={epoch} meId={session!.player.id} />
            <DangerSection onReset={refresh} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function Admin() {
  return (
    <StaffGate roles={['admin']} title="Admin">
      <AdminPanel />
    </StaffGate>
  );
}
