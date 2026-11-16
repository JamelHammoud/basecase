import { readFile } from 'node:fs/promises';
import path from 'node:path';

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};

export function staticAssets(directory) {
  return async (_request, response, url) => {
    const entry = url.pathname === '/fleet' || url.pathname === '/fleet/enroll';
    const asset = /^\/assets\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(url.pathname);
    const favicon = url.pathname === '/favicon.svg';

    if (!entry && !asset && !favicon) {
      response.writeHead(404);
      response.end();

      return;
    }

    const filename = entry ? 'index.html' : url.pathname.slice(1);
    const bytes = await readFile(path.join(directory, filename));

    response.writeHead(200, {
      'Content-Type': MIME[path.extname(filename)] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-src 'none'; object-src 'none'; base-uri 'none'",
    });
    response.end(bytes);
  };
}
