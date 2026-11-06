import type { VercelRequest } from '@vercel/node';
import {
  check, cleanEmoji, cleanName, cleanPin, db, fail, hashPin, makeToken, normStudentId,
  publicPlayer, requirePlayer, route, str, teamDetails, verifyPin, type PlayerRow,
} from './_lib.js';

const MAX_FAILS = 8;
const LOCK_MINUTES = 10;

async function join(body: Record<string, unknown>) {
  const name = cleanName(body.name);
  const studentId = normStudentId(body.studentId);
  const pin = cleanPin(body.pin);
  const emoji = cleanEmoji(body.emoji, '🌱');

  const existing = check(
    await db().from('players').select('id').eq('student_id', studentId).maybeSingle(),
    'check student id',
  );
  if (existing) fail(409, 'This registration number has already joined. Log in with your PIN instead.');

  const r = await db()
    .from('players')
    .insert({ display_name: name, student_id: studentId, pin_hash: await hashPin(pin), emoji })
    .select('*')
    .single();
  if (r.error?.code === '23505') fail(409, 'This registration number has already joined. Log in with your PIN instead.');
  const p = check(r, 'create player') as PlayerRow;
  return { token: makeToken(p.id), player: publicPlayer(p), team: null };
}

async function login(body: Record<string, unknown>) {
  const studentId = normStudentId(body.studentId);
  const pin = cleanPin(body.pin);
  const p = check(
    await db().from('players').select('*').eq('student_id', studentId).maybeSingle(),
    'load player',
  ) as PlayerRow | null;
  if (!p) fail(404, 'No player with that registration number yet. Tap "New player" to join.');

  if (p.locked_until && new Date(p.locked_until).getTime() > Date.now()) {
    const mins = Math.max(1, Math.ceil((new Date(p.locked_until).getTime() - Date.now()) / 60000));
    fail(429, `Too many wrong PINs. Try again in ${mins} min, or ask an organiser to reset it.`);
  }

  if (!(await verifyPin(pin, p.pin_hash))) {
    const fails = p.failed_logins + 1;
    const patch =
      fails >= MAX_FAILS
        ? { failed_logins: 0, locked_until: new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() }
        : { failed_logins: fails };
    check(await db().from('players').update(patch).eq('id', p.id), 'count failed login');
    fail(401, fails >= MAX_FAILS ? `Too many wrong PINs. Locked for ${LOCK_MINUTES} min.` : 'Wrong PIN. Try again.');
  }

  if (p.failed_logins !== 0 || p.locked_until) {
    check(await db().from('players').update({ failed_logins: 0, locked_until: null }).eq('id', p.id), 'reset fails');
  }
  return { token: makeToken(p.id), player: publicPlayer(p), team: await teamDetails(p.team_id) };
}

async function promote(req: VercelRequest, body: Record<string, unknown>) {
  const p = await requirePlayer(req);
  const code = str(body.code);
  const admin = process.env.ADMIN_CODE ?? '';
  const judge = process.env.JUDGE_CODE ?? '';
  let role: 'admin' | 'judge' | null = null;
  if (code && admin && code === admin) role = 'admin';
  else if (code && judge && code === judge) role = 'judge';
  if (!role) fail(403, 'That code is not right.');
  const updated = check(
    await db().from('players').update({ role }).eq('id', p.id).select('*').single(),
    'promote',
  ) as PlayerRow;
  return { player: publicPlayer(updated) };
}

async function rename(req: VercelRequest, body: Record<string, unknown>) {
  const p = await requirePlayer(req);
  const patch: Record<string, string> = {};
  if (body.name !== undefined) patch.display_name = cleanName(body.name);
  if (body.emoji !== undefined) patch.emoji = cleanEmoji(body.emoji, p.emoji);
  if (Object.keys(patch).length === 0) return { player: publicPlayer(p) };
  const updated = check(
    await db().from('players').update(patch).eq('id', p.id).select('*').single(),
    'rename',
  ) as PlayerRow;
  return { player: publicPlayer(updated) };
}

export default route(['POST'], async (req) => {
  const body = req.body as Record<string, unknown>;
  switch (body.action) {
    case 'join':
      return join(body);
    case 'login':
      return login(body);
    case 'promote':
      return promote(req, body);
    case 'me': {
      const p = await requirePlayer(req);
      return { player: publicPlayer(p), team: await teamDetails(p.team_id) };
    }
    case 'rename':
      return rename(req, body);
    default:
      return fail(400, 'Unknown action');
  }
});
