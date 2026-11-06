import { check, db, fail, loadLandmarks, nearLabel, num, requirePlayer, route, str } from './_lib.js';

const FIND_COLS =
  'id, player_id, species_id, claimed_species_id, photo_url, thumb_url, lat, lng, accuracy_m, captured_at, ' +
  'created_at, ai_name, ai_common, ai_score, ai_match, ai_raw, flags, status, bounty_mult, judged_by, judged_at, judge_note';

interface FindRow {
  id: string;
  player_id: string;
  species_id: number | null;
  claimed_species_id: number | null;
  judged_by: string | null;
  [k: string]: unknown;
}

/** Adds player / team / species names without relying on PostgREST embeds. */
async function decorate(rows: FindRow[]) {
  if (rows.length === 0) return [];
  const playerIds = [...new Set(rows.flatMap((r) => [r.player_id, r.judged_by]).filter((x): x is string => !!x))];
  const speciesIds = [
    ...new Set(rows.flatMap((r) => [r.species_id, r.claimed_species_id]).filter((x): x is number => x !== null)),
  ];
  const players = check(
    await db().from('players').select('id, display_name, emoji, team_id').in('id', playerIds),
    'load players',
  ) as { id: string; display_name: string; emoji: string; team_id: string | null }[];
  const teamIds = [...new Set(players.map((p) => p.team_id).filter((x): x is string => !!x))];
  const teams = teamIds.length
    ? (check(await db().from('teams').select('id, name, emoji').in('id', teamIds), 'load teams') as {
        id: string;
        name: string;
        emoji: string;
      }[])
    : [];
  const species = speciesIds.length
    ? (check(
        await db().from('species').select('id, common_name, scientific_name, emoji').in('id', speciesIds),
        'load species',
      ) as { id: number; common_name: string; scientific_name: string; emoji: string }[])
    : [];
  const P = new Map(players.map((p) => [p.id, p]));
  const T = new Map(teams.map((t) => [t.id, t]));
  const S = new Map(species.map((s) => [s.id, s]));
  const lms = await loadLandmarks();
  return rows.map((r) => {
    const pl = P.get(r.player_id);
    const team = pl?.team_id ? T.get(pl.team_id) : undefined;
    const sp = r.species_id !== null ? S.get(r.species_id) : undefined;
    const cl = r.claimed_species_id !== null ? S.get(r.claimed_species_id) : undefined;
    return {
      ...r,
      player_name: pl?.display_name ?? '?',
      player_emoji: pl?.emoji ?? '🌱',
      team_name: team?.name ?? null,
      team_emoji: team?.emoji ?? null,
      species_name: sp?.common_name ?? null,
      species_scientific: sp?.scientific_name ?? null,
      species_emoji: sp?.emoji ?? null,
      claimed_name: cl?.common_name ?? null,
      judge_name: r.judged_by ? (P.get(r.judged_by)?.display_name ?? null) : null,
      near: nearLabel(lms, Number(r.lat), Number(r.lng)),
    };
  });
}

export default route(['GET', 'POST'], async (req) => {
  const me = await requirePlayer(req, ['judge', 'admin']);

  if (req.method === 'GET') {
    const pending = check(
      await db().from('finds').select(FIND_COLS).eq('status', 'pending').order('created_at').limit(100),
      'load pending',
    ) as unknown as FindRow[];
    const flagged = check(
      await db()
        .from('finds')
        .select(FIND_COLS)
        .eq('status', 'provisional')
        .is('judged_at', null)
        .not('flags', 'eq', '{}')
        .order('created_at')
        .limit(100),
      'load flagged',
    ) as unknown as FindRow[];
    const queue = [...pending, ...flagged]
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .slice(0, 100);
    const recent = check(
      await db()
        .from('finds')
        .select(FIND_COLS)
        .not('judged_at', 'is', null)
        .order('judged_at', { ascending: false })
        .limit(20),
      'load recent',
    ) as unknown as FindRow[];
    const [q, r] = await Promise.all([decorate(queue), decorate(recent)]);
    return { queue: q, recent: r };
  }

  const body = req.body as Record<string, unknown>;
  const findId = str(body.findId);
  if (!findId) fail(422, 'Missing find.');
  const action = str(body.action);
  const note = str(body.note).slice(0, 300) || null;
  const speciesIdRaw = body.speciesId === null || body.speciesId === undefined ? null : num(body.speciesId);

  const find = check(
    await db().from('finds').select('id, species_id').eq('id', findId).maybeSingle(),
    'load find',
  ) as { id: string; species_id: number | null } | null;
  if (!find) fail(404, 'That find no longer exists.');

  let speciesId: number | null = null;
  if (speciesIdRaw !== null) {
    const s = check(await db().from('species').select('id').eq('id', speciesIdRaw).maybeSingle(), 'load species');
    if (!s) fail(404, 'Unknown species.');
    speciesId = speciesIdRaw;
  }

  const stamp = { judged_by: me.id, judged_at: new Date().toISOString(), judge_note: note };
  let patch: Record<string, unknown>;
  switch (action) {
    case 'approve': {
      const sid = speciesId ?? find.species_id;
      if (sid === null) fail(422, 'Pick the species before approving.');
      patch = { ...stamp, status: 'approved', species_id: sid };
      break;
    }
    case 'reject':
      patch = { ...stamp, status: 'rejected' };
      break;
    case 'reassign':
      if (speciesId === null) fail(422, 'Pick the species to reassign to.');
      patch = { ...stamp, status: 'approved', species_id: speciesId };
      break;
    default:
      return fail(400, 'Unknown action');
  }
  check(await db().from('finds').update(patch).eq('id', findId), 'judge find');
  return { ok: true };
});
