/**
 * Minimal static file server for Playwright e2e perf fixtures.
 * No build step, no framework — just raw HTTP for deterministic timing.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4319);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURI(new URL(req.url, `http://localhost`).pathname);

    // Mock telemetry ingest endpoint — absorbs SDK POSTs
    if (req.method === 'POST' && urlPath.startsWith('/v1/')) {
      let size = 0;
      req.on('data', (chunk) => (size += chunk.length));
      req.on('end', () => {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({ ok: true, received: size }));
      });
      return;
    }

    // Mock pageview pixel
    if (req.method === 'GET' && urlPath.startsWith('/v1/usage')) {
      res.writeHead(200, { 'Content-Type': 'image/gif' });
      res.end(
        Buffer.from([
          71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 0, 0, 0, 33, 249, 4, 1, 0, 0, 0, 0, 44, 0, 0, 0, 0, 1,
          0, 1, 0, 0, 2, 1, 68, 0, 59,
        ])
      );
      return;
    }

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': '*',
      });
      res.end();
      return;
    }

    const filePath = urlPath === '/' ? '/demo-app/index.html' : urlPath;
    const abs = join(__dirname, filePath);
    const data = await readFile(abs);
    const mime = MIME[extname(abs)] ?? 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`Not found: ${req.url}`);
  }
});

server.listen(PORT, () => {
  console.log(`[e2e fixture] listening on http://127.0.0.1:${PORT}`);
});
