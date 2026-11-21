import { describe, expect, it } from 'vitest';
import { sourcePoints } from './sourceGeometry';
import { sourceFiles } from './sourceFiles';
import { readYolo } from './yoloRead';

const jpeg = new Uint8Array([255, 216, 255, 192, 0, 11, 8, 0, 4, 0, 4, 1, 1, 17, 0, 255, 217]);
const names = ['point-1', 'point-2', 'point-3', 'point-4'];

function yolo(points: number[], stride = 3) {
  const encode = (value: string) => new TextEncoder().encode(value);
  const files = {
    'data.yaml': encode(`names: [apple]\ntrain: images\nkpt_shape: [4, ${stride}]\n`),
    'images/a.jpg': jpeg,
    'labels/a.txt': encode(`0 0.5 0.5 0.5 0.5 ${points.join(' ')}`),
  };

  return readYolo(
    sourceFiles({
      name: 'Fruit',
      files: Object.entries(files).map(([path, bytes]) => ({ path, size: bytes.length, read: async () => bytes })),
    }),
  );
}

describe('imported keypoint ordering and visibility', () => {
  it('retains ordered coordinates across every four-point visibility combination', async () => {
    for (let seed = 0; seed < 81; seed++) {
      const triples = names.map((name, i) => ({
        name,
        x: i / 4,
        y: (3 - i) / 4,
        visibility: Math.floor(seed / 3 ** i) % 3,
      }));
      const normalized = triples.flatMap(({ x, y, visibility }) => [x, y, visibility]);
      const pixels = triples.flatMap(({ x, y, visibility }) => [x * 4, y * 4, visibility]);
      const expected = triples
        .filter(({ visibility }) => visibility > 0)
        .map(({ name, x, y, visibility }) => ({ name, x: x * 4, y: y * 4, visible: visibility === 2 }));
      const imported = await yolo(normalized);

      expect(imported.frames[0].annotations[0].keypoints).toEqual(expected);
      expect(sourcePoints(pixels, names, [4, 4])).toEqual(expected);
      expect(pixels).toEqual(triples.flatMap(({ x, y, visibility }) => [x * 4, y * 4, visibility]));
    }
  });

  it('reads two-coordinate YOLO points as visible and returns independent results', async () => {
    const coordinates = [0, 0.25, 0.25, 0.5, 0.5, 0.75, 0.75, 0];
    const first = await yolo(coordinates, 2);
    const second = await yolo(coordinates, 2);
    const points = first.frames[0].annotations[0].keypoints;

    expect(points).toEqual(
      names.map((name, i) => ({ name, x: coordinates[i * 2] * 4, y: coordinates[i * 2 + 1] * 4, visible: true })),
    );
    points[0].x = 3;
    expect(second.frames[0].annotations[0].keypoints[0].x).toBe(0);
    expect(sourcePoints(undefined, names, [4, 4])).toEqual([]);
    expect(sourcePoints([], [], [4, 4])).toEqual([]);
  });

  it.each([-1, 0.5, 3, NaN, Infinity])(
    'refuses malformed visibility %s even after retained points',
    async (visibility) => {
      const values = [0, 0, 2, 0, 0, 1, 0, 0, 0, 0, 0, visibility];

      expect(() => sourcePoints(values, names, [4, 4])).toThrow();
      await expect(yolo(values)).rejects.toThrow();
    },
  );

  it('keeps the format-specific coordinate bounds for missing points', async () => {
    expect(sourcePoints([-10, 10, 0], ['missing'], [4, 4])).toEqual([]);
    expect(() => sourcePoints([4, 0, 1], ['hidden'], [4, 4])).toThrow();
    expect(() => sourcePoints([0, 0], ['short'], [4, 4])).toThrow();
    await expect(yolo([0, 0, 2, 0, 0, 1, 0, 0, 0, 1, 0, 0])).rejects.toThrow();
  });
});
