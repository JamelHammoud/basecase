import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { galleryIndex } from '../../src/gallery/galleryEntries';
import { realtimeProblems } from './driveJudge';
import { driveGallery, motionProblems, openGallery, type GalleryHost } from './galleryApp';
import { GALLERY_MINIMUM } from './play';

let host: GalleryHost;

beforeAll(async () => {
  host = await openGallery();
}, 180000);

afterAll(async () => {
  await host?.close();
});

describe('gallery links from the production web build run at 1.0x real time in a headless browser', () => {
  it(`the gallery lists at least ${GALLERY_MINIMUM} links`, () => {
    expect(galleryIndex().length).toBeGreaterThanOrEqual(GALLERY_MINIMUM);
  });

  for (const { slug } of galleryIndex()) {
    it(`/c/${slug} loads, drives, keeps real time and moves while W is held`, async () => {
      const run = await driveGallery(host, slug);

      expect(realtimeProblems(run.samples)).toEqual([]);
      expect(motionProblems(run.movedMm)).toEqual([]);
      expect(run.errors).toEqual([]);
    }, 240000);
  }
});
