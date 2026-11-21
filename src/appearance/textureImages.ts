import type { Source } from 'three';

interface ImageEntry {
  source?: Source<ImageBitmap>;
  bitmap: ImageBitmap;
  refs: number;
}

export const images = new Map<string, ImageEntry>();

const pins = new Map<string, number>();
const reservations = new Set<{ pixels: number }>();
const MAX_IDLE_PIXELS = 8_388_608;

export const MAX_DECODED_PIXELS = 75_497_472;

const size = (entry: ImageEntry) => entry.bitmap.width * entry.bitmap.height;
const owned = (hash: string, entry: ImageEntry) => entry.refs > 0 || (pins.get(hash) ?? 0) > 0;
const reservedPixels = () => [...reservations].reduce((sum, entry) => sum + entry.pixels, 0);
const decodedPixels = () => [...images.values()].reduce((sum, entry) => sum + size(entry), 0);

function evict(hash: string, entry: ImageEntry): void {
  images.delete(hash);
  entry.bitmap.close();
}

export function trimImages(): void {
  let idle = [...images].reduce((sum, [hash, entry]) => sum + (owned(hash, entry) ? 0 : size(entry)), 0);

  for (const [hash, entry] of images) {
    if (idle <= MAX_IDLE_PIXELS) break;

    if (owned(hash, entry)) continue;

    idle -= size(entry);
    evict(hash, entry);
  }
}

export function reserveImage(pixels: number): () => void {
  for (const [hash, entry] of images) {
    if (decodedPixels() + reservedPixels() + pixels <= MAX_DECODED_PIXELS) break;

    if (!owned(hash, entry)) evict(hash, entry);
  }

  if (decodedPixels() + reservedPixels() + pixels > MAX_DECODED_PIXELS) throw new Error('Texture memory is full.');

  const reservation = { pixels };

  reservations.add(reservation);

  return () => reservations.delete(reservation);
}

export function retainImage(hash: string): () => void {
  pins.set(hash, (pins.get(hash) ?? 0) + 1);

  let released = false;

  return () => {
    if (released) return;

    released = true;

    const remaining = (pins.get(hash) ?? 1) - 1;

    if (remaining) pins.set(hash, remaining);
    else pins.delete(hash);

    trimImages();
  };
}

export function storeImage(hash: string, bitmap: ImageBitmap): void {
  if (images.has(hash)) bitmap.close();
  else images.set(hash, { bitmap, refs: 0 });

  trimImages();
}

export const imageResources = () => ({
  images: images.size,
  pixels: decodedPixels(),
  reservedPixels: reservedPixels(),
  leases: [...pins.values()].reduce((sum, count) => sum + count, 0),
});
