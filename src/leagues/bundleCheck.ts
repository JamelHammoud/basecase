import type { GalleryBundle } from '../gallery/galleryBundle';
import type { LeagueEntry, LeagueManifest } from './types';

export interface BundleCheckJob {
  manifest: LeagueManifest;
  entry: LeagueEntry;
  bytes: Uint8Array;
}

export type BundleCheckReply = { bundle: GalleryBundle } | { error: string };

export function verifyLeagueBundle(job: BundleCheckJob): Promise<GalleryBundle> {
  const worker = new Worker(new URL('./bundleCheck.worker.ts', import.meta.url), { type: 'module' });
  let timer: ReturnType<typeof setTimeout> | undefined;

  return new Promise<GalleryBundle>((resolve, reject) => {
    const fail = () => reject(new Error('The robot check stopped. Open the League again.'));

    timer = setTimeout(fail, 60000);

    worker.onmessage = ({ data }: MessageEvent<BundleCheckReply>) => {
      if ('error' in data) reject(new Error(data.error));
      else resolve(data.bundle);
    };
    worker.onerror = fail;
    worker.postMessage(job);
  }).finally(() => {
    clearTimeout(timer);
    worker.terminate();
  });
}
