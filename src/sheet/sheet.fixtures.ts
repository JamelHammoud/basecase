import { ExtrudeGeometry, Path, Shape, ShapeGeometry } from 'three';
import type { ScenePart } from '../types/robotics';

export function plateTriangles(
  options: { holes?: boolean; concave?: boolean; tilt?: boolean; steps?: number } = {},
): Float32Array {
  const shape = new Shape();
  const outline = options.concave
    ? [
        [0, 0],
        [80, 0],
        [80, 30],
        [45, 30],
        [45, 60],
        [0, 60],
      ]
    : [
        [0, 0],
        [80, 0],
        [80, 60],
        [0, 60],
      ];

  outline.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();

  if (options.holes !== false) {
    for (const [x, y] of [
      [10, 10],
      [70, 10],
      [10, 50],
      [30, 50],
    ]) {
      const hole = new Path();

      hole.absarc(x, y, 2, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
  }

  const geometry = new ExtrudeGeometry(shape, {
    depth: 3,
    bevelEnabled: false,
    curveSegments: 12,
    steps: options.steps ?? 1,
  });

  if (options.tilt) geometry.rotateX(0.43).rotateY(0.29);

  const triangles = (geometry.getAttribute('position').array as Float32Array).slice();

  geometry.dispose();

  return triangles;
}

export function sheetPart(overrides: Partial<ScenePart> = {}): ScenePart {
  return {
    id: 'plate',
    name: 'Chest plate',
    kind: 'box',
    category: 'structure',
    role: 'solid',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    dimensions: { width: 80, height: 60, depth: 3 },
    color: '#777777',
    note: '',
    visible: true,
    locked: false,
    ...overrides,
  };
}

function wallTriangles(loop: number[][], low: number, high: number): number[] {
  return loop.flatMap(([x, y], i) => {
    const [a, b] = loop[(i + 1) % loop.length];

    return [x, y, low, a, b, low, a, b, high, x, y, low, a, b, high, x, y, high];
  });
}

export function pocketTriangles(): Float32Array {
  const shape = new Shape();
  const outer = [
    [0, 0],
    [80, 0],
    [80, 60],
    [0, 60],
  ];
  const inner = [
    [20, 20],
    [20, 40],
    [60, 40],
    [60, 20],
  ];

  outer.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();

  const pocket = new Path();

  inner.forEach(([x, y], i) => (i ? pocket.lineTo(x, y) : pocket.moveTo(x, y)));
  pocket.closePath();
  shape.holes.push(pocket);

  const ring = new ShapeGeometry(shape).toNonIndexed();

  ring.translate(0, 0, 3);

  const bottom = [0, 0, 0, 80, 60, 0, 80, 0, 0, 0, 0, 0, 0, 60, 0, 80, 60, 0];
  const floor = [20, 20, 1, 60, 20, 1, 60, 40, 1, 20, 20, 1, 60, 40, 1, 20, 40, 1];
  const triangles = Float32Array.from([
    ...bottom,
    ...floor,
    ...ring.getAttribute('position').array,
    ...wallTriangles(outer, 0, 3),
    ...wallTriangles(inner, 1, 3),
  ]);

  ring.dispose();

  return triangles;
}
