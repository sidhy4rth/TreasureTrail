import type { VercelRequest, VercelResponse } from '@vercel/node';

// Public, read-only game data, cached on Vercel's CDN for a few seconds.
// 100 phones polling the leaderboard then cost the database one query per
// few seconds instead of one per phone per poll.

interface Spec {
  ttl: number; // seconds the CDN may serve the same answer
  args?: (q: VercelRequest['query']) => Record<string, unknown>;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const ALLOWED: Record<string, Spec> = {
  game_state: { ttl: 3 },
  feed: {
    ttl: 3,
    args: (q) => {
      const n = Number(one(q.n));
      return { n: Number.isFinite(n) ? Math.min(40, Math.max(1, Math.round(n))) : 16 };
    },
  },
  map_points: { ttl: 15 },
  landmarks_state: { ttl: 30 },
  species_list: { ttl: 120 },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Cache-Control', 'no-store');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const fn = one(req.query.fn) ?? '';
  const spec = Object.prototype.hasOwnProperty.call(ALLOWED, fn) ? ALLOWED[fn] : undefined;
  if (!spec) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(404).json({ error: 'Unknown data' });
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).json({ error: 'Server not configured' });
    return;
  }

  try {
    const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(spec.args ? spec.args(req.query) : {}),
    });
    const text = await r.text();
    if (!r.ok) {
      console.error('public rpc', fn, r.status, text.slice(0, 200));
      res.setHeader('Cache-Control', 'no-store');
      res.status(502).json({ error: 'Upstream error' });
      return;
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.setHeader('Vercel-CDN-Cache-Control', `max-age=${spec.ttl}, stale-while-revalidate=${spec.ttl * 3}`);
    res.status(200).send(text);
  } catch (e) {
    console.error('public rpc', fn, e);
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'Upstream error' });
  }
}
