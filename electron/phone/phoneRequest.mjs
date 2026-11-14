import crypto from 'node:crypto';
import { phonePage } from './phonePage.mjs';

const TRUSTED_FETCH_SITES = new Set(['same-origin', 'none']);

export function isTrustedPhoneRequest(headers, { host, origin }) {
  const site = headers['sec-fetch-site'];

  if (headers.host !== host) return false;

  if (site !== undefined && !TRUSTED_FETCH_SITES.has(site)) return false;

  return headers.origin === undefined || headers.origin === origin;
}

export function tokenMatches(given, token) {
  if (typeof given !== 'string' || typeof token !== 'string') return false;

  const a = Buffer.from(given);
  const b = Buffer.from(token);

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function refuse(res, status) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'close',
  });
  res.end(status === 404 ? 'Not found' : 'Forbidden');
}

export function sendPage(res, origin) {
  const nonce = crypto.randomBytes(16).toString('base64');
  const socketOrigin = origin.replace(/^https:/, 'wss:');
  const policy = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    `connect-src ${socketOrigin}`,
    "img-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': policy,
  });
  res.end(phonePage(nonce));
}

export function refuseUpgrade(socket, status) {
  const reason = { 400: 'Bad Request', 403: 'Forbidden', 404: 'Not Found' }[status];

  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`, () => socket.destroy());
}

const WEBSOCKET_KEY = /^[A-Za-z0-9+/]{22}==$/;

export function isWebSocketHandshake(req) {
  const { headers } = req;

  return (
    req.method === 'GET' &&
    String(headers.upgrade ?? '').toLowerCase() === 'websocket' &&
    headers['sec-websocket-version'] === '13' &&
    WEBSOCKET_KEY.test(headers['sec-websocket-key'] ?? '')
  );
}
