import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseSvgTo3DNodes } from './svgTo3DParser';

type Loop = Array<[number, number]>;

function shapePath(fill: string, color: number, ...loops: Loop[]): THREE.ShapePath {
  const sp = new THREE.ShapePath();

  for (const loop of loops) {
    sp.moveTo(...loop[0]);
    loop.slice(1).forEach((p) => sp.lineTo(...p));
    sp.currentPath!.closePath();
  }

  sp.color = new THREE.Color(color);
  sp.userData = { style: { fill } };

  return sp;
}

function parsed(paths: THREE.ShapePath[]) {
  vi.spyOn(SVGLoader.prototype, 'parse').mockReturnValue({ paths, xml: {} as SVGSVGElement });
}

const plate: Loop = [
  [0, 0],
  [100, 0],
  [100, 40],
  [0, 40],
];
const hole: Loop = [
  [20, 10],
  [20, 30],
  [40, 30],
  [40, 10],
];

describe('parseSvgTo3DNodes', () => {
  afterEach(() => vi.restoreAllMocks());

  it('turns a filled path with a hole into a normalized contour extrusion', () => {
    parsed([
      shapePath('#ff0000', 0xff0000, plate, hole),
      shapePath('none', 0x00ff00, [
        [0, 0],
        [10, 0],
        [10, 10],
      ]),
    ]);

    const r = parseSvgTo3DNodes('<svg/>', { fileName: 'Logo.svg' });
    const node = r.nodes[0];
    const xs = node.contour!.outerLoop.map(([x]) => x);
    const zs = node.contour!.outerLoop.map(([, z]) => z);

    expect(r).toMatchObject({
      name: 'Logo',
      shapeCount: 1,
      holeCount: 1,
      aspectRatio: 2.5,
      suggestedDimensions: { width: 70, height: 10, depth: 28, thickness: 4 },
      svgDataUrl: 'data:image/svg+xml;utf8,%3Csvg%2F%3E',
    });
    expect(node).toMatchObject({ name: 'Logo Path 1', nodeType: 'contour_extrude', color: '#ff0000' });
    expect(node.contour!.bevel).toBe(true);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]).toEqual([-0.5, 0.5, -0.5, 0.5]);

    const holes = node.contour?.holes ?? [];

    expect(holes).toHaveLength(1);
    expect(holes[0].every(([x, z]) => x >= -0.3 && x <= -0.1 && z >= -0.25 && z <= 0.25)).toBe(true);
  });

  it('keeps a tall outline narrow and applies the overrides', () => {
    parsed([
      shapePath('none', 0x111111, [
        [0, 0],
        [10, 0],
        [10, 80],
        [0, 80],
      ]),
    ]);

    const r = parseSvgTo3DNodes('<svg/>', {
      fileName: '.svg',
      targetSpanMm: 50,
      extrudeHeightMm: 4,
      bevel: false,
      overrideColor: '#123456',
    });

    expect(r).toMatchObject({ name: 'SVG Part', aspectRatio: 0.13, suggestedDimensions: { width: 8, depth: 50 } });
    expect(r.nodes[0]).toMatchObject({ color: '#123456', contour: { bevel: false } });
  });

  it('asks for closed shapes when there are none', () => {
    parsed([]);

    expect(() => parseSvgTo3DNodes('<svg/>')).toThrow('Use an SVG with closed shapes, or try a sample.');
  });
});
