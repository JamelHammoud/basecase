import { describe, expect, it } from 'vitest';
import { samplesOf, ShapeSolid } from './shapeSolid';

function bufferedSamples(pos: Float32Array, maxSamples: number): Float32Array {
  const count = pos.length / 3;
  const step = Math.max(1, Math.floor(count / maxSamples));
  const out: number[] = [];

  for (let i = 0; i < count; i += step) out.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);

  for (let t = 0; t + 2 < count && out.length / 3 < maxSamples * 1.5; t += 3 * step) {
    for (let k = 0; k < 3; k++) out.push((pos[t * 3 + k] + pos[t * 3 + 3 + k] + pos[t * 3 + 6 + k]) / 3);
  }

  return new Float32Array(out);
}

function positionsOf(count: number): Float32Array {
  return Float32Array.from({ length: count }, (_, i) => Math.sin(i * 7.13) * (i % 17) * 100);
}

describe('collision containment samples', () => {
  it('matches buffered vertices and centroids across stride and budget boundaries', () => {
    for (const coordinates of [0, 1, 2, 3, 6, 8, 9, 18, 27, 48, 897, 900, 903, 1800, 3600, 18000]) {
      const positions = positionsOf(coordinates);
      const before = positions.slice();
      const solid = new ShapeSolid(positions);

      for (const budget of [1, 2, 3, 3.5, 24, 299, 300, 301, 400, 600, 1200]) {
        const samples = samplesOf(solid, budget);

        expect(samples).toEqual(bufferedSamples(positions, budget));
        expect(samples.buffer.byteLength).toBe(samples.length * Float32Array.BYTES_PER_ELEMENT);
        expect(samplesOf(solid, budget)).toBe(samples);
      }

      expect(positions).toEqual(before);
    }
  });

  it('keeps caches separate by shape and budget while reading replacement geometry', () => {
    const positions = positionsOf(3600);
    const original = new ShapeSolid(positions);
    const replacement = new ShapeSolid(Float32Array.from(positions, (value) => value + 100));
    const first = samplesOf(original, 300);
    const otherBudget = samplesOf(original, 600);
    const edited = samplesOf(replacement, 300);

    expect(first).toHaveLength(1200);
    expect(otherBudget).toHaveLength(2400);
    expect(otherBudget).not.toBe(first);
    expect(edited).not.toBe(first);
    expect(edited).toEqual(bufferedSamples(replacement.positions, 300));
    expect(samplesOf(original, 300)).toBe(first);
    expect(samplesOf(new ShapeSolid(positions.slice()), 300)).not.toBe(first);
    expect(first).toEqual(bufferedSamples(positions, 300));
  });
});
