import { checkedModelRef, modelResolvePath, modelAssetPath, type ModelRef } from '../../electron/hub/modelPolicy.mjs';

export interface ModelCache {
  get: (key: string) => Promise<Uint8Array | undefined>;
  put: (key: string, bytes: Uint8Array) => Promise<void>;
  delete: (key: string) => Promise<void>;
}

export async function verifyModelBytes(bytes: Uint8Array, ref: ModelRef): Promise<boolean> {
  if (!bytes.byteLength || bytes.byteLength > ref.maxBytes) return false;

  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');

  return hex === ref.sha256;
}

async function fetchModel(ref: ModelRef, url: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    credentials: 'omit',
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) throw new Error('Couldn’t download the vision model.');

  if (Number(response.headers.get('content-length')) > ref.maxBytes) {
    await response.body?.cancel();

    throw new Error('The vision model exceeds its size limit.');
  }

  const reader = response.body?.getReader();

  if (!reader) throw new Error('The vision model download has no bytes.');

  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    for (;;) {
      const { value, done } = await reader.read();

      if (done) break;

      size += value.byteLength;

      if (size > ref.maxBytes) throw new Error('The vision model exceeds its size limit.');

      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

export const downloadModel = (ref: ModelRef) => fetchModel(ref, `https://huggingface.co${modelResolvePath(ref)}`);

export async function cachedDesktopModel(value: ModelRef): Promise<Uint8Array> {
  const ref = checkedModelRef(value);
  const bytes = await fetchModel(ref, modelAssetPath(ref.sha256));

  if (!(await verifyModelBytes(bytes, ref))) throw new Error('The vision model checksum doesn’t match its manifest.');

  return bytes;
}

export function createModelStore({
  cache,
  download = downloadModel,
}: {
  cache: ModelCache;
  download?: typeof downloadModel;
}) {
  const pending = new Map<string, Promise<Uint8Array>>();

  async function load(ref: ModelRef) {
    const found = await cache.get(ref.sha256);

    if (found && (await verifyModelBytes(found, ref))) return found;

    if (found) await cache.delete(ref.sha256);

    const bytes = await download(ref);

    if (!(await verifyModelBytes(bytes, ref))) throw new Error('The vision model checksum doesn’t match its manifest.');

    await cache.put(ref.sha256, bytes);

    return bytes;
  }

  return async (value: ModelRef): Promise<Uint8Array> => {
    const ref = checkedModelRef(value);
    const key = `${ref.sha256}:${ref.maxBytes}`;
    const existing = pending.get(key);

    if (existing) return new Uint8Array(await existing);

    const promise = load(ref).finally(() => pending.delete(key));

    pending.set(key, promise);

    return new Uint8Array(await promise);
  };
}
