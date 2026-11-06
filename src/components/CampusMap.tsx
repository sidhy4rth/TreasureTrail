import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapPoint, Species } from '../lib/types';
import { drawLandmarks, type Landmark } from '../lib/landmarks';

interface Props {
  center: [number, number];
  radius?: number;
  points: MapPoint[];
  byId: Map<number, Species>;
  highlightPlayer?: string;
  me?: { lat: number; lng: number; accuracy: number } | null;
  height?: string;
  zoom?: number;
  interactive?: boolean;
  className?: string;
  landmarks?: Landmark[];
  bigLabels?: boolean;
}

/** Leaflet map with emoji pins. New pins (not seen before) pop in. */
export default function CampusMap({ center, radius, points, byId, highlightPlayer, me, height, zoom = 17, interactive = true, className, landmarks, bigLabels }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fence = useRef<L.Circle | null>(null);
  const meLayer = useRef<L.LayerGroup | null>(null);
  const lmLayer = useRef<L.LayerGroup | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const firstPaint = useRef(true);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, {
      center,
      zoom,
      zoomControl: interactive,
      attributionControl: true,
      dragging: interactive,
      scrollWheelZoom: interactive,
      touchZoom: interactive,
      doubleClickZoom: interactive,
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(m);
    lmLayer.current = L.layerGroup().addTo(m);
    layer.current = L.layerGroup().addTo(m);
    meLayer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    fence.current?.remove();
    if (radius) {
      fence.current = L.circle(center, { radius, color: '#1B2A1F', weight: 3, dashArray: '10 9', fillColor: '#C6F06B', fillOpacity: 0.08 }).addTo(m);
    }
  }, [center[0], center[1], radius]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    for (const p of points) {
      const sp = byId.get(p.species_id);
      const isNew = !firstPaint.current && !seen.current.has(p.id);
      seen.current.add(p.id);
      const mine = highlightPlayer && p.player_id === highlightPlayer;
      const html = `<div class="mpin ${p.first ? 'first' : ''} ${mine ? 'mine' : ''} ${isNew ? 'pin-new' : ''}"><span>${sp?.emoji ?? '🌿'}</span></div>`;
      const sz = p.first ? 46 : 38;
      // Teardrop tip points down-left after the -45° turn; anchor near the bottom of the box.
      const icon = L.divIcon({ html, className: '', iconSize: [sz, sz], iconAnchor: [sz / 2, Math.round(sz * 1.2)], popupAnchor: [0, -sz] });
      const mk = L.marker([p.lat, p.lng], { icon });
      mk.bindPopup(
        `<div style="width:150px"><img src="${p.thumb}" style="width:100%;border-radius:10px;border:2.5px solid #1B2A1F" alt=""/><b style="font-family:'Baloo 2',sans-serif;font-size:16px">${sp?.common_name ?? 'Plant'}</b><br/><span style="color:#4A5A47">${escapeHtml(p.player)}${p.first ? ' · 🥇 first!' : ''}${p.near ? `<br/>📍 near ${escapeHtml(p.near)}` : ''}</span></div>`,
      );
      mk.addTo(g);
    }
    if (points.length) firstPaint.current = false;
  }, [points, byId, highlightPlayer]);

  useEffect(() => {
    if (lmLayer.current) drawLandmarks(lmLayer.current, landmarks ?? [], bigLabels);
  }, [landmarks, bigLabels]);

  useEffect(() => {
    const g = meLayer.current;
    if (!g) return;
    g.clearLayers();
    if (me) {
      L.circle([me.lat, me.lng], { radius: me.accuracy, color: '#2A8FD0', weight: 2, fillColor: '#5EC8F2', fillOpacity: 0.2 }).addTo(g);
      L.circleMarker([me.lat, me.lng], { radius: 8, color: '#fff', weight: 4, fillColor: '#2A8FD0', fillOpacity: 1 }).addTo(g);
    }
  }, [me?.lat, me?.lng, me?.accuracy]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className={className ?? 'map'} style={height ? { height } : undefined} />;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
