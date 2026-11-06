import { useEffect, useState } from 'react';
import CampusMap from '../components/CampusMap';
import { rpc } from '../lib/api';
import { useGameState, usePoll, useSession, useSpecies } from '../lib/game';
import { watchGps, type Fix } from '../lib/geo';
import type { MapPoint } from '../lib/types';
import { Sprig, TopBar } from '../components/ui';
import { useLandmarks } from '../lib/landmarks';

export default function MapPage() {
  const { session } = useSession();
  const me = session!.player;
  const { data: state } = useGameState(30000);
  const { data: points } = usePoll(() => rpc<MapPoint[]>('map_points'), 45000);
  const { data: lm } = useLandmarks(120000);
  const { byId } = useSpecies();
  const [mineOnly, setMineOnly] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);

  useEffect(() => watchGps(setFix, () => {}), []);

  const st = state?.settings;
  const center: [number, number] = st ? [st.geofence_lat, st.geofence_lng] : [12.72976, 77.70876];
  const all = points ?? [];
  const shown = mineOnly ? all.filter((p) => p.player_id === me.id) : all;
  const speciesHere = new Set(all.map((p) => p.species_id)).size;

  return (
    <>
      <TopBar right={<span className="pill">{all.length} finds · {speciesHere} species</span>} />
      <div className="row spread" style={{ marginBottom: '0.75rem' }}>
        <h1>Campus map</h1>
      </div>
      <div className="tabs" style={{ marginBottom: '0.75rem' }}>
        <button className={!mineOnly ? 'on' : ''} onClick={() => setMineOnly(false)}>🌍 Everyone</button>
        <button className={mineOnly ? 'on' : ''} onClick={() => setMineOnly(true)}>{me.emoji} Mine</button>
      </div>
      {st && (
        <CampusMap
          center={center}
          radius={st.geofence_on ? st.geofence_radius_m : undefined}
          points={shown}
          byId={byId}
          highlightPlayer={me.id}
          me={fix}
          landmarks={lm?.landmarks}
        />
      )}
      {points && all.length === 0 && (
        <div className="card row" style={{ marginTop: '0.9rem' }}>
          <Sprig mood="wave" size={64} />
          <b>No finds yet. Snap a leaf and be the first pin on the map!</b>
        </div>
      )}
      {lm && lm.hotspots.length > 0 && (
        <div className="card" style={{ marginTop: '0.9rem' }}>
          <b>🔥 Hotspots</b>
          <div className="row wrap" style={{ marginTop: '0.4rem' }}>
            {lm.hotspots.map((h) => <span key={h.near} className="pill">{h.near} · {h.finds} finds</span>)}
          </div>
        </div>
      )}
      <div className="legend">
        <span><i style={{ background: 'var(--sun)' }} />gold = first find</span>
        <span><i style={{ background: 'var(--lime)' }} />lime = yours</span>
        <span><i style={{ background: '#2A8FD0' }} />blue dot = you</span>
        <span><i style={{ borderStyle: 'dashed', background: 'transparent' }} />hunt zone</span>
      </div>
    </>
  );
}
