import fs from 'node:fs/promises';
import path from 'node:path';
import { MODEL_FILE_BYTES } from './modelRepo.mjs';

export const MODEL_PREFIX = '/api/vision-model/';

const HASH = /^[a-f0-9]{64}$/;

export function checkedModelHash(request) {
  const url = new URL(request.url);
  const hash = url.pathname.slice(MODEL_PREFIX.length);

  if (url.protocol === 'app:' && url.host !== 'basecase') return null;

  if (request.method !== 'GET' || !url.pathname.startsWith(MODEL_PREFIX) || !HASH.test(hash)) return null;

  return hash;
}

export async function modelResponse(request, libraryDir) {
  const hash = checkedModelHash(request);

  if (!hash) return new Response('Not found', { status: 404 });

  const folder = path.join(libraryDir, 'models');
  const directory = await fs.lstat(folder).catch(() => null);

  if (!directory?.isDirectory()) return new Response('Not found', { status: 404 });

  const file = path.join(folder, `${hash}.onnx`);
  const stat = await fs.lstat(file).catch(() => null);

  if (!stat?.isFile() || stat.size > MODEL_FILE_BYTES) return new Response('Not found', { status: 404 });

  const bytes = await fs.readFile(file);

  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(bytes.byteLength),
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Cache-Control': 'no-store',
    },
  });
}
