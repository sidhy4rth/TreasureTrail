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

const ELEGANT_PATHS = [
  'M32 6C46 18 52 32 46 46C42 54 36 58 32 58C28 58 22 54 18 46C12 32 18 18 32 6Z',
  'M32 12V26',
  'M44 38C47 41 48 45 47 50',
  'M28 46Q32 49 36 46',
  'M32 58V63',
];

/** Draws Elegant (the leaf with a monocle) centred at cx, cy with the given size. */
function drawElegant(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  const k = size / 72;
  ctx.translate(cx - 32 * k, cy - 34 * k);
  ctx.scale(k, k);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const d of ELEGANT_PATHS) ctx.stroke(new Path2D(d));
  ctx.beginPath();
  ctx.arc(38, 36, 6, 0, Math.PI * 2);
  ctx.stroke();
  for (const x of [26, 38]) {
    ctx.beginPath();
    ctx.arc(x, 36, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Geotag stamp along the bottom of the photo. */
function drawStamp(ctx: CanvasRenderingContext2D, w: number, h: number, s: StampInfo) {
  const u = Math.max(w, h) / 1600; // scale unit
  const pad = 26 * u;
  const boxH = 168 * u;
  const y0 = h - boxH - pad;

  const grad = ctx.createLinearGradient(0, h - boxH * 1.9, 0, h);
  grad.addColorStop(0, 'rgba(16,36,26,0)');
  grad.addColorStop(1, 'rgba(16,36,26,0.88)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, h - boxH * 1.9, w, boxH * 1.9);

  // lime badge with Elegant
  const r = 56 * u;
  const cx = pad + r;
  const cy = y0 + boxH / 2;
  ctx.fillStyle = '#C8FF2E';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  drawElegant(ctx, cx, cy, r * 1.35, '#0B1A10');

  const tx = cx + r + 24 * u;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#F2F5EF';
  ctx.font = `800 ${52 * u}px "Geist", system-ui, sans-serif`;
  ctx.fillText(s.species, tx, y0 + 52 * u, w - tx - pad);

  ctx.font = `600 ${29 * u}px "Geist Mono", ui-monospace, monospace`;
  ctx.fillStyle = '#C8FF2E';
  const lat = `${Math.abs(s.lat).toFixed(5)}°${s.lat >= 0 ? 'N' : 'S'}`;
  const lng = `${Math.abs(s.lng).toFixed(5)}°${s.lng >= 0 ? 'E' : 'W'}`;
  ctx.fillText(`${lat}  ${lng}  ±${Math.round(s.accuracy)} m`, tx, y0 + 100 * u, w - tx - pad);

  ctx.fillStyle = 'rgba(242,245,239,0.88)';
  ctx.font = `500 ${27 * u}px "Geist", system-ui, sans-serif`;
  const when = s.at.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const who = s.team ? `${s.player} · ${s.team}` : s.player;
  ctx.fillText(`${when} · ${who} · TREASURE TRAIL · LEAVE THE CLASS`, tx, y0 + 144 * u, w - tx - pad);

  // corner tag
  ctx.font = `600 ${23 * u}px "Geist Mono", ui-monospace, monospace`;
  const tag = 'GEOTAGGED · TREASURE TRAIL';
  const tw = ctx.measureText(tag).width + 30 * u;
  ctx.fillStyle = 'rgba(16,36,26,0.78)';
  roundRect(ctx, w - tw - pad, pad, tw, 44 * u, 22 * u);
  ctx.fill();
  ctx.strokeStyle = 'rgba(200,255,46,0.6)';
  ctx.lineWidth = 2 * u;
  ctx.stroke();
  ctx.fillStyle = '#C8FF2E';
  ctx.fillText(tag, w - tw - pad + 15 * u, pad + 30 * u);
}

export interface Processed {
  image: string; // base64 JPEG
  thumb: string; // base64 JPEG
  phash: string;
  previewUrl: string;
}

export async function processPhoto(img: HTMLImageElement, stamp: StampInfo): Promise<Processed> {
  try {
    await Promise.all([
      document.fonts.load('800 52px "Geist"'),
      document.fonts.load('500 27px "Geist"'),
      document.fonts.load('600 29px "Geist Mono"'),
    ]);
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
