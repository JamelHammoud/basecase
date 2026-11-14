import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../types/robotics';
import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { cutFileList, cutFileName, cutFilesZip } from './cutFiles';
import { detectSheet } from './detectSheet';
import { dxfLoops, sheetDxf } from './sheetDxf';
import { sheetOf, snapThickness } from './sheetStock';

const HOLES: Array<[number, number]> = [
  [10, 10],
  [90, 10],
  [10, 50],
  [90, 50],
];
const RADIUS = 1.6;

const trianglesOf = (geometry: THREE.BufferGeometry) =>
  Float32Array.from((geometry.index ? geometry.toNonIndexed() : geometry).getAttribute('position').array);

function plate(thickness = 3): Float32Array {
  const shape = new THREE.Shape([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(100, 0),
    new THREE.Vector2(100, 60),
    new THREE.Vector2(0, 60),
  ]);

  for (const [x, y] of HOLES) shape.holes.push(new THREE.Path().absarc(x, y, RADIUS, 0, Math.PI * 2, true));

  return trianglesOf(new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 24 }));
}

function quad(a: number[], b: number[], c: number[], d: number[]): number[] {
  return [...a, ...b, ...c, ...a, ...c, ...d];
}

function pocketedBox(): Float32Array {
  const ring = new THREE.Shape([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(40, 0),
    new THREE.Vector2(40, 40),
    new THREE.Vector2(0, 40),
  ]);

  ring.holes.push(
    new THREE.Path([
      new THREE.Vector2(10, 10),
      new THREE.Vector2(10, 30),
      new THREE.Vector2(30, 30),
      new THREE.Vector2(30, 10),
    ]),
  );

  const top = Array.from(trianglesOf(new THREE.ShapeGeometry(ring).translate(0, 0, 4)));

  return Float32Array.from([
    ...top,
    ...quad([0, 0, 0], [0, 40, 0], [40, 40, 0], [40, 0, 0]),
    ...quad([10, 10, 2], [30, 10, 2], [30, 30, 2], [10, 30, 2]),
    ...quad([0, 0, 0], [40, 0, 0], [40, 0, 4], [0, 0, 4]),
    ...quad([10, 10, 2], [10, 10, 4], [30, 10, 4], [30, 10, 2]),
  ]);
}

const shuffled = (t: Float32Array) => {
  const tris = Array.from({ length: t.length / 9 }, (_, i) => Array.from(t.subarray(i * 9, i * 9 + 9)));

  return Float32Array.from(tris.reverse().flat());
};

describe('detectSheet', () => {
  it('finds a 3 mm plate with four holes', () => {
    const sheet = detectSheet(plate())!;

    expect(sheet.thickness).toBe(3);
    expect(sheet.holes).toHaveLength(4);
    expect(sheet.outline).toHaveLength(4);
  });

  it('writes an outline and holes that match the face within 0.01 mm', () => {
    const [outline, ...holes] = dxfLoops(sheetDxf(detectSheet(plate())!));

    expect(outline).toEqual([
      [0, 0],
      [100, 0],
      [100, 60],
      [0, 60],
    ]);
    expect(holes).toHaveLength(4);

    for (const hole of holes) {
      const center = HOLES.find(([x, y]) => Math.hypot(hole[0][0] - x, hole[0][1] - y) < RADIUS * 2)!;

      for (const [x, y] of hole) expect(Math.abs(Math.hypot(x - center[0], y - center[1]) - RADIUS)).toBeLessThan(0.01);
    }
  });

  it('rejects a box with a pocket', () => {
    expect(detectSheet(pocketedBox())).toBeNull();
  });

  it('rejects a block thicker than any stock sheet', () => {
    expect(detectSheet(plate(20))).toBeNull();
  });

  it('gives byte-identical DXF for the same part, whatever the triangle order', () => {
    const first = sheetDxf(detectSheet(plate())!);

    expect(first.startsWith('0\nSECTION\n')).toBe(true);
    expect(sheetDxf(detectSheet(plate())!)).toBe(first);
    expect(sheetDxf(detectSheet(shuffled(plate()))!)).toBe(first);
  });
});

describe('sheet stock', () => {
  it('snaps a thickness off stock to the nearest size', () => {
    expect([
      snapThickness('aluminum', 3),
      snapThickness('carbon', 2.2),
      snapThickness('acrylic', 5.1),
      snapThickness('acrylic', 40),
    ]).toEqual([3.18, 2, 4.5, 12]);
  });

  it('reads the old CNC and laser-cut tags as sheet', () => {
    const tagged = (mechanicalTag: string) =>
      ({
        id: 'p',
        kind: 'box',
        role: 'solid',
        mechanicalTag,
        dimensions: { width: 80, height: 3.2, depth: 40 },
      }) as ScenePart;

    expect(sheetOf(tagged('CNC Aluminum'))).toEqual({ material: 'aluminum', thickness: 3.18 });
    expect(sheetOf(tagged('Laser-Cut Acrylic/Carbon'))).toEqual({ material: 'acrylic', thickness: 3 });
    expect(sheetOf(tagged('3D Printed PLA/PETG'))).toBeUndefined();
    expect(sheetOf({ ...tagged('CNC Aluminum'), dimensions: { width: 30, height: 30, depth: 30 } })).toBeUndefined();
  });
});

describe('cut files', () => {
  const sheet = { material: 'aluminum', thickness: 3.18 } as const;

  it('names each file by part, material and thickness, with no path in it', () => {
    expect(cutFileName('Chest Plate', sheet)).toBe('chest-plate-6061-aluminum-3.18mm.dxf');

    for (const name of ['../../etc/passwd', 'C:\\Windows\\win.ini', '/abs/path', '..', '']) {
      const file = cutFileName(name, sheet);

      expect(file).not.toMatch(/[/\\:]|\.\.|^[-.]/);
      expect(file.endsWith('-6061-aluminum-3.18mm.dxf')).toBe(true);
    }
  });

  it('writes one DXF per sheet part and names the ones that aren’t flat', () => {
    const part = (id: string, name: string) =>
      ({ id, name, kind: 'box', role: 'solid', visible: true, sheet, dimensions: {} }) as ScenePart;
    const files = cutFileList([
      part('a', 'Plate'),
      part('b', 'Plate'),
      part('c', 'Block'),
      { ...part('d', 'Bracket'), sheet: undefined },
      { ...part('e', 'Hidden'), visible: false },
    ]);
    const { zip, count, skipped } = cutFilesZip({ folder: 'robot', files }, (id) =>
      id === 'c' ? null : detectSheet(plate()),
    );

    expect(files.map((f) => f.name)).toEqual([
      'plate-6061-aluminum-3.18mm.dxf',
      'plate-6061-aluminum-3.18mm-2.dxf',
      'block-6061-aluminum-3.18mm.dxf',
    ]);
    expect(Object.keys(unzipSync(zip!))).toEqual([
      'robot/plate-6061-aluminum-3.18mm.dxf',
      'robot/plate-6061-aluminum-3.18mm-2.dxf',
    ]);
    expect(count).toBe(2);
    expect(skipped).toEqual(['c']);
    expect(cutFilesZip({ folder: 'robot', files: files.slice(2) }, () => null)).toEqual({
      zip: null,
      count: 0,
      skipped: ['c'],
    });
  });
});
