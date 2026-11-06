import L from 'leaflet';
import { rpc } from './api';
import { usePoll } from './game';
import '../landmarks.css';

export interface Landmark {
  id: number;
  name: string;
  short: string;
  lat: number;
  lng: number;
}

export interface Hotspot {
  near: string;
  finds: number;
}

export interface LandmarksState {
  landmarks: Landmark[];
  hotspots: Hotspot[];
}

export const useLandmarks = (ms = 30000) => usePoll(() => rpc<LandmarksState>('landmarks_state'), ms);

export const landmarkLabel = (l: Pick<Landmark, 'name' | 'short'>) => l.short || l.name;

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Cartoon signboard marker for a campus landmark. */
export function landmarkIcon(label: string, big = false) {
  return L.divIcon({
    html: `<div class="lm-sign ${big ? 'big' : ''}"><span>${esc(label)}</span></div>`,
    className: 'lm-wrap',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

/** Adds signboards for every landmark to a layer group (clears it first). */
export function drawLandmarks(group: L.LayerGroup, landmarks: Landmark[], big = false) {
  group.clearLayers();
  for (const l of landmarks) {
    L.marker([l.lat, l.lng], { icon: landmarkIcon(landmarkLabel(l), big), interactive: false, keyboard: false, zIndexOffset: -500 }).addTo(group);
  }
}

/** Satellite imagery (Esri World Imagery) — used where admins place landmarks. */
export function satelliteLayer() {
  return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
  });
}

export function streetLayer() {
  return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors',
  });
}

export const QUICK_NAMES: { name: string; short: string }[] = [
  { name: 'Learning Centre 1', short: 'LC 1' },
  { name: 'Learning Centre 2', short: 'LC 2' },
  { name: 'Learning Centre 3', short: 'LC 3' },
  { name: 'Library', short: 'Library' },
  { name: 'Cafeteria', short: 'Cafe' },
  { name: 'Main Gate', short: 'Gate' },
  { name: 'Hostel', short: 'Hostel' },
  { name: 'Sports Ground', short: 'Ground' },
  { name: 'Auditorium', short: 'Audi' },
  { name: 'Admin Block', short: 'Admin' },
];
