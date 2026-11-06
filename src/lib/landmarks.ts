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

/** Octagonal building sketch (viewBox 0 0 100 100, centre 50,50) in a pencil style. */
function octagon(r: number, rot = 22.5) {
  const pts: string[] = [];
  for (let k = 0; k < 8; k++) {
    const a = ((rot + 45 * k) * Math.PI) / 180;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

function buildingSvg() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'hq-bld');
  svg.setAttribute('aria-hidden', 'true');
  const ridges: string[] = [];
  for (let k = 0; k < 8; k++) {
    const a = ((22.5 + 45 * k) * Math.PI) / 180;
    ridges.push(`M${(50 + 13 * Math.cos(a)).toFixed(2)} ${(50 + 13 * Math.sin(a)).toFixed(2)}L${(50 + 31 * Math.cos(a)).toFixed(2)} ${(50 + 31 * Math.sin(a)).toFixed(2)}`);
  }
  const gables = [0, 90, 180, 270]
    .map((deg) => `<polygon points="50,9 42,20 58,20" transform="rotate(${deg} 50 50)" />`)
    .join('');
  svg.innerHTML =
    `<circle class="hq-bld-ring" cx="50" cy="50" r="34" />` +
    `<polygon class="hq-bld-fill" points="${octagon(31)}" />` +
    `<g class="hq-bld-gables">${gables}</g>` +
    `<polygon class="hq-bld-line" points="${octagon(31)}" />` +
    `<polygon class="hq-bld-pencil" points="${octagon(32.2, 24)}" />` +
    `<path class="hq-bld-ridge" d="${ridges.join('')}" />` +
    `<polygon class="hq-bld-line" points="${octagon(13)}" />` +
    `<circle class="hq-bld-dome" cx="50" cy="50" r="6" />`;
  return svg;
}

const MINI_ELEGANT =
  '<svg viewBox="-4 -2 72 72" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M32 6C46 18 52 32 46 46C42 54 36 58 32 58C28 58 22 54 18 46C12 32 18 18 32 6Z"/>' +
  '<circle cx="38" cy="36" r="6"/><circle cx="26" cy="36" r="2.6" fill="currentColor" stroke="none"/></svg>';

/**
 * The CoE headquarters as a building sketch drawn to real-world size (it scales with zoom),
 * plus a small floating "AB 001" tag. The full name lives in the map legend.
 */
export function drawFeatured(group: L.LayerGroup, l: Landmark, big = false) {
  const halfM = 20; // sketch covers 40 m x 40 m around the pin
  const dLat = halfM / 111320;
  const dLng = halfM / (111320 * Math.cos((l.lat * Math.PI) / 180));
  L.svgOverlay(buildingSvg(), [[l.lat - dLat, l.lng - dLng], [l.lat + dLat, l.lng + dLng]], { interactive: false }).addTo(group);
  const tag = l.short || l.name;
  L.marker([l.lat, l.lng], {
    icon: L.divIcon({
      html: `<div class="hq-tag ${big ? 'big' : ''}"><span class="hq-mini">${MINI_ELEGANT}</span>${esc(tag)}</div>`,
      className: 'lm-wrap',
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    }),
    interactive: false,
    keyboard: false,
    zIndexOffset: 400,
  }).addTo(group);
}

/** Map legend naming the featured landmarks (top-right corner of the map). */
export function featuredLegend(featured: Landmark[], big = false) {
  const Legend = L.Control.extend({
    onAdd() {
      const div = L.DomUtil.create('div', `hq-legend ${big ? 'big' : ''}`);
      div.innerHTML = featured
        .map(
          (l) =>
            `<div class="hq-legend-row"><span class="hq-legend-icon" aria-hidden="true"><svg viewBox="0 0 100 100"><polygon points="${octagon(40)}"/><polygon points="${octagon(16)}"/></svg></span>` +
            `<span><b>${esc(l.short || 'HQ')}</b><small>${esc(l.name)}</small></span></div>`,
        )
        .join('');
      L.DomEvent.disableClickPropagation(div);
      return div;
    },
  });
  return new Legend({ position: 'topright' });
}

/** Adds signboards for every landmark to a layer group (clears it first). */
export function drawLandmarks(group: L.LayerGroup, landmarks: Landmark[], big = false) {
  group.clearLayers();
  for (const l of landmarks) {
    if (l.featured) {
      drawFeatured(group, l, big);
      continue;
    }
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
