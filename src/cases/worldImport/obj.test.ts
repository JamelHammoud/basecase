import { describe, expect, it } from 'vitest';
import { readObj } from './obj';
import { triangulatePolygon } from './polygon';

function area(points: number[][], triangles: number[][]): number {
  return triangles.reduce((sum, [a, b, c]) => {
    const [first, second, third] = [points[a], points[b], points[c]];

    return (
      sum +
      Math.abs((second[0] - first[0]) * (third[2] - first[2]) - (second[2] - first[2]) * (third[0] - first[0])) / 2
    );
  }, 0);
}

describe('OBJ world reader', () => {
  it('ignores inline comments on geometry, material links and material properties', () => {
    const lines = [
      'v 0 0 0',
      'v 0 0 3',
      'v 3 0 3',
      'v 3 0 0',
      'vt 0 0',
      'mtllib paint.mtl',
      'usemtl Paint',
      'f 1/1 2/1 3/1 4/1',
    ];
    const material = ['newmtl Paint', 'Kd 0.2 0.4 0.6'];
    const encoder = new TextEncoder();
    const read = (comment: string) =>
      readObj(encoder.encode(lines.map((line) => line + comment).join('\n')), {
        name: 'floor.obj',
        files: new Map([['paint.mtl', encoder.encode(material.map((line) => line + comment).join('\n'))]]),
      });

    expect(read(' # floor')).toEqual(read(''));
  });

  it('keeps the area of simple polygons with separate collinear edges', () => {
    const points = [
      [0, 0, 0],
      [0, 0, 1],
      [0, 0, 2],
      [0, 0, 3],
      [3, 0, 3],
      [3, 0, 0],
    ];

    for (const polygon of [points, points.toReversed()]) {
      const triangles = triangulatePolygon(polygon);

      expect(area(polygon, triangles)).toBe(9);
    }
  });

  it('keeps refusing intersecting polygons', () => {
    expect(() =>
      triangulatePolygon([
        [0, 0, 0],
        [3, 0, 3],
        [0, 0, 3],
        [2, 0, 0],
      ]),
    ).toThrow();
  });
});
