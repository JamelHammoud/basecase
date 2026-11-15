import { describe, expect, it } from 'vitest';
import { loadManifold } from '../wrap/manifold';
import { largestPiece } from './lightenPieces';

const piece = (mm3: number) => ({
  mm3,
  volume() {
    return this.mm3;
  },
});
const previous = <T extends { volume(): number }>(pieces: readonly T[]) =>
  [...pieces].sort((a, b) => b.volume() - a.volume())[0];

describe('Lighten connected-piece volumes', () => {
  it('matches ordered volume selection across generated pieces, ties and edits', () => {
    for (let seed = 0; seed < 120; seed++) {
      const pieces = Array.from({ length: seed % 43 }, (_, i) => piece(((i * 137 + seed * 53) % 31) / 7));
      const order = [...pieces];
      const volumes = pieces.map((p) => p.mm3);

      for (const source of [pieces, [...pieces].reverse()]) {
        const expected = previous(source);
        const result = largestPiece(Object.freeze(source));

        expect(result?.solid).toBe(expected);
        expect(result?.volumeMm3).toBe(expected?.mm3);
      }

      expect(pieces).toEqual(order);
      expect(pieces.map((p) => p.mm3)).toEqual(volumes);

      for (const p of pieces) p.mm3 = (p.mm3 * 3 + seed) % 17;

      expect(largestPiece(pieces)?.solid).toBe(previous(pieces));
    }
  });

  it('retains the first equal-volume piece, including zero-volume pieces', () => {
    const pieces = [piece(0), piece(-0), piece(0)];
    const first = largestPiece(pieces)!;

    expect(first.solid).toBe(pieces[0]);
    expect(Object.is(first.volumeMm3, 0)).toBe(true);
    expect(largestPiece([pieces[1], pieces[0]])?.solid).toBe(pieces[1]);
    expect(Object.is(largestPiece([pieces[1], pieces[0]])?.volumeMm3, -0)).toBe(true);
    expect(largestPiece([])).toBeUndefined();

    pieces[2].mm3 = 1;

    expect(largestPiece(pieces)?.solid).toBe(pieces[2]);
    expect(first.solid).toBe(pieces[0]);
    expect(first.volumeMm3).toBe(0);
  });

  it.each([300, 600])('measures each of %i pieces once, including the returned volume', (count) => {
    let reads = 0;
    const pieces = Array.from({ length: count }, (_, i) => ({
      volume: () => {
        reads++;

        return (i * 137) % count;
      },
    }));
    const expected = previous(pieces);

    reads = 0;

    const result = largestPiece(pieces)!;

    expect(result.solid).toBe(expected);
    expect(result.volumeMm3).toBe(count - 1);
    expect(reads).toBe(count);
  });

  it('selects a real decomposed Manifold solid with the same mesh and volume', async () => {
    const api = await loadManifold();
    const small = api.Manifold.cube([1, 2, 3]);
    const large = api.Manifold.cube([4, 5, 6]);
    const shifted = large.translate([20, 0, 0]);
    const combined = small.add(shifted);
    const pieces = combined.decompose();

    try {
      const expected = previous(pieces);
      const result = largestPiece(pieces)!;

      expect(pieces).toHaveLength(2);
      expect(result.solid).toBe(expected);
      expect(result.volumeMm3).toBe(120);
      expect(result.solid.getMesh()).toEqual(expected.getMesh());
      expect(result.solid.status()).toBe('NoError');
    } finally {
      [...pieces, combined, shifted, large, small].forEach((solid) => solid.delete());
    }
  });
});
