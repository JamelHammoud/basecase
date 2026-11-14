import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { detectSheet } from './detect';
import { cutFileName, safeName, sheetDxf } from './dxf';
import { snapThickness } from './materials';
import { FOUR_HOLES, plateTriangles, pocketedBoxTriangles, turned } from './sheet.fixtures';

const plate = () => plateTriangles({ width: 60, height: 40, thickness: 3, holes: FOUR_HOLES });

function dxfLoops(dxf: string): Array<Array<[number, number]>> {
  const lines = dxf.split('\n');
  const loops: Array<Array<[number, number]>> = [];

  for (let i = 0; i + 1 < lines.length; i += 2) {
    if (lines[i] === '0' && lines[i + 1] === 'POLYLINE') loops.push([]);

    if (lines[i] !== '0' || lines[i + 1] !== 'VERTEX') continue;

    const x = Number(lines[i + 5]);
    const y = Number(lines[i + 7]);

    loops[loops.length - 1].push([x, y]);
  }

  return loops;
}

describe('detectSheet', () => {
  it('finds a 3 mm plate with four holes', () => {
    const profile = detectSheet(plate())!;

    expect(profile.thicknessMm).toBe(3);
    expect(profile.holes).toHaveLength(4);
    expect(profile.outline).toEqual([
      [0, 0],
      [60, 0],
      [60, 40],
      [0, 40],
    ]);
    expect(profile.areaMm2).toBeCloseTo(60 * 40 - 4 * Math.PI * 1.6 ** 2, 0);
  });

  it('finds the same plate turned and moved', () => {
    const profile = detectSheet(turned(plate(), new THREE.Euler(0.4, -1.1, 0.7), new THREE.Vector3(120, -30, 55)))!;

    expect(profile.thicknessMm).toBeCloseTo(3, 2);
    expect(profile.holes).toHaveLength(4);
    expect(profile.areaMm2).toBeCloseTo(detectSheet(plate())!.areaMm2, 0);
  });

  it('turns down a box with a pocket, a cube and a sphere', () => {
    const cube = new THREE.BoxGeometry(20, 20, 20).toNonIndexed().attributes.position.array;
    const sphere = new THREE.SphereGeometry(20).toNonIndexed().attributes.position.array;

    expect(detectSheet(pocketedBoxTriangles())).toBeNull();
    expect(detectSheet(cube)).toBeNull();
    expect(detectSheet(sphere)).toBeNull();
  });
});

describe('sheetDxf', () => {
  it('writes the outline and holes as closed polylines matching the face within 0.01 mm', () => {
    const dxf = sheetDxf(detectSheet(plate())!);
    const [outline, ...holes] = dxfLoops(dxf);

    expect(dxf.startsWith('0\nSECTION\n2\nHEADER\n')).toBe(true);
    expect(dxf.endsWith('0\nEOF\n')).toBe(true);
    expect(dxf.match(/^POLYLINE\n8\nCUT\n66\n1\n70\n1$/gm)).toHaveLength(5);
    expect(outline).toEqual([
      [0, 0],
      [60, 0],
      [60, 40],
      [0, 40],
    ]);

    const centers = holes.map((h) => {
      const center = FOUR_HOLES.find((c) => Math.hypot(h[0][0] - c.x, h[0][1] - c.y) < 2)!;

      for (const [x, y] of h) expect(Math.abs(Math.hypot(x - center.x, y - center.y) - center.r)).toBeLessThan(0.01);

      return center;
    });

    expect(new Set(centers).size).toBe(4);
  });

  it('gives byte-identical files for the same part', () => {
    expect(sheetDxf(detectSheet(plate())!)).toBe(sheetDxf(detectSheet(plate())!));
  });
});

describe('cut file names', () => {
  it('keep path characters out of the name', () => {
    expect(safeName('../../etc/passwd')).toBe('etc-passwd');
    expect(safeName('C:\\Robot\\Chest Plate')).toBe('c-robot-chest-plate');
    expect(safeName('///')).toBe('part');
    expect(cutFileName('../Shin/Plate', 'aluminum', 1.5)).toBe('shin-plate-aluminum-6061-1_5mm.dxf');
  });
});

describe('snapThickness', () => {
  it('snaps a thickness off stock to the nearest stock size', () => {
    expect(snapThickness('aluminum', 2.7)).toBe(3);
    expect(snapThickness('aluminum', 3.6)).toBe(4);
    expect(snapThickness('carbon', 2.3)).toBe(2.5);
    expect(snapThickness('acrylic', 0.8)).toBe(2);
    expect(snapThickness('aluminum', 20)).toBe(12);
  });
});
