import type { VisionArtifact } from './manifest';
import { verifyModelBytes } from './verifyBytes';
import { validateVisionModelFile } from './manifest';
import { idbGet, idbPut } from '../utils/platform/web/idb';

async function readModel(response: Response, limit: number) {
  if (!response.ok) throw new Error(`The model download returned ${response.status}.`);

  if (Number(response.headers.get('content-length')) > limit) throw new Error('The model exceeds the download limit.');

  const reader = response.body?.getReader();

  if (!reader) throw new Error('The model download has no body.');

  const chunks: Uint8Array[] = [];
  let length = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) break;

      length += value.byteLength;

      if (length > limit) throw new Error('The model exceeds the download limit.');

      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }

  const bytes = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

export async function webModelFile(value: unknown) {
  const model = validateVisionModelFile(value);
  const key = `vision:${model.sha256}`;
  const kept = await idbGet<Uint8Array>('trained', key);

  const verified = kept ? await verifyModelBytes(kept, model).catch(() => null) : null;

  if (verified) return verified;

  const url = `https://huggingface.co/${model.owner}/${model.repo}/resolve/${model.revision}/${model.file}`;
  const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(120000) });
  const bytes = await verifyModelBytes(await readModel(response, model.bytes), model);

  await idbPut('trained', key, bytes);

  return bytes;
}

export function modelCacheUrl(source: string, base: string, sha256: string) {
  const own = new URL(base);
  const url = new URL(source, own);

  if (
    url.protocol !== own.protocol ||
    url.host !== own.host ||
    url.pathname !== `/api/vision-model/${sha256}` ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error('The model cache address must stay inside Basecase.');

  return url;
}

export async function modelBytes(model: VisionArtifact, source?: string) {
  if ('source' in model) throw new Error('Supply retained local model bytes.');

  if (!source) return webModelFile(model);

  const url = modelCacheUrl(source, self.location.href, model.sha256);

  return verifyModelBytes(await readModel(await fetch(url, { credentials: 'omit' }), model.bytes), model);
}
