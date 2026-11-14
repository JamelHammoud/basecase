import fs from 'node:fs';
import { Readable } from 'node:stream';
import { isSafeFileId } from '../backend/constants.mjs';

export const TRY_VIDEO_PATH = '/api/try-video/';

const RANGE = /^bytes=(\d*)-(\d*)$/;

export function byteRange(header, size) {
  const match = typeof header === 'string' ? RANGE.exec(header.trim()) : null;

  if (!match || (!match[1] && !match[2])) return null;

  const suffix = !match[1];
  const start = suffix ? Math.max(0, size - Number(match[2])) : Number(match[1]);
  const end = suffix || !match[2] ? size - 1 : Math.min(Number(match[2]), size - 1);

  return start <= end ? { start, end } : false;
}

function idOf(url) {
  try {
    const { pathname } = new URL(url, 'http://localhost');

    if (!pathname.startsWith(TRY_VIDEO_PATH)) return null;

    const id = decodeURIComponent(pathname.slice(TRY_VIDEO_PATH.length));

    return isSafeFileId(id) ? id : null;
  } catch {
    return null;
  }
}

const isTryVideoUrl = (url) => {
  try {
    return new URL(url, 'http://localhost').pathname.startsWith(TRY_VIDEO_PATH);
  } catch {
    return false;
  }
};

const sizeOf = (file) => {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
};

export function tryVideoReply(store, { url, range }) {
  const id = idOf(url);
  const file = id ? store.videoFile(id) : null;
  const size = file ? sizeOf(file) : 0;

  if (!size) return { status: 404, headers: {} };

  const part = byteRange(range, size);

  if (part === false) return { status: 416, headers: { 'Content-Range': `bytes */${size}` } };

  const { start, end } = part ?? { start: 0, end: size - 1 };
  const headers = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Content-Length': String(end - start + 1),
    ...(part ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
  };

  return { status: part ? 206 : 200, headers, file, start, end };
}

const streamOf = (reply) => fs.createReadStream(reply.file, { start: reply.start, end: reply.end });

export function tryVideoResponse(store, request) {
  if (!isTryVideoUrl(request.url)) return null;

  const reply = tryVideoReply(store, { url: request.url, range: request.headers.get('range') });
  const body = reply.file && request.method !== 'HEAD' ? Readable.toWeb(streamOf(reply)) : null;

  return new Response(body, { status: reply.status, headers: reply.headers });
}

export function tryVideoMiddleware(store) {
  return (req, res) => {
    const reply = tryVideoReply(store, { url: req.originalUrl ?? req.url ?? '', range: req.headers.range });

    res.writeHead(reply.status, reply.headers);

    if (!reply.file || req.method === 'HEAD') {
      res.end();

      return;
    }

    const stream = streamOf(reply);

    stream.on('error', () => res.destroy());
    req.on('close', () => stream.destroy());
    stream.pipe(res);
  };
}
