// Photo processing on the phone: decode → resize → burn the geotag stamp → JPEG,
// plus a small thumbnail and a 64-bit difference hash for duplicate detection.

export async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("Couldn't read that photo. Try taking it again.");
  }
}

function canvasFor(img: HTMLImageElement, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return { c, ctx, w, h };
}

function toBase64(c: HTMLCanvasElement, quality: number) {
  return c.toDataURL('image/jpeg', quality).split(',')[1];
}

/** 64-bit dHash as 16 hex chars. */
export function dHash(img: HTMLImageElement): string {
  const c = document.createElement('canvas');
  c.width = 9;
  c.height = 8;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, 9, 8);
  const d = ctx.getImageData(0, 0, 9, 8).data;
  const gray = (x: number, y: number) => {
    const i = (y * 9 + x) * 4;
    return d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
  };
  let hex = '';
  for (let y = 0; y < 8; y++) {
    let byte = 0;
    for (let x = 0; x < 8; x++) byte = (byte << 1) | (gray(x, y) > gray(x + 1, y) ? 1 : 0);
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

export interface StampInfo {
  lat: number;
  lng: number;
  accuracy: number;
  at: Date;
  species: string;
  player: string;
  team: string | null;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Field-journal geotag stamp along the bottom of the photo. */
function drawStamp(ctx: CanvasRenderingContext2D, w: number, h: number, s: StampInfo) {
  const u = Math.max(w, h) / 1600; // scale unit
  const pad = 26 * u;
  const boxH = 168 * u;
  const y0 = h - boxH - pad;

  const grad = ctx.createLinearGradient(0, h - boxH * 1.9, 0, h);
  grad.addColorStop(0, 'rgba(27,42,31,0)');
  grad.addColorStop(1, 'rgba(27,42,31,0.78)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, h - boxH * 1.9, w, boxH * 1.9);

  // badge circle
  const r = 58 * u;
  const cx = pad + r;
  const cy = y0 + boxH / 2;
  ctx.fillStyle = '#FFC93C';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 7 * u;
  ctx.strokeStyle = '#1B2A1F';
  ctx.stroke();
  ctx.font = `${62 * u}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🍃', cx, cy + 4 * u);

  const tx = cx + r + 22 * u;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${54 * u}px "Baloo 2", system-ui, sans-serif`;
  ctx.fillText(s.species, tx, y0 + 52 * u, w - tx - pad);

  ctx.font = `900 ${31 * u}px "Nunito", system-ui, sans-serif`;
  ctx.fillStyle = '#FFC93C';
  const lat = `${Math.abs(s.lat).toFixed(5)}°${s.lat >= 0 ? 'N' : 'S'}`;
  const lng = `${Math.abs(s.lng).toFixed(5)}°${s.lng >= 0 ? 'E' : 'W'}`;
  ctx.fillText(`📍 ${lat}  ${lng}  ±${Math.round(s.accuracy)} m`, tx, y0 + 100 * u, w - tx - pad);

  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.font = `700 ${28 * u}px "Nunito", system-ui, sans-serif`;
  const when = s.at.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const who = s.team ? `${s.player} · ${s.team}` : s.player;
  ctx.fillText(`${when} · ${who} · Canopy Quest`, tx, y0 + 144 * u, w - tx - pad);

  // corner tag
  ctx.font = `900 ${24 * u}px "Nunito", system-ui, sans-serif`;
  const tag = 'GEOTAGGED · CoE NBS';
  const tw = ctx.measureText(tag).width + 28 * u;
  ctx.fillStyle = 'rgba(27,42,31,0.7)';
  roundRect(ctx, w - tw - pad, pad, tw, 44 * u, 22 * u);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(tag, w - tw - pad + 14 * u, pad + 31 * u);
}

export interface Processed {
  image: string; // base64 JPEG
  thumb: string; // base64 JPEG
  phash: string;
  previewUrl: string;
}

export async function processPhoto(img: HTMLImageElement, stamp: StampInfo): Promise<Processed> {
  try {
    await document.fonts.ready;
  } catch {
    /* ignore */
  }
  const phash = dHash(img);

  const big = canvasFor(img, 1600);
  drawStamp(big.ctx, big.w, big.h, stamp);
  let q = 0.82;
  let image = toBase64(big.c, q);
  while (image.length * 0.75 > 2_300_000 && q > 0.45) {
    q -= 0.12;
    image = toBase64(big.c, q);
  }

  const small = canvasFor(img, 480);
  const thumb = toBase64(small.c, 0.72);

  return { image, thumb, phash, previewUrl: `data:image/jpeg;base64,${image}` };
}
