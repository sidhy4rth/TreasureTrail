import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapPoint, Species } from '../lib/types';
import { drawLandmarks, featuredLegend, type Landmark } from '../lib/landmarks';

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
  const markers = useRef<Map<string, { mk: L.Marker; sig: string }>>(new Map());
  const lmSig = useRef('');
  const legend = useRef<L.Control | null>(null);
  const meCircle = useRef<L.Circle | null>(null);
  const meDot = useRef<L.CircleMarker | null>(null);

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
      fence.current = L.circle(center, { radius, color: '#C8FF2E', weight: 2, opacity: 0.8, dashArray: '8 8', fillColor: '#C8FF2E', fillOpacity: 0.05 }).addTo(m);
    }
  }, [center[0], center[1], radius]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pins: only add, remove or restyle what changed, so polling never rebuilds the whole map.
  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    const live = new Set<string>();
    for (const p of points) {
      live.add(p.id);
      const sp = byId.get(p.species_id);
      const mine = !!highlightPlayer && p.player_id === highlightPlayer;
      const sig = `${p.species_id}|${p.first ? 1 : 0}|${mine ? 1 : 0}|${sp?.emoji ?? ''}|${p.near ?? ''}`;
      const have = markers.current.get(p.id);
      if (have && have.sig === sig) continue;
      if (have) g.removeLayer(have.mk);
      const isNew = !have && !firstPaint.current && !seen.current.has(p.id);
      seen.current.add(p.id);
      const html = `<div class="mpin ${p.first ? 'first' : ''} ${mine ? 'mine' : ''} ${isNew ? 'pin-new' : ''}"><span>${sp?.emoji ?? '🌿'}</span></div>`;
      const sz = p.first ? 42 : 34;
      // Teardrop tip points down-left after the -45° turn; anchor near the bottom of the box.
      const icon = L.divIcon({ html, className: '', iconSize: [sz, sz], iconAnchor: [sz / 2, Math.round(sz * 1.2)], popupAnchor: [0, -sz] });
      const mk = L.marker([p.lat, p.lng], { icon });
      // Popup HTML is built only when someone actually taps the pin.
      mk.bindPopup(
        () =>
          `<div style="width:160px"><img src="${p.thumb}" loading="lazy" decoding="async" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;margin-bottom:6px" alt=""/><b style="font-size:15px;letter-spacing:-0.02em">${escapeHtml(sp?.common_name ?? 'Plant')}</b><br/><span style="color:#9AA39A;font-size:12px">${escapeHtml(p.player)}${p.first ? ' · <span style="color:#F5C451">first on campus</span>' : ''}${p.near ? `<br/>near ${escapeHtml(p.near)}` : ''}</span></div>`,
      );
      mk.addTo(g);
      markers.current.set(p.id, { mk, sig });
    }
    for (const [id, { mk }] of markers.current) {
      if (!live.has(id)) {
        g.removeLayer(mk);
        markers.current.delete(id);
      }
    }
    if (points.length) firstPaint.current = false;
  }, [points, byId, highlightPlayer]);

  // Landmarks and the HQ legend: redraw only when the landmark list itself changes,
  // so the HQ animation never restarts on a poll.
  useEffect(() => {
    const m = map.current;
    const g = lmLayer.current;
    if (!m || !g) return;
    const list = landmarks ?? [];
    const sig = JSON.stringify([list.map((l) => [l.id, l.name, l.short, l.lat, l.lng, !!l.featured]), !!bigLabels]);
    if (sig === lmSig.current) return;
    lmSig.current = sig;
    drawLandmarks(g, list, bigLabels);
    legend.current?.remove();
    legend.current = null;
    const featured = list.filter((l) => l.featured);
    if (featured.length) legend.current = featuredLegend(featured, bigLabels).addTo(m);
  }, [landmarks, bigLabels]);

  // Your position: move the existing dot instead of recreating it on every GPS fix.
  useEffect(() => {
    const g = meLayer.current;
    if (!g) return;
    if (!me) {
      g.clearLayers();
      meCircle.current = null;
      meDot.current = null;
      return;
    }
    const ll: L.LatLngExpression = [me.lat, me.lng];
    if (meCircle.current && meDot.current) {
      meCircle.current.setLatLng(ll).setRadius(me.accuracy);
      meDot.current.setLatLng(ll);
    } else {
      meCircle.current = L.circle(ll, { radius: me.accuracy, color: '#5EC8F2', weight: 1, fillColor: '#5EC8F2', fillOpacity: 0.15, interactive: false }).addTo(g);
      meDot.current = L.circleMarker(ll, { radius: 7, color: '#10241A', weight: 3, fillColor: '#5EC8F2', fillOpacity: 1, interactive: false }).addTo(g);
    }
  }, [me?.lat, me?.lng, me?.accuracy]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className={className ?? 'map'} style={height ? { height } : undefined} />;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
