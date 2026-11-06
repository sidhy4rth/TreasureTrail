import {
  check, cleanEmoji, cleanName, db, fail, publicPlayer, requirePlayer, route, str, teamCode,
  teamDetails, type PlayerRow,
} from './_lib.js';

const MAX_MEMBERS = 4;

async function memberCount(teamId: string): Promise<number> {
  const r = await db().from('players').select('id', { count: 'exact', head: true }).eq('team_id', teamId);
  if (r.error) throw new Error(`count members: ${r.error.message}`);
  return r.count ?? 0;
}

async function setTeam(playerId: string, teamId: string | null): Promise<PlayerRow> {
  return check(
    await db().from('players').update({ team_id: teamId }).eq('id', playerId).select('*').single(),
    'set team',
  ) as PlayerRow;
}

export default route(['POST'], async (req) => {
  const body = req.body as Record<string, unknown>;
  const p = await requirePlayer(req);

  switch (body.action) {
    case 'create': {
      if (p.team_id) fail(409, 'Leave your current team first.');
      const name = cleanName(body.name, 'Team name');
      const emoji = cleanEmoji(body.emoji, '🌿');
      const taken = check(
        await db().from('teams').select('id').ilike('name', name.replace(/[\\%_]/g, (c) => `\\${c}`)).maybeSingle(),
        'check team name',
      );
      if (taken) fail(409, 'That team name is taken. Try another.');

      let team: { id: string } | null = null;
      for (let i = 0; i < 5 && !team; i++) {
        const r = await db().from('teams').insert({ name, emoji, code: teamCode() }).select('id').single();
        if (!r.error) team = r.data;
        else if (r.error.code === '23505') {
          if (r.error.message.includes('teams_name_ci')) fail(409, 'That team name is taken. Try another.');
          // code collision: loop and try a new code
        } else throw new Error(`create team: ${r.error.message}`);
      }
      if (!team) fail(500, 'Could not create the team. Try again.');
      const updated = await setTeam(p.id, team.id);
      return { team: await teamDetails(team.id), player: publicPlayer(updated) };
    }

    case 'join': {
      const code = str(body.code).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!code) fail(422, 'Enter the 5-letter team code.');
      const t = check(await db().from('teams').select('id').eq('code', code).maybeSingle(), 'find team') as
        | { id: string }
        | null;
      if (!t) fail(404, 'No team with that code. Check it with your teammate.');
      if (p.team_id === t.id) return { team: await teamDetails(t.id), player: publicPlayer(p) };
      if (p.team_id) fail(409, 'Leave your current team first.');
      if ((await memberCount(t.id)) >= MAX_MEMBERS) fail(409, `Team is full (${MAX_MEMBERS}/${MAX_MEMBERS}).`);
      const updated = await setTeam(p.id, t.id);
      // Two people joining at the same moment could overfill; undo if so.
      if ((await memberCount(t.id)) > MAX_MEMBERS) {
        await setTeam(p.id, null);
        fail(409, `Team is full (${MAX_MEMBERS}/${MAX_MEMBERS}).`);
      }
      return { team: await teamDetails(t.id), player: publicPlayer(updated) };
    }

    case 'leave': {
      const old = p.team_id;
      const updated = old ? await setTeam(p.id, null) : p;
      // Drop the team when its last member leaves.
      if (old && (await memberCount(old)) === 0) {
        check(await db().from('teams').delete().eq('id', old), 'delete empty team');
      }
      return { team: null, player: publicPlayer(updated) };
    }

    default:
      return fail(400, 'Unknown action');
  }
});
