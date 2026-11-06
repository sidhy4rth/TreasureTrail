import {
  check,
  cleanPin,
  db,
  fail,
  getSettings,
  hashPin,
  num,
  requirePlayer,
  route,
  str,
  RARITY_POINTS,
  type PlayerRow,
  loadLandmarks,
  nearLabel,
} from './_lib.js';

const KINDS = ['tree', 'shrub', 'herb', 'palm', 'climber', 'grass'];
const RARITIES = ['common', 'uncommon', 'rare', 'legendary'];
const ROLES = ['player', 'judge', 'admin'];

function isoOrNull(v: unknown, what: string): string | null {
  if (v === null || v === '') return null;
  const ms = Date.parse(str(v));
  if (!Number.isFinite(ms)) fail(422, `${what} is not a valid date.`);
  return new Date(ms).toISOString();
}

function inRange(v: unknown, lo: number, hi: number, what: string): number {
  const n = num(v);
  if (n === null || n < lo || n > hi) fail(422, `${what} must be between ${lo} and ${hi}.`);
  return n;
}

function strList(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  return arr.map((x) => str(x)).filter(Boolean).slice(0, 20);
}

function findPaths(rows: { id: string; player_id: string }[]): string[] {
  return rows.flatMap((r) => [`${r.player_id}/${r.id}.jpg`, `${r.player_id}/${r.id}_t.jpg`]);
}

async function removeObjects(paths: string[]) {
  const bucket = db().storage.from('finds');
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await bucket.remove(paths.slice(i, i + 100));
    if (error) console.error('storage remove', error);
  }
}

