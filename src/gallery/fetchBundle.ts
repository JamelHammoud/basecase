import { GALLERY_BUNDLE_MAX_BYTES, readGalleryBundleBytes, type GalleryBundle } from './galleryBundle';

async function cappedBytes(res: Response, max: number): Promise<Uint8Array> {
  if (Number(res.headers.get('content-length') ?? 0) > max || !res.body) throw new Error('Too large');

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    size += next.value.byteLength;

    if (size > max) {
      await reader.cancel();

      throw new Error('Too large');
    }

    chunks.push(next.value);
  }

  const bytes = new Uint8Array(size);
  let at = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }

  return bytes;
}

export async function fetchGalleryBundle(url: string): Promise<GalleryBundle> {
  const res = await fetch(url, { credentials: 'omit' });

  if (!res.ok) throw new Error(String(res.status));

  return readGalleryBundleBytes(await cappedBytes(res, GALLERY_BUNDLE_MAX_BYTES));
}
