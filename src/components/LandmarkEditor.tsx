import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../lib/api';
import { QUICK_NAMES, drawLandmarks, landmarkIcon, satelliteLayer, streetLayer, type Landmark } from '../lib/landmarks';
import { toast } from './ui';

interface Props {
  center: [number, number];
  radius?: number;
}

/** Admin tool: tap the campus (satellite or street view) to place named landmarks like "LC 1". */
export default function LandmarkEditor({ center, radius }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const draftLayer = useRef<L.LayerGroup | null>(null);
  const tiles = useRef<{ sat: L.TileLayer; street: L.TileLayer } | null>(null);
  const [list, setList] = useState<Landmark[]>([]);
  const [draft, setDraft] = useState<{ lat: number; lng: number } | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [short, setShort] = useState('');
  const [view, setView] = useState<'sat' | 'street'>('sat');
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);

  async function load() {
    try {
      const r = await api<{ landmarks: Landmark[] }>('admin', { action: 'landmarks' });
      setList(r.landmarks);
    } catch (e) {
      toast((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { center, zoom: 17 });
    const sat = satelliteLayer().addTo(m);
    const street = streetLayer();
    tiles.current = { sat, street };
    if (radius) L.circle(center, { radius, color: '#FFC93C', weight: 3, dashArray: '8 8', fillOpacity: 0 }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    draftLayer.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => setDraft({ lat: e.latlng.lat, lng: e.latlng.lng }));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    const t = tiles.current;
    if (!m || !t) return;
    if (view === 'sat') {
      t.street.remove();
      t.sat.addTo(m);
    } else {
      t.sat.remove();
      t.street.addTo(m);
    }
  }, [view]);

  useEffect(() => {
    if (layer.current) drawLandmarks(layer.current, list.filter((l) => l.id !== editId), true);
  }, [list, editId]);

  useEffect(() => {
    const g = draftLayer.current;
    if (!g) return;
    g.clearLayers();
    if (draft) {
      const label = short || name;
      if (label) L.marker([draft.lat, draft.lng], { icon: landmarkIcon(label, true), interactive: false }).addTo(g);
      L.marker([draft.lat, draft.lng], { icon: L.divIcon({ html: '<div class="lm-draft"></div>', className: 'lm-wrap', iconSize: [0, 0] }), interactive: false }).addTo(g);
    }
  }, [draft, name, short]);

  function hereGps() {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setDraft({ lat: p.coords.latitude, lng: p.coords.longitude });
        map.current?.setView([p.coords.latitude, p.coords.longitude], 18);
        toast(`Pinned at your spot (±${Math.round(p.coords.accuracy)} m)`);
      },
      () => toast("Couldn't get your location."),
      { enableHighAccuracy: true, timeout: 20000 },
    );
  }

  function startEdit(l: Landmark) {
    setEditId(l.id);
    setName(l.name);
    setShort(l.short);
    setDraft({ lat: l.lat, lng: l.lng });
    map.current?.setView([l.lat, l.lng], 18);
  }

  function clear() {
    setEditId(null);
    setName('');
    setShort('');
    setDraft(null);
  }

  async function save() {
    if (!draft || !name.trim()) return;
    setBusy(true);
    try {
      await api('admin', { action: 'landmark_upsert', id: editId ?? undefined, name, short, lat: draft.lat, lng: draft.lng });
      toast(`${short || name} saved ✓`);
      clear();
      await load();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    try {
      await api('admin', { action: 'landmark_delete', id });
      setConfirmDel(null);
      if (editId === id) clear();
      await load();
    } catch (e) {
      toast((e as Error).message);
    }
  }

  const used = new Set(list.map((l) => l.name.toLowerCase()));

  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>
        Tap a building on the map, name it, save. Finds within 250 m get tagged "near LC 1" on the feed, map, judge queue and export. Or stand at the building and use your GPS.
      </p>
      <div className="row wrap">
        <div className="tabs" style={{ flex: 1, minWidth: 200 }}>
          <button type="button" className={view === 'sat' ? 'on' : ''} onClick={() => setView('sat')}>🛰️ Satellite</button>
          <button type="button" className={view === 'street' ? 'on' : ''} onClick={() => setView('street')}>🗺️ Street</button>
        </div>
        <button type="button" className="btn sm ghost" onClick={hereGps}>📍 Pin where I'm standing</button>
      </div>
      <div ref={el} className="lm-editor-map" />

      <div className="card stack">
        <b>{editId ? 'Edit landmark' : draft ? 'New landmark here' : 'Tap the map to drop a pin'}</b>
        <div className="lm-chips">
          {QUICK_NAMES.map((q) => (
            <button type="button" key={q.name} disabled={used.has(q.name.toLowerCase()) && name !== q.name} onClick={() => { setName(q.name); setShort(q.short); }}>
              {q.short}
            </button>
          ))}
        </div>
        <div className="row wrap">
          <input className="input" style={{ flex: 2, minWidth: 160 }} placeholder="Name, e.g. Learning Centre 1" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Landmark name" />
          <input className="input" style={{ flex: 1, minWidth: 90 }} placeholder="Label, e.g. LC 1" value={short} maxLength={10} onChange={(e) => setShort(e.target.value)} aria-label="Short label on the map" />
        </div>
        <div className="row">
          <button type="button" className="btn leaf grow" disabled={!draft || !name.trim() || busy} onClick={save}>{busy ? 'Saving…' : editId ? 'Save changes' : 'Add landmark'}</button>
          {(draft || editId) && <button type="button" className="btn ghost" onClick={clear}>Cancel</button>}
        </div>
      </div>

      <div className="lm-list">
        {list.length === 0 && <span className="small muted">No landmarks yet.</span>}
        {list.map((l) => (
          <div key={l.id} className="lm-row">
            <span className="pill">{l.short || '—'}</span>
            <b>{l.name}</b>
            {confirmDel === l.id ? (
              <>
                <button type="button" className="btn sm clay" onClick={() => void remove(l.id)}>Delete</button>
                <button type="button" className="btn sm ghost" onClick={() => setConfirmDel(null)}>Keep</button>
              </>
            ) : (
              <>
                <button type="button" className="btn sm ghost" onClick={() => startEdit(l)}>Move / edit</button>
                <button type="button" className="btn sm ghost" aria-label={`Delete ${l.name}`} onClick={() => setConfirmDel(l.id)}>🗑️</button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
