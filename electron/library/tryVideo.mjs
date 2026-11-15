import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { writeTryVideo, verifiedAsset } from './tryVideoUploads.mjs';

export const TRY_VIDEO_PREFIX = '/api/tries/video/';

function videoIds(url) {
  const { pathname, protocol, host } = new URL(url);

  if (protocol === 'app:' && host !== 'basecase') return null;

  if (!pathname.startsWith(TRY_VIDEO_PREFIX)) return null;

  const segments = pathname.slice(TRY_VIDEO_PREFIX.length).split('/');

  return segments.length === 2 ? segments.map(decodeURIComponent) : null;
}

function byteRange(value, size) {
  if (!value) return { start: 0, end: size - 1, partial: false };

  const match = /^bytes=(\d*)-(\d*)$/.exec(value);

  if (!match || (!match[1] && !match[2])) return null;

  const suffix = !match[1];
  const start = suffix ? Math.max(0, size - Number(match[2])) : Number(match[1]);
  const end = suffix || !match[2] ? size - 1 : Math.min(size - 1, Number(match[2]));

  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end && start < size
    ? { start, end, partial: true }
    : null;
}

export function tryVideoResponse(request, store) {
  try {
    const ids = videoIds(request.url);
    const video = ids && store.videoFile({ id: ids[0], camera: ids[1] });

    if (!video) return new Response(null, { status: 404 });

    const range = byteRange(request.headers.get('range'), video.size);

    if (!range) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${video.size}` } });

    const headers = {
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Content-Length': String(range.end - range.start + 1),
      'Cache-Control': 'no-store',
      'Cross-Origin-Resource-Policy': 'same-origin',
      ...(range.partial ? { 'Content-Range': `bytes ${range.start}-${range.end}/${video.size}` } : {}),
    };
    const body =
      request.method === 'HEAD'
        ? null
        : Readable.toWeb(
            fs.createReadStream(video.file, { ...range, flags: fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW }),
          );

    return new Response(body, { status: range.partial ? 206 : 200, headers });
  } catch {
    return new Response(null, { status: 404 });
  }
}

async function checkedVideoResponse(request, store) {
  try {
    const ids = videoIds(request.url);
    const video = ids && store.videoFile({ id: ids[0], camera: ids[1] });
    const asset = video && /^([a-f0-9]{64})\.mp4$/.exec(path.basename(video.file));

    if (!video || (asset && !(await verifiedAsset(video.file, asset[1])))) return new Response(null, { status: 404 });

    return tryVideoResponse(request, { videoFile: () => video });
  } catch {
    return new Response(null, { status: 404 });
  }
}

export async function tryVideoRequest(request, store) {
  if (request.method === 'GET' || request.method === 'HEAD') return checkedVideoResponse(request, store);

  if (request.method !== 'PUT' && request.method !== 'POST') return new Response(null, { status: 405 });

  try {
    const ids = videoIds(request.url);

    if (!ids) return new Response(null, { status: 404 });

    const hash = new URL(request.url).searchParams.get('asset');
    const status = await writeTryVideo(request, store, { id: ids[0], camera: ids[1], hash });

    return new Response(null, { status });
  } catch {
    return new Response(null, { status: 404 });
  }
}

export const tryVideoMiddleware = (store) => async (req, res) => {
  if (!['GET', 'HEAD', 'PUT', 'POST'].includes(req.method)) {
    res.writeHead(405);

    return res.end();
  }

  const hasBody = req.method === 'PUT';
  const request = new Request(`http://localhost${TRY_VIDEO_PREFIX}${(req.url ?? '').replace(/^\//, '')}`, {
    method: req.method,
    headers: req.headers,
    ...(hasBody ? { body: Readable.toWeb(req), duplex: 'half' } : {}),
  });
  const response = await tryVideoRequest(request, store);

  res.writeHead(response.status, Object.fromEntries(response.headers));

  if (!response.body) return res.end();

  const stream = Readable.fromWeb(response.body);

  res.on('close', () => stream.destroy());
  stream.on('error', () => res.destroy());
  stream.pipe(res);
};
