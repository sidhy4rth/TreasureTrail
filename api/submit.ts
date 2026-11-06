import crypto from 'node:crypto';
import {
  check, db, distanceM, fail, getSettings, isStaff, num, requirePlayer, route, str,
  type SpeciesRow,
} from './_lib.js';

const MAX_IMAGE = 2.6 * 1024 * 1024;
const MAX_THUMB = 400 * 1024;
const PHASH_MAX_DISTANCE = 5;
const CLAIM_MIN_SCORE = 0.08;
const UNSURE_MIN_SCORE = 0.2;
const AI_TIMEOUT_MS = 12000;

// ------------------------------------------------------------------ helpers
function decodeJpeg(v: unknown, max: number, what: string): Buffer {
  const s = str(v).replace(/^data:image\/[a-z]+;base64,/i, '');
  if (!s) fail(422, `Missing ${what}.`);
  const buf = Buffer.from(s, 'base64');
  if (buf.length === 0) fail(422, `The ${what} is empty.`);
  if (buf.length > max) fail(413, `The ${what} is too big. Try again.`);
  if (buf[0] !== 0xff || buf[1] !== 0xd8) fail(422, `The ${what} is not a JPEG.`);
  return buf;
}

function hamming(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

interface AiResult {
  score: number;
  name: string; // scientific name without author
  genus: string;
  common: string | null;
}

type AiOutcome =
  | { kind: 'ok'; results: AiResult[] }
  | { kind: 'no_plant' }
  | { kind: 'unavailable'; reason: string };

async function identify(image: Buffer): Promise<AiOutcome> {
  const key = process.env.PLANTNET_API_KEY;
  if (!key) return { kind: 'unavailable', reason: 'no key' };
  const url =
    'https://my-api.plantnet.org/v2/identify/all' +
    `?api-key=${encodeURIComponent(key)}&nb-results=5&lang=en&include-related-images=false`;
  const form = new FormData();
  form.append('images', new Blob([new Uint8Array(image)], { type: 'image/jpeg' }), 'leaf.jpg');
  form.append('organs', 'auto');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
  try {
    const r = await fetch(url, { method: 'POST', body: form, signal: ctrl.signal });
    if (r.status === 404) return { kind: 'no_plant' };
    if (!r.ok) {
      console.error('plantnet', r.status, (await r.text()).slice(0, 300));
      return { kind: 'unavailable', reason: `http ${r.status}` };
    }
    const j = (await r.json()) as { results?: unknown[] };
    const results: AiResult[] = (j.results ?? []).slice(0, 5).map((raw) => {
      const x = raw as {
        score?: number;
        species?: {
          scientificNameWithoutAuthor?: string;
          genus?: { scientificNameWithoutAuthor?: string };
          commonNames?: string[];
        };
      };
      const name = x.species?.scientificNameWithoutAuthor ?? '';
      return {
        score: typeof x.score === 'number' ? Math.round(x.score * 10000) / 10000 : 0,
        name,
        genus: x.species?.genus?.scientificNameWithoutAuthor ?? name.split(' ')[0] ?? '',
        common: x.species?.commonNames?.[0] ?? null,
      };
    });
    if (results.length === 0) return { kind: 'no_plant' };
    return { kind: 'ok', results };
  } catch (e) {
    console.error('plantnet error', e);
    return { kind: 'unavailable', reason: ctrl.signal.aborted ? 'timeout' : 'error' };
  } finally {
    clearTimeout(timer);
  }
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const binomial = (s: string) => norm(s).split(' ').slice(0, 2).join(' ');

function exactMatch(r: AiResult, s: SpeciesRow): boolean {
  const full = norm(r.name);
  const bi = binomial(r.name);
  return [s.scientific_name, ...s.match_names]
    .filter((n) => !n.trim().endsWith(' *'))
    .some((n) => norm(n) === full || binomial(n) === bi);
}

function genusMatch(r: AiResult, s: SpeciesRow): boolean {
  const g = norm(r.genus || r.name.split(' ')[0] || '');
  return s.match_names.some((n) => n.trim().endsWith(' *') && norm(n.trim().slice(0, -2)) === g);
}

const matchesSpecies = (r: AiResult, s: SpeciesRow) => exactMatch(r, s) || genusMatch(r, s);

/** Which of our species an AI result is: exact names win over genus wildcards. */
function mapToList(r: AiResult, list: SpeciesRow[]): SpeciesRow | null {
  return list.find((s) => exactMatch(r, s)) ?? list.find((s) => genusMatch(r, s)) ?? null;
}

async function alreadyInJournal(playerId: string, speciesId: number): Promise<boolean> {
  const r = await db()
    .from('finds')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', playerId)
    .eq('species_id', speciesId)
    .neq('status', 'rejected');
  if (r.error) throw new Error(`journal check: ${r.error.message}`);
  return (r.count ?? 0) > 0;
}

// ------------------------------------------------------------------ handler
export default route(['POST'], async (req) => {
  const body = req.body as Record<string, unknown>;
  const p = await requirePlayer(req);
  const staff = isStaff(p);

  // a. validate
  const lat = num(body.lat);
  const lng = num(body.lng);
  const accuracy = num(body.accuracy);
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    fail(422, 'Missing GPS location. Allow location and try again.');
  }
  if (accuracy === null || accuracy < 0) fail(422, 'Missing GPS accuracy. Try again.');
  const capturedMs = Date.parse(str(body.capturedAt));
  if (!Number.isFinite(capturedMs)) fail(422, 'Missing photo time. Try again.');
  let speciesId: number | null = null;
  if (body.speciesId !== null && body.speciesId !== undefined && body.speciesId !== '') {
    speciesId = num(body.speciesId);
    if (speciesId === null || !Number.isInteger(speciesId)) fail(422, 'Pick a species from the list.');
  }
  const phashRaw = str(body.phash).toLowerCase();
  const phash = /^[0-9a-f]{16}$/.test(phashRaw) ? phashRaw : null;
  const image = decodeJpeg(body.image, MAX_IMAGE, 'photo');
  const thumb = decodeJpeg(body.thumb, MAX_THUMB, 'thumbnail');

  const now = Date.now();
  const settings = await getSettings();

  // b. event window (staff can test any time)
  if (capturedMs < now - 6 * 3600 * 1000 || capturedMs > now + 2 * 60 * 1000) {
    fail(422, "This photo's time looks wrong. Check your phone clock and snap it again.");
  }
  if (!staff) {
    const starts = settings.starts_at ? Date.parse(settings.starts_at) : null;
    const ends = settings.ends_at ? Date.parse(settings.ends_at) : null;
    if (starts !== null && (now < starts || capturedMs < starts)) fail(403, "The hunt hasn't started yet.");
    if (ends !== null && (capturedMs > ends || now > ends + 30 * 60 * 1000)) fail(403, 'The hunt is over.');
  }

  // c. GPS quality + geofence (staff exempt, so organisers can test from anywhere)
  if (!staff) {
    if (accuracy > settings.max_accuracy_m) {
      fail(
        422,
        `GPS is too fuzzy (±${Math.round(accuracy)}m). Step into the open, wait a few seconds, and try again.`,
      );
    }
    if (
      settings.geofence_on &&
      distanceM(lat, lng, settings.geofence_lat, settings.geofence_lng) > settings.geofence_radius_m
    ) {
      fail(422, 'That spot is outside the campus hunt zone.');
    }
  }

  // d. rate limit
  {
    const r = await db()
      .from('finds')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', p.id)
      .gte('created_at', new Date(now - 60 * 1000).toISOString());
    if (r.error) throw new Error(`rate limit: ${r.error.message}`);
    if ((r.count ?? 0) >= 4) fail(429, 'Slow down, explorer. Try again in a minute.');
  }

  const flags: string[] = [];

  // e. duplicate photo check
  if (phash) {
    const rows = check(
      await db().from('finds').select('id, player_id, phash').neq('status', 'rejected').not('phash', 'is', null),
      'phash scan',
    ) as { id: string; player_id: string; phash: string }[];
    for (const row of rows) {
      if (!/^[0-9a-f]{16}$/.test(row.phash)) continue;
      if (hamming(phash, row.phash) <= PHASH_MAX_DISTANCE) {
        if (row.player_id === p.id) fail(409, 'You already uploaded this photo.');
        if (!flags.includes('duplicate_photo')) flags.push('duplicate_photo');
      }
    }
  }

  // f. claimed species
  const list = check(
    await db().from('species').select('*').eq('active', true),
    'load species',
  ) as SpeciesRow[];
  let claimed: SpeciesRow | null = null;
  if (speciesId !== null) {
    claimed = list.find((s) => s.id === speciesId) ?? null;
    if (!claimed) fail(404, 'That species is not in the hunt. Pick another.');
    if (await alreadyInJournal(p.id, claimed.id)) {
      fail(409, `${claimed.common_name} is already in your journal. Find something new!`);
    }
  }

  // g. AI identification (admins can switch the AI off: everything then goes to the judges)
  const aiOff = settings.ai_enabled === false;
  const ai: AiOutcome = aiOff ? { kind: 'unavailable', reason: 'switched off' } : await identify(image);
  let finalSpecies: SpeciesRow | null = claimed;
  let status: 'provisional' | 'pending' = 'pending';
  let aiMatch: boolean | null = null;
  const top = ai.kind === 'ok' ? ai.results[0] : null;

  if (claimed) {
    const c = claimed;
    if (ai.kind === 'ok') {
      aiMatch = ai.results.slice(0, 3).some((r) => r.score >= CLAIM_MIN_SCORE && matchesSpecies(r, c));
      if (aiMatch) status = 'provisional';
      else flags.push('ai_disagrees');
    } else if (ai.kind === 'no_plant') {
      aiMatch = false;
      flags.push('ai_no_plant');
    } else {
      flags.push(aiOff ? 'ai_off' : 'ai_unavailable');
    }
  } else {
    if (ai.kind === 'no_plant') fail(422, "The AI couldn't spot a plant. Get closer to a leaf and try again.");
    if (ai.kind === 'unavailable') {
      fail(422, aiOff ? 'Judges are checking photos by hand right now. Pick the species yourself.' : 'The AI helper is offline. Pick the species yourself.');
    }
    const hit = ai.results
      .filter((r) => r.score >= UNSURE_MIN_SCORE)
      .map((r) => mapToList(r, list))
      .find((s): s is SpeciesRow => s !== null);
    if (hit) {
      if (await alreadyInJournal(p.id, hit.id)) {
        fail(409, `The AI says this is ${hit.common_name}, and it's already in your journal.`);
      }
      finalSpecies = hit;
      status = 'provisional';
      aiMatch = true;
    } else {
      flags.push('unknown_species');
      aiMatch = false;
    }
  }
  if (flags.includes('duplicate_photo')) status = 'pending';

  // h. bounty (only while it's live, so a back-dated photo can't claim an old bounty)
  let bountyMult = 1;
  if (finalSpecies) {
    const captured = new Date(capturedMs).toISOString();
    const b = check(
      await db()
        .from('bounties')
        .select('multiplier, ends_at')
        .eq('species_id', finalSpecies.id)
        .lte('starts_at', captured)
        .gte('ends_at', captured)
        .order('multiplier', { ascending: false })
        .limit(1),
      'bounty',
    ) as { multiplier: number; ends_at: string }[];
    if (b[0] && now <= Date.parse(b[0].ends_at) + 15 * 60 * 1000) bountyMult = Number(b[0].multiplier) || 1;
  }

  // i. upload
  const findId = crypto.randomUUID();
  const photoPath = `${p.id}/${findId}.jpg`;
  const thumbPath = `${p.id}/${findId}_t.jpg`;
  const bucket = db().storage.from('finds');
  const opts = { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false };
  const [up1, up2] = await Promise.all([bucket.upload(photoPath, image, opts), bucket.upload(thumbPath, thumb, opts)]);
  if (up1.error || up2.error) {
    console.error('upload', up1.error, up2.error);
    await bucket.remove([photoPath, thumbPath]);
    fail(502, 'Photo upload failed. Check your signal and try again.');
  }
  const photoUrl = bucket.getPublicUrl(photoPath).data.publicUrl;
  const thumbUrl = bucket.getPublicUrl(thumbPath).data.publicUrl;

  // j. insert
  const ins = await db()
    .from('finds')
    .insert({
      id: findId,
      player_id: p.id,
      species_id: finalSpecies?.id ?? null,
      claimed_species_id: claimed?.id ?? null,
      photo_url: photoUrl,
      thumb_url: thumbUrl,
      lat,
      lng,
      accuracy_m: accuracy,
      captured_at: new Date(capturedMs).toISOString(),
      ai_name: top?.name ?? null,
      ai_common: top?.common ?? null,
      ai_score: top?.score ?? null,
      ai_match: aiMatch,
      ai_raw: ai.kind === 'ok' ? ai.results : null,
      status,
      flags,
      phash,
      bounty_mult: bountyMult,
    });
  if (ins.error) {
    console.error('insert find', ins.error);
    await bucket.remove([photoPath, thumbPath]);
    fail(500, 'Could not save your find. Try again.');
  }

  // k. response with computed points
  const mine = check(await db().rpc('my_finds', { pid: p.id }), 'my_finds') as { id: string }[] | null;
  const find = (mine ?? []).find((f) => f.id === findId) ?? null;
  return {
    find,
    species: finalSpecies,
    status,
    flags,
    ai: { name: top?.name ?? null, common: top?.common ?? null, score: top?.score ?? null, match: aiMatch },
    bounty_mult: bountyMult,
  };
});
