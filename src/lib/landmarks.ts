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
  featured?: boolean;
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

const ELEGANT_SVG =
  '<svg viewBox="-4 -2 72 72" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M32 6C46 18 52 32 46 46C42 54 36 58 32 58C28 58 22 54 18 46C12 32 18 18 32 6Z"/><path d="M32 12V26"/>' +
  '<circle cx="38" cy="36" r="6"/><path d="M44 38C47 41 48 45 47 50"/>' +
  '<circle cx="26" cy="36" r="2.4" fill="currentColor" stroke="none"/><circle cx="38" cy="36" r="2.4" fill="currentColor" stroke="none"/>' +
  '<path d="M28 46Q32 49 36 46"/></svg>';

/**
 * The CoE headquarters: a two-line signboard over an animated lime pin.
 * The pin bobs, Elegant inside it flips like a coin, and radar rings ripple from the base.
 */
export function featuredIcon(l: Pick<Landmark, 'name' | 'short'>, big = false) {
  const lines = l.name.split(' · ').map((t) => `<b>${esc(t)}</b>`).join('');
  const tag = l.short ? `<i>${esc(l.short)}</i>` : '';
  return L.divIcon({
    html:
      `<div class="lm-hq ${big ? 'big' : ''}">` +
      `<div class="lm-sign hq ${big ? 'big' : ''}"><span><em>HQ</em>${lines}${tag}</span></div>` +
      `<div class="hq-pin"><span class="hq-ripple"></span><span class="hq-ripple r2"></span><span class="hq-shadow"></span>` +
      `<span class="hq-drop"><span class="hq-face">${ELEGANT_SVG}</span></span></div>` +
      `</div>`,
    className: 'lm-wrap',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

/** Adds signboards for every landmark to a layer group (clears it first). */
export function drawLandmarks(group: L.LayerGroup, landmarks: Landmark[], big = false) {
  group.clearLayers();
  for (const l of landmarks) {
    const icon = l.featured ? featuredIcon(l, big) : landmarkIcon(landmarkLabel(l), big);
    L.marker([l.lat, l.lng], { icon, interactive: false, keyboard: false, zIndexOffset: l.featured ? 400 : -500 }).addTo(group);
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
