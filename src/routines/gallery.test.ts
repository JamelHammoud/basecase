import { describe, expect, it } from 'vitest';
import { bestMatch, emptyGallery, enroll, forget, readGallery } from './gallery';

const at = '2026-11-07T12:00:00Z';

describe('the face gallery', () => {
  it('matches an enrolled face and forgets it on request', () => {
    let gallery = enroll(emptyGallery(), { id: 'p1', name: 'Maya', embedding: [1, 0, 0], at });

    gallery = enroll(gallery, { id: 'p2', name: 'Sam', embedding: [0, 1, 0], at });

    expect(bestMatch(gallery, [0.9, 0.1, 0])).toMatchObject({ name: 'Maya' });

    gallery = forget(gallery, 'p1');

    expect(bestMatch(gallery, [0.9, 0.1, 0])?.name).toBe('Sam');
    expect(gallery.people.some((p) => p.embeddings.length && p.name === 'Maya')).toBe(false);
  });

  it('keeps the newest photos per person', () => {
    let gallery = emptyGallery();

    for (let i = 0; i < 20; i++) gallery = enroll(gallery, { id: 'p1', name: 'Maya', embedding: [1, i, 0], at });

    expect(gallery.people[0].embeddings).toHaveLength(16);
  });

  it('reads only well-formed galleries from disk', () => {
    expect(readGallery({ schema: 1, people: [{ id: 'a', name: 'A', embeddings: [[1, Number.NaN]] }] }).people).toEqual(
      [],
    );
    expect(readGallery('nope')).toEqual(emptyGallery());
  });
});
