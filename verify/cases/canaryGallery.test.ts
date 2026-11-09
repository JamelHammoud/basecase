import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { galleryIndex } from '../../src/gallery/galleryEntries';
import { realtimeProblems } from './driveJudge';
import { driveGallery, motionProblems, openGallery, type GalleryDrive, type GalleryHost } from './galleryApp';
import type { Fault } from './workerTap';

let host: GalleryHost;

beforeAll(async () => {
  host = await openGallery();
}, 180000);

afterAll(async () => {
  await host?.close();
});

async function planted(fault: Fault, counter: 'dropped' | 'rewritten'): Promise<GalleryDrive> {
  const [first] = galleryIndex();
  let run: GalleryDrive;

  try {
    run = await driveGallery(host, first.slug, fault);
  } catch (e) {
    throw new Error(`setup: ${(e as Error).message}`, { cause: e });
  }

  if (!run.tap || run.tap[counter] === 0)
    throw new Error(`setup: the fault was never planted (${JSON.stringify(run.tap)})`);

  return run;
}

describe('Stage 2 gallery canaries: faults planted in the production web build', () => {
  it('canary slow gallery: a gallery whose sim runs at half speed passes', async () => {
    expect(realtimeProblems((await planted('speed-0.5', 'rewritten')).samples)).toEqual([]);
  }, 240000);

  it('canary fast gallery: a gallery whose sim runs at double speed passes', async () => {
    expect(realtimeProblems((await planted('speed-2', 'rewritten')).samples)).toEqual([]);
  }, 240000);

  it('canary still gallery: a gallery whose W never reaches the sim passes', async () => {
    expect(motionProblems((await planted('frozen-drive', 'dropped')).movedMm)).toEqual([]);
  }, 240000);
});
