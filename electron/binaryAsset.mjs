import fs from 'node:fs';
import { Readable } from 'node:stream';

function rangeOf(range, size) {
  if (!range) return { start: 0, end: size - 1, partial: false };

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);

  if (!match || (!match[1] && !match[2])) return null;

  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;

  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start <= end && start < size
    ? { start, end, partial: true }
    : null;
}

export function fileResponse(file, request, type = 'application/octet-stream') {
  let stat;

  try {
    stat = fs.statSync(file);
  } catch {
    return new Response(null, { status: 404 });
  }

  if (!stat.isFile() || !['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 404 });

  const range = rangeOf(request.headers.get('range'), stat.size);

  if (!range) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });

  const { start, end, partial } = range;
  const headers = {
    'Content-Type': type,
    'Content-Length': String(end - start + 1),
    'Accept-Ranges': 'bytes',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cache-Control': 'no-store',
    ...(partial ? { 'Content-Range': `bytes ${start}-${end}/${stat.size}` } : {}),
  };
  const body = request.method === 'HEAD' ? null : Readable.toWeb(fs.createReadStream(file, { start, end }));

  return new Response(body, { status: partial ? 206 : 200, headers });
}

export function binaryAssetMiddleware(resolve) {
  return (req, res, next) => {
    const request = new Request(`http://localhost/api${req.url}`, {
      method: req.method,
      headers: req.headers,
    });
    const response = resolve(request);

    if (!response) return next();

    res.writeHead(response.status, Object.fromEntries(response.headers));

    if (!response.body) return res.end();

    const body = Readable.fromWeb(response.body);

    body.on('error', () => res.destroy());
    res.on('close', () => body.destroy());
    body.pipe(res);
  };
}
