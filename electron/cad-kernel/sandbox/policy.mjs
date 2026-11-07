import path from 'node:path';

export const KERNEL_SCHEME = 'basecase-kernel';
export const KERNEL_ORIGIN = `${KERNEL_SCHEME}://kernel`;
export const KERNEL_PAGE = `${KERNEL_ORIGIN}/index.html`;
export const KERNEL_PARTITION = 'basecase-kernel-sandbox';
export const LIBRARY_PATH = '/library.json';
export const WORKER_PATH = '/worker.js';

const SEALED =
  "default-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; frame-ancestors 'none'";

export const PAGE_CSP = `${SEALED}; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'`;

export const WORKER_CSP = `${SEALED}; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; worker-src 'none'; connect-src 'none'`;

export const KERNEL_HTML =
  '<!doctype html><html><head><meta charset="utf-8"><title>CAD kernel</title></head>' +
  '<body><script type="module" src="/host.js"></script></body></html>';

export const SERVED_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
};

export function isKernelUrl(url) {
  try {
    const { protocol, host, username, password } = new URL(url);

    return protocol === `${KERNEL_SCHEME}:` && host === 'kernel' && !username && !password;
  } catch {
    return false;
  }
}

export const cspFor = (pathname) => (pathname === WORKER_PATH ? WORKER_CSP : PAGE_CSP);

export const responseHeaders = (pathname) => ({
  'Content-Type': SERVED_TYPES[path.extname(pathname)] ?? 'application/octet-stream',
  'Content-Security-Policy': cspFor(pathname),
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
});

const hasTraversal = (pathname) => pathname.split('/').includes('..') || pathname.includes('\\');

export function bundleFile(bundleDir, url) {
  if (!isKernelUrl(url)) return null;

  let pathname;

  try {
    pathname = decodeURIComponent(new URL(url).pathname);
  } catch {
    return null;
  }

  if (hasTraversal(pathname) || !SERVED_TYPES[path.extname(pathname)]) return null;

  const file = path.resolve(bundleDir, `.${pathname}`);

  return file.startsWith(path.resolve(bundleDir) + path.sep) ? file : null;
}

const MAX_CODE_CHARS = 400_000;
const DEFAULT_RENDER_MS = 90000;
const MIN_RENDER_MS = 1000;
const MAX_RENDER_MS = 300000;

export function checkedRenderJob({ language, code, expect }) {
  if (typeof code !== 'string' || code.length > MAX_CODE_CHARS) throw new Error('The part code is too long.');

  return { language: language === 'replicad' ? 'replicad' : 'openscad', code, expect };
}

export function renderTimeout({ timeoutMs = DEFAULT_RENDER_MS }) {
  const ms = Number(timeoutMs);

  return Number.isFinite(ms) ? Math.min(MAX_RENDER_MS, Math.max(MIN_RENDER_MS, ms)) : DEFAULT_RENDER_MS;
}
