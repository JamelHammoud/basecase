import { describe, expect, it } from 'vitest';
import { gallerySlug, parseGalleryBundle } from './galleryBundle';
import { galleryBundles, galleryIndex } from './galleryEntries';

const FILES = import.meta.glob<string>('../../public/gallery/*.json', {
  eager: true,
  query: '?raw',
  import: 'default',
});
const file = (name: string) => JSON.parse(FILES[`../../public/gallery/${name}`]);

describe('the web gallery', () => {
  it('ships every bundle as built, so a link never serves a stale Case', () => {
    for (const bundle of galleryBundles()) {
      const shipped = file(`${bundle.slug}.json`);

      expect(shipped).toEqual(JSON.parse(JSON.stringify(bundle)));
      expect(parseGalleryBundle(shipped).slug).toBe(bundle.slug);
    }

    expect(file('index.json')).toEqual(galleryIndex());
  });

  it('reads only plain slugs from the path', () => {
    expect(gallerySlug('/c/rover-reach-the-flag')).toBe('rover-reach-the-flag');
    expect(gallerySlug('/c/rover/')).toBe('rover');
    expect(gallerySlug('/c/../../etc')).toBeNull();
    expect(gallerySlug('/')).toBeNull();
  });

  it('refuses a bundle from the future or with hostile parts', () => {
    const bundle = JSON.parse(JSON.stringify(galleryBundles()[0]));

    expect(() => parseGalleryBundle({ ...bundle, formatVersion: 2 })).toThrow();
    expect(() =>
      parseGalleryBundle({ ...bundle, robot: { ...bundle.robot, parts: [{ id: '<x>', kind: 'box' }] } }),
    ).toThrow();
  });
});
