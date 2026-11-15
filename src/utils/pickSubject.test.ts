import { describe, expect, it } from 'vitest';
import { pickSubject } from './photoMask';
import { seededRandom } from './seededRandom';
import { maskArea, maskBounds, type Mask, type MaskBox } from './silhouetteProfile';

function rectangle(width: number, height: number, box: MaskBox): Mask {
  const data = new Uint8Array(width * height);

  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) data[y * width + x] = 1;

  return { width, height, data };
}

function sortedSubject(instances: Mask[]) {
  const scored = instances
    .map((mask) => ({ mask, box: maskBounds(mask), area: maskArea(mask) }))
    .filter((s) => s.area > 0)
    .map((s) => {
      const cx = (s.box.x0 + s.box.x1) / 2 / s.mask.width - 0.5;
      const cy = (s.box.y0 + s.box.y1) / 2 / s.mask.height - 0.5;

      return { ...s, score: s.area * (1 - Math.min(0.5, Math.hypot(cx, cy))) };
    })
    .sort((a, b) => b.score - a.score);
  const main = scored[0];

  if (!main) return null;

  const parts = scored.filter((s) => {
    const w = Math.min(main.box.x1, s.box.x1) - Math.max(main.box.x0, s.box.x0) + 1;
    const h = Math.min(main.box.y1, s.box.y1) - Math.max(main.box.y0, s.box.y0) + 1;
    const area = Math.max(0, s.box.x1 - s.box.x0 + 1) * Math.max(0, s.box.y1 - s.box.y0 + 1);

    return s === main || (w > 0 && h > 0 && (w * h) / Math.max(1, area) > 0.5);
  });
  const data = new Uint8Array(main.mask.data.length);

  for (const { mask } of parts) for (let i = 0; i < data.length; i++) data[i] |= mask.data[i];

  return { mask: { data, width: main.mask.width, height: main.mask.height }, kept: parts.length };
}

describe('photo subject selection', () => {
  it('matches sorted selection across seeded masks without changing its sources', () => {
    const random = seededRandom('123456789abcdef0123456789abcdef0');

    for (let trial = 0; trial < 240; trial++) {
      const width = 1 + Math.floor(random() * 30);
      const height = 1 + Math.floor(random() * 30);
      const masks = Array.from({ length: trial % 13 }, () => {
        const x0 = Math.floor(random() * width);
        const y0 = Math.floor(random() * height);
        const box = {
          x0,
          y0,
          x1: x0 + Math.floor(random() * (width - x0)),
          y1: y0 + Math.floor(random() * (height - y0)),
        };
        const mask = rectangle(width, height, box);

        for (let i = 0; i < mask.data.length; i++) if (random() < 0.3) mask.data[i] = 0;

        return mask;
      });
      const before = masks.map((mask) => ({ ...mask, data: mask.data.slice() }));

      expect(pickSubject(masks)).toEqual(sortedSubject(masks));
      expect(masks).toEqual(before);
    }
  });

  it('keeps the first equally scored subject in either source order', () => {
    const left = rectangle(8, 8, { x0: 2, x1: 2, y0: 4, y1: 4 });
    const right = rectangle(8, 8, { x0: 6, x1: 6, y0: 4, y1: 4 });

    expect(pickSubject([left, right])).toEqual({ mask: left, kept: 1 });
    expect(pickSubject([right, left])).toEqual({ mask: right, kept: 1 });
  });

  it('merges only overlaps above one half and counts repeated instances', () => {
    const main = rectangle(10, 10, { x0: 2, x1: 5, y0: 2, y1: 5 });
    const half = rectangle(10, 10, { x0: 4, x1: 7, y0: 2, y1: 3 });
    const above = rectangle(10, 10, { x0: 3, x1: 6, y0: 2, y1: 3 });
    const expected = main.data.slice();

    for (let i = 0; i < expected.length; i++) expected[i] |= above.data[i];

    expect(pickSubject([half, above, main, main])).toEqual({
      mask: { ...main, data: expected },
      kept: 3,
    });
  });

  it('returns null for empty instances and empty masks', () => {
    const empty = { width: 8, height: 8, data: new Uint8Array(64) };

    expect(pickSubject([])).toBeNull();
    expect(pickSubject([empty, empty])).toBeNull();
  });

  it('owns each output and reads edited pixels on the next selection', () => {
    const mask = rectangle(8, 8, { x0: 2, x1: 5, y0: 2, y1: 5 });
    const first = pickSubject([mask])!;
    const second = pickSubject([mask])!;

    first.mask.data.fill(0);

    expect(second.mask.data).toEqual(mask.data);
    expect(second.mask.data).not.toBe(mask.data);

    mask.data.fill(0);

    expect(pickSubject([mask])).toBeNull();
    expect(maskArea(second.mask)).toBe(16);
  });
});
