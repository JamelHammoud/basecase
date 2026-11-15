import { afterEach, describe, expect, it, vi } from 'vitest';
import * as homography from './homography';
import { focalOf, toLens, viewMat, type FrameSize, type SeenTag, type TrackMat, type TrackTag } from './matSolve';

vi.mock('./homography', { spy: true });

afterEach(() => vi.clearAllMocks());

const frame: FrameSize = { width: 1280, height: 720 };

function fixture(count: number, variant = 0) {
  const tags = Array.from({ length: count }, (_, id): TrackTag => {
    const x = (id % 10) * 120;
    const z = Math.floor(id / 10) * 120;
    const size = 40 + (id % 3) * 5;

    return {
      id,
      size,
      corners: [
        [x, z],
        [x + size, z],
        [x + size, z + size],
        [x, z + size],
      ],
    };
  });
  const mat: TrackMat = { tags, base: { id: count + 1, size: 50, height: 40, up: [0, 1] } };
  const angle = variant * 0.17;
  const transform = [
    0.002 * Math.cos(angle),
    -0.001 * Math.sin(angle),
    0.1,
    0.002 * Math.sin(angle),
    0.001 * Math.cos(angle),
    -0.2,
    0.0003,
    -0.0004,
    1,
  ];
  const seen = tags.map((tag): SeenTag => ({
    id: tag.id,
    corners: tag.corners.map(([x, z], i) => {
      const shrink = variant % 3 === 0 ? 0.97 : 1;
      const center = tag.corners[0].map((v) => v + tag.size / 2);
      const [u, v] = homography.apply(transform, [
        center[0] + (x - center[0]) * shrink,
        center[1] + (z - center[1]) * shrink,
      ]);
      const noise = variant % 2 ? Math.sin(tag.id + i) * 0.4 : 0;

      return [((u + 1) * frame.width) / 2 + noise, (v * frame.width) / 2 + frame.height / 2 - noise];
    }),
  }));

  return { mat, seen };
}

function previousView(seen: SeenTag[], mat: TrackMat, size: FrameSize) {
  const byId = new Map(mat.tags.map((tag) => [tag.id, tag]));
  const matched = seen.flatMap((s) => {
    const tag = byId.get(s.id);

    return tag ? [{ tag, seen: s }] : [];
  });

  if (matched.length < 2) return null;

  const pairs = matched.flatMap(({ tag, seen: s }) =>
    tag.corners.map((corner, i) => ({ from: corner, to: toLens(size, s.corners[i]) })),
  );
  const fitted = homography.fitHomography(pairs);
  const inverse = fitted && homography.invert(fitted);

  if (!fitted || !inverse) return null;

  const scales = matched.map(({ tag, seen: s }) => {
    const floor = s.corners.map((c) => homography.apply(inverse, toLens(size, c)));
    const sides = floor.map((p, i) => Math.hypot(p[0] - floor[(i + 1) % 4][0], p[1] - floor[(i + 1) % 4][1]));

    return sides.reduce((sum, value) => sum + value, 0) / 4 / tag.size;
  });
  const sum = pairs.reduce((total, p) => {
    const [x, z] = homography.apply(inverse, p.to);

    return total + (x - p.from[0]) ** 2 + (z - p.from[1]) ** 2;
  }, 0);

  return {
    homography: fitted,
    tags: matched.length,
    scale: scales.sort((a, b) => a - b)[Math.floor(scales.length / 2)],
    residualMm: Math.sqrt(sum / pairs.length),
    focal: focalOf(fitted),
  };
}

describe('shared mat corner measurements', () => {
  it('matches the previous complete view for perspective, noise, print scales and aspect ratios', () => {
    for (let variant = 0; variant < 24; variant++) {
      const { mat, seen } = fixture(2 + (variant % 7), variant);
      const original = structuredClone({ mat, seen });
      const size = { width: 1280, height: 480 + variant * 20 };

      expect(viewMat(seen, mat, size)).toEqual(previousView(seen, mat, size));
      expect({ mat, seen }).toEqual(original);
    }
  });

  it('retains tag matching, duplicate observations, input order and the last catalog match', () => {
    const { mat, seen } = fixture(5, 7);

    mat.tags.push({ ...mat.tags[1], size: 75 });
    seen.reverse();
    seen.splice(
      2,
      0,
      {
        id: mat.base.id,
        corners: [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
      },
      seen[0],
    );

    expect(viewMat(seen, mat, frame)).toEqual(previousView(seen, mat, frame));
    expect(viewMat(seen, mat, frame)?.tags).toBe(6);
  });

  it('reads edited observations, mat corners and tag sizes on each call', () => {
    const { mat, seen } = fixture(4);
    const first = viewMat(seen, mat, frame);

    seen[0].corners[1][0] += 15;
    mat.tags[1].corners[2][1] += 10;
    mat.tags[2].size *= 0.8;

    const next = viewMat(seen, mat, frame);

    expect(next).toEqual(previousView(seen, mat, frame));
    expect(next).not.toEqual(first);
  });

  it('refuses missing matches and degenerate observations without floor projections', () => {
    const { mat, seen } = fixture(3);
    const degenerate = seen.map((s) => ({ ...s, corners: s.corners.map((): [number, number] => [10, 10]) }));

    vi.mocked(homography.apply).mockClear();
    expect(viewMat([], mat, frame)).toBeNull();
    expect(viewMat(seen.slice(0, 1), mat, frame)).toBeNull();
    expect(viewMat(degenerate, mat, frame)).toBeNull();
    expect(homography.apply).not.toHaveBeenCalled();
  });

  it.each([75, 150])('projects each of %i tags once for both metrics', (count) => {
    const { mat, seen } = fixture(count, 1);

    vi.mocked(homography.apply).mockClear();

    const expected = previousView(seen, mat, frame);

    expect(homography.apply).toHaveBeenCalledTimes(count * 8);
    vi.mocked(homography.apply).mockClear();
    expect(viewMat(seen, mat, frame)).toEqual(expected);
    expect(homography.apply).toHaveBeenCalledTimes(count * 4);
  });
});
