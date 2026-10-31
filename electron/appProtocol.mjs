import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';

export const APP_ORIGIN = 'app://basecase';

export const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export function registerAppScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
        codeCache: true,
      },
    },
  ]);
}

const isolated = (headers) => {
  const out = new Headers(headers);

  for (const [name, value] of Object.entries(ISOLATION_HEADERS)) out.set(name, value);

  return out;
};

const isHtml = (response) => (response.headers.get('content-type') ?? '').startsWith('text/html');

async function respond(response, transformHtml) {
  const headers = isolated(response.headers);

  if (!transformHtml || !isHtml(response)) {
    return new Response(response.body, { status: response.status, headers });
  }

  headers.delete('content-length');

  return new Response(transformHtml(await response.text()), { status: response.status, headers });
}

function distFile(distDir, url) {
  const relative = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.resolve(distDir, relative);
  const inside = file === distDir || file.startsWith(distDir + path.sep);

  return inside && fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}

async function fromDist(request, { distDir, transformHtml }) {
  const file = distFile(distDir, request.url);

  if (!file) return new Response('Not found', { status: 404, headers: isolated({}) });

  const response = await net.fetch(pathToFileURL(file).toString());
  const type = TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  const typed = new Response(response.body, { status: 200, headers: { 'Content-Type': type } });

  return respond(typed, transformHtml);
}

async function fromDevServer(request, { devServer, transformHtml }) {
  const { pathname, search } = new URL(request.url);
  const response = await net.fetch(`${devServer}${pathname}${search}`, {
    method: request.method,
    headers: request.headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    duplex: 'half',
    bypassCustomProtocolHandlers: true,
  });

  return respond(response, transformHtml);
}

export function serveApp(options) {
  const handle = options.devServer ? fromDevServer : fromDist;

  protocol.handle('app', (request) => handle(request, options));
}
