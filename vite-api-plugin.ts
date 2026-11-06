// Dev only: serves api/<name>.ts the way Vercel does, so `npm run dev` runs the whole app.
import type { Plugin } from 'vite';
import { loadEnv } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MAX_BODY = 6 * 1024 * 1024;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

type Res = ServerResponse & {
  status: (code: number) => Res;
  json: (body: unknown) => Res;
  send: (body: unknown) => Res;
};

export default function apiPlugin(): Plugin {
  return {
    name: 'canopy-api-dev',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, '');
      for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;

      server.middlewares.use(async (req, rawRes, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const m = url.pathname.match(/^\/api\/([a-z0-9-]+)\/?$/i);
        if (!m || m[1].startsWith('_')) return next();
        const file = path.join(server.config.root, 'api', `${m[1]}.ts`);
        const res = rawRes as Res;
        res.status = (code) => {
          res.statusCode = code;
          return res;
        };
        res.json = (body) => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(body));
          return res;
        };
        res.send = (body) => {
          if (typeof body === 'object' && body !== null && !Buffer.isBuffer(body)) return res.json(body);
          res.end(body as string | Buffer);
          return res;
        };
        if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });

        try {
          const r = req as IncomingMessage & { body?: unknown; query?: Record<string, string> };
          r.query = Object.fromEntries(url.searchParams);
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            const raw = await readBody(req);
            if (raw) {
              try {
                r.body = JSON.parse(raw);
              } catch {
                return res.status(400).json({ error: 'Invalid JSON body' });
              }
            }
          }
          const mod = await server.ssrLoadModule(file);
          await mod.default(r, res);
        } catch (e) {
          server.config.logger.error(String((e as Error)?.stack ?? e));
          if (!res.headersSent) res.status(500).json({ error: 'Dev server error' });
        }
      });
    },
  };
}
