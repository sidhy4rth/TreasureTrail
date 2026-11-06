import { useEffect, useState } from 'react';
import CampusMap from '../components/CampusMap';
import { rpc } from '../lib/api';
import { useGameState, usePoll, useSession, useSpecies } from '../lib/game';
import { watchGps, type Fix } from '../lib/geo';
import type { MapPoint } from '../lib/types';
import { Elegant, TopBar } from '../components/ui';
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
      <TopBar right={<span className="pill">{all.length} FINDS · {speciesHere} SP</span>} />
      <div className="kicker" style={{ marginTop: '0.4rem' }}>Every geotagged find</div>
      <h1 style={{ margin: '0.2rem 0 0.9rem' }}>Campus map</h1>
      <div className="tabs" style={{ marginBottom: '0.75rem' }}>
        <button className={!mineOnly ? 'on' : ''} onClick={() => setMineOnly(false)}>Everyone</button>
        <button className={mineOnly ? 'on' : ''} onClick={() => setMineOnly(true)}>Mine</button>
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
          <span className="elegant-badge"><Elegant mood="wave" size={30} /></span>
          <span>No finds yet. Snap a leaf and be the first pin on the map.</span>
        </div>
      )}
      {lm && lm.hotspots.length > 0 && (
        <div className="card" style={{ marginTop: '0.9rem' }}>
          <div className="kicker lime">Hotspots</div>
          <div className="row wrap" style={{ marginTop: '0.4rem' }}>
            {lm.hotspots.map((h) => <span key={h.near} className="pill">{h.near} · {h.finds}</span>)}
          </div>
        </div>
      )}
      <div className="legend">
        <span><i style={{ background: 'var(--lime)' }} />yours</span>
        <span><i style={{ background: 'var(--r-legendary)' }} />first find</span>
        <span><i style={{ background: 'var(--text)' }} />others</span>
        <span><i style={{ background: '#5EC8F2' }} />you</span>
        <span><i style={{ border: '1px dashed var(--lime)', background: 'transparent' }} />trail zone</span>
      </div>
    </>
  );
}