// ------------------------------------------------------------------ actions
async function settings(body: Record<string, unknown>) {
  const patch = (body.patch ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if ('event_name' in patch) {
    const n = str(patch.event_name);
    if (n.length < 2 || n.length > 60) fail(422, 'Event name must be 2–60 characters.');
    out.event_name = n;
  }
  if ('starts_at' in patch) out.starts_at = isoOrNull(patch.starts_at, 'Start time');
  if ('ends_at' in patch) out.ends_at = isoOrNull(patch.ends_at, 'End time');
  if ('geofence_on' in patch) out.geofence_on = patch.geofence_on === true;
  if ('ai_enabled' in patch) out.ai_enabled = patch.ai_enabled === true;
  if ('geofence_lat' in patch) out.geofence_lat = inRange(patch.geofence_lat, -90, 90, 'Latitude');
  if ('geofence_lng' in patch) out.geofence_lng = inRange(patch.geofence_lng, -180, 180, 'Longitude');
  if ('geofence_radius_m' in patch) {
    out.geofence_radius_m = Math.round(inRange(patch.geofence_radius_m, 50, 20000, 'Radius'));
  }
  if ('max_accuracy_m' in patch) {
    out.max_accuracy_m = Math.round(inRange(patch.max_accuracy_m, 10, 1000, 'GPS accuracy limit'));
  }
  const current = await getSettings();
  const starts = 'starts_at' in out ? (out.starts_at as string | null) : current.starts_at;
  const ends = 'ends_at' in out ? (out.ends_at as string | null) : current.ends_at;
  if (starts && ends && Date.parse(ends) <= Date.parse(starts)) fail(422, 'The end time must be after the start.');
  out.updated_at = new Date().toISOString();
  const s = check(await db().from('settings').update(out).eq('id', 1).select('*').single(), 'update settings');
  return { settings: s };
}

async function speciesUpsert(body: Record<string, unknown>) {
  const s = (body.species ?? {}) as Record<string, unknown>;
  const id = s.id === undefined || s.id === null ? null : num(s.id);
  const common = str(s.common_name);
  const sci = str(s.scientific_name);
  if (common.length < 2 || common.length > 60) fail(422, 'Common name must be 2–60 characters.');
  if (sci.length < 3 || sci.length > 80) fail(422, 'Scientific name must be 3–80 characters.');
  const kind = str(s.kind) || 'tree';
  if (!KINDS.includes(kind)) fail(422, `Kind must be one of ${KINDS.join(', ')}.`);
  const rarity = str(s.rarity) || 'common';
  if (!RARITIES.includes(rarity)) fail(422, `Rarity must be one of ${RARITIES.join(', ')}.`);
  const points =
    s.points === undefined || s.points === null || s.points === ''
      ? RARITY_POINTS[rarity]
      : Math.round(inRange(s.points, 1, 1000, 'Points'));
  const row = {
    common_name: common,
    scientific_name: sci,
    match_names: strList(s.match_names),
    kind,
    rarity,
    points,
    emoji: str(s.emoji).slice(0, 8) || '🌿',
    hint: str(s.hint).slice(0, 300),
    fun_fact: str(s.fun_fact).slice(0, 400),
    tags: strList(s.tags).map((t) => t.toLowerCase()),
    active: s.active === undefined ? true : s.active === true,
  };
  const r =
    id !== null
      ? await db().from('species').update(row).eq('id', id).select('*').single()
      : await db().from('species').insert(row).select('*').single();
  return { species: check(r, 'save species') };
}

async function players() {
  const rows = check(
    await db()
      .from('players')
      .select('id, display_name, student_id, team_id, role, emoji, failed_logins, locked_until, created_at')
      .order('created_at'),
    'load players',
  ) as Omit<PlayerRow, 'pin_hash'>[];
  const teams = check(await db().from('teams').select('id, name, code, emoji'), 'load teams') as {
    id: string;
    name: string;
    code: string;
    emoji: string;
  }[];
  const finds = check(await db().from('finds').select('player_id, status'), 'load finds') as {
    player_id: string;
    status: string;
  }[];
  const T = new Map(teams.map((t) => [t.id, t]));
  const counts = new Map<string, Record<string, number>>();
  for (const f of finds) {
    const c = counts.get(f.player_id) ?? { provisional: 0, pending: 0, approved: 0, rejected: 0 };
    c[f.status] = (c[f.status] ?? 0) + 1;
    counts.set(f.player_id, c);
  }
  return {
    players: rows.map((p) => ({
      ...p,
      team_name: p.team_id ? (T.get(p.team_id)?.name ?? null) : null,
      team_code: p.team_id ? (T.get(p.team_id)?.code ?? null) : null,
      finds: counts.get(p.id) ?? { provisional: 0, pending: 0, approved: 0, rejected: 0 },
    })),
    teams,
  };
}

async function exportFinds() {
  const finds = check(
    await db()
      .from('finds')
      .select('id, player_id, species_id, captured_at, lat, lng, accuracy_m, status, photo_url, ai_name, ai_score')
      .order('captured_at'),
    'load finds',
  ) as {
    id: string;
    player_id: string;
    species_id: number | null;
    captured_at: string;
    lat: number;
    lng: number;
    accuracy_m: number | null;
    status: string;
    photo_url: string;
    ai_name: string | null;
    ai_score: number | null;
  }[];
  const ps = check(await db().from('players').select('id, display_name, student_id, team_id'), 'load players') as {
    id: string;
    display_name: string;
    student_id: string;
    team_id: string | null;
  }[];
  const ts = check(await db().from('teams').select('id, name'), 'load teams') as { id: string; name: string }[];
  const ss = check(await db().from('species').select('id, common_name, scientific_name'), 'load species') as {
    id: number;
    common_name: string;
    scientific_name: string;
  }[];
  const P = new Map(ps.map((p) => [p.id, p]));
  const T = new Map(ts.map((t) => [t.id, t.name]));
  const S = new Map(ss.map((s) => [s.id, s]));
  const lms = await loadLandmarks();
  return {
    rows: finds.map((f) => {
      const p = P.get(f.player_id);
      const s = f.species_id !== null ? S.get(f.species_id) : undefined;
      return {
        id: f.id,
        captured_at: f.captured_at,
        lat: f.lat,
        lng: f.lng,
        accuracy_m: f.accuracy_m,
        near: nearLabel(lms, f.lat, f.lng),
        status: f.status,
        species_common: s?.common_name ?? null,
        species_scientific: s?.scientific_name ?? null,
        player_name: p?.display_name ?? null,
        student_id: p?.student_id ?? null,
        team: p?.team_id ? (T.get(p.team_id) ?? null) : null,
        photo_url: f.photo_url,
        ai_name: f.ai_name,
        ai_score: f.ai_score,
      };
    }),
  };
}

async function resetGame(body: Record<string, unknown>) {
  if (body.confirm !== 'RESET') fail(422, 'Type RESET to confirm.');
  const finds = check(await db().from('finds').select('id, player_id'), 'list finds') as {
    id: string;
    player_id: string;
  }[];
  check(await db().from('finds').delete().not('id', 'is', null), 'delete finds');
  check(await db().from('bounties').delete().gte('id', 0), 'delete bounties');
  check(await db().from('players').delete().eq('role', 'player'), 'delete players');
  check(await db().from('teams').delete().not('id', 'is', null), 'delete teams');
  check(
    await db().from('settings').update({ frozen_at: null, updated_at: new Date().toISOString() }).eq('id', 1),
    'unfreeze',
  );
  await removeObjects(findPaths(finds));
  return { ok: true, deleted_finds: finds.length };
}

// ------------------------------------------------------------------ handler
export default route(['POST'], async (req) => {
  const me = await requirePlayer(req, ['admin']);
  const body = req.body as Record<string, unknown>;

  switch (body.action) {
    case 'settings':
      return settings(body);

    case 'species_list':
      return { species: check(await db().from('species').select('*').order('points').order('common_name'), 'species') };

    case 'species_upsert':
      return speciesUpsert(body);

    case 'species_toggle': {
      const id = num(body.id);
      if (id === null) fail(422, 'Missing species.');
      const s = check(
        await db().from('species').update({ active: body.active === true }).eq('id', id).select('*').single(),
        'toggle species',
      );
      return { species: s };
    }

    case 'bounty': {
      const speciesId = num(body.speciesId);
      if (speciesId === null) fail(422, 'Pick a species for the bounty.');
      const multiplier = inRange(body.multiplier ?? 2, 1.5, 5, 'Multiplier');
      const minutes = inRange(body.minutes ?? 15, 1, 120, 'Minutes');
      const sp = check(await db().from('species').select('id').eq('id', speciesId).maybeSingle(), 'load species');
      if (!sp) fail(404, 'Unknown species.');
      const now = Date.now();
      const b = check(
        await db()
          .from('bounties')
          .insert({
            species_id: speciesId,
            multiplier,
            starts_at: new Date(now).toISOString(),
            ends_at: new Date(now + minutes * 60000).toISOString(),
          })
          .select('*')
          .single(),
        'create bounty',
      );
      return { bounty: b };
    }

    case 'bounty_end': {
      const id = num(body.id);
      if (id === null) fail(422, 'Missing bounty.');
      check(await db().from('bounties').update({ ends_at: new Date().toISOString() }).eq('id', id), 'end bounty');
      return { ok: true };
    }

    case 'bounties':
      return {
        bounties: check(
          await db().from('bounties').select('*').order('created_at', { ascending: false }).limit(20),
          'bounties',
        ),
      };

    case 'freeze':
      check(
        await db().from('settings').update({ frozen_at: new Date().toISOString() }).eq('id', 1),
        'freeze',
      );
      return { ok: true };

    case 'reveal':
      check(await db().from('settings').update({ frozen_at: null }).eq('id', 1), 'reveal');
      return { ok: true };

    case 'players':
      return players();

    case 'set_role': {
      const playerId = str(body.playerId);
      const role = str(body.role);
      if (!ROLES.includes(role)) fail(422, 'Unknown role.');
      if (playerId === me.id && role !== 'admin') fail(422, "You can't remove your own admin role.");
      check(await db().from('players').update({ role }).eq('id', playerId), 'set role');
      return { ok: true };
    }

    case 'reset_pin': {
      const playerId = str(body.playerId);
      const pin = cleanPin(body.pin);
      check(
        await db()
          .from('players')
          .update({ pin_hash: await hashPin(pin), failed_logins: 0, locked_until: null })
          .eq('id', playerId),
        'reset pin',
      );
      return { ok: true };
    }

    case 'delete_player': {
      const playerId = str(body.playerId);
      if (!playerId) fail(422, 'Missing player.');
      if (playerId === me.id) fail(422, "You can't delete yourself.");
      const finds = check(await db().from('finds').select('id, player_id').eq('player_id', playerId), 'list finds') as {
        id: string;
        player_id: string;
      }[];
      check(await db().from('players').delete().eq('id', playerId), 'delete player');
      await removeObjects(findPaths(finds));
      return { ok: true };
    }

    case 'landmarks':
      return { landmarks: await loadLandmarks() };

    case 'landmark_upsert': {
      const id = num(body.id);
      const name = str(body.name).replace(/\s+/g, ' ');
      const short = str(body.short).replace(/\s+/g, ' ');
      const lat = num(body.lat);
      const lng = num(body.lng);
      if (name.length < 1 || name.length > 40) fail(422, 'Landmark name must be 1–40 characters.');
      if (short.length > 10) fail(422, 'Short label must be 10 characters or less.');
      if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) fail(422, 'Pick a spot on the map.');
      const row = { name, short, lat, lng };
      const l = id
        ? check(await db().from('landmarks').update(row).eq('id', id).select('*').single(), 'update landmark')
        : check(await db().from('landmarks').insert(row).select('*').single(), 'add landmark');
      return { landmark: l };
    }

    case 'landmark_delete': {
      const id = num(body.id);
      if (id === null) fail(422, 'Missing landmark.');
      check(await db().from('landmarks').delete().eq('id', id), 'delete landmark');
      return { ok: true };
    }

    case 'export':
      return exportFinds();

    case 'reset':
      return resetGame(body);

    default:
      return fail(400, 'Unknown action');
  }
});
