import { describe, expect, it } from 'vitest';
import { COMPONENT_BY_ID } from '../data/components';
import { readFixedCameras } from './fixed';
import { clampLens, gridPoints, lensDirection, lensPoint, verticalDeg, type Lens } from './lens';
import { specLens } from './optics';

const ASPECT = 4 / 3;
const pinhole: Lens = { model: 'pinhole', hfovDeg: 90 };
const fisheye: Lens = { model: 'fisheye', fovDeg: 200 };

const angleDeg = ([x, y, z]: number[]) => (Math.acos(-z / Math.hypot(x, y, z)) * 180) / Math.PI;

describe('lens projection', () => {
  it('points the image centre straight ahead', () => {
    for (const lens of [pinhole, fisheye]) expect(lensDirection(lens, [0, 0], ASPECT)).toEqual([0, 0, -1]);
  });

  it('puts the horizontal edge at half the field of view', () => {
    expect(angleDeg(lensDirection(pinhole, [1, 0], ASPECT)!)).toBeCloseTo(45, 6);
    expect(angleDeg(lensDirection(fisheye, [1, 0], ASPECT)!)).toBeCloseTo(100, 6);
  });

  it('sees behind the camera with a fisheye wider than 180°', () => {
    const [, , z] = lensDirection(fisheye, [-0.95, 0], ASPECT)!;

    expect(z).toBeGreaterThan(0);
  });

  it('leaves the corners outside a fisheye image circle', () => {
    expect(lensDirection(fisheye, [1, 1], ASPECT)).toBeNull();
    expect(lensDirection(pinhole, [1, 1], ASPECT)).not.toBeNull();
  });

  it('round-trips points through direction and back', () => {
    for (const lens of [pinhole, fisheye]) {
      for (const p of gridPoints(8, 6)) {
        const dir = lensDirection(lens, p, ASPECT);

        if (!dir) continue;

        const back = lensPoint(lens, dir, ASPECT)!;

        expect(back[0]).toBeCloseTo(p[0], 9);
        expect(back[1]).toBeCloseTo(p[1], 9);
      }
    }
  });

  it('refuses directions behind a pinhole', () => {
    expect(lensPoint(pinhole, [0, 0, 1], ASPECT)).toBeNull();
  });

  it('gives a narrower vertical field than horizontal on a wide image', () => {
    expect(verticalDeg(pinhole, ASPECT)).toBeCloseTo(73.74, 2);
    expect(verticalDeg(fisheye, ASPECT)).toBeCloseTo(150, 6);
  });

  it('lays a grid out row by row from the top left', () => {
    const grid = gridPoints(2, 2);

    expect(grid).toEqual([
      [-0.5, 0.5],
      [0.5, 0.5],
      [-0.5, -0.5],
      [0.5, -0.5],
    ]);
  });

  it('clamps lenses to what each model can draw', () => {
    expect(clampLens({ model: 'pinhole', hfovDeg: 170 })).toEqual({ model: 'pinhole', hfovDeg: 120 });
    expect(clampLens({ model: 'fisheye', fovDeg: 300 })).toEqual({ model: 'fisheye', fovDeg: 240 });
  });
});

describe('catalog lenses', () => {
  const lensOf = (id: string) => specLens(COMPONENT_BY_ID[id].specs);

  it('reads the field of view row', () => {
    expect(lensOf('raspberry-pi-camera-3')).toEqual({ model: 'pinhole', hfovDeg: 66 });
    expect(lensOf('stereolabs-zed-2i')).toEqual({ model: 'pinhole', hfovDeg: 110 });
  });

  it('reads a depth camera’s depth row', () => {
    expect(lensOf('realsense-d435')).toEqual({ model: 'pinhole', hfovDeg: 87 });
    expect(lensOf('orbbec-gemini-336')).toEqual({ model: 'pinhole', hfovDeg: 90 });
  });

  it('reads a single horizontal angle', () => {
    expect(lensOf('arducam-ov9281-global-shutter-usb')).toEqual({ model: 'pinhole', hfovDeg: 70 });
  });

  it('converts a diagonal angle to horizontal', () => {
    const lens = lensOf('luxonis-oak-d-w');

    expect(lens?.model).toBe('pinhole');
    expect(lens?.model === 'pinhole' && lens.hfovDeg).toBeCloseTo(108.36, 1);
  });

  it('turns a wide diagonal into a fisheye', () => {
    expect(specLens([['Lens', 'M12, 1.7 mm, 180° diagonal']])).toEqual({ model: 'fisheye', fovDeg: 144 });
  });

  it('has no lens for a part without an angle', () => {
    expect(specLens([['Interface', 'USB-C']])).toBeNull();
  });
});

describe('fixed cameras', () => {
  it('keeps valid cameras and drops broken ones', () => {
    const cameras = readFixedCameras([
      {
        id: 'a',
        name: 'Outside',
        position: [0, 500, 1000],
        target: [0, 0, 0],
        lens: { model: 'pinhole', hfovDeg: 60 },
      },
      { id: 'b', name: 'Bad', position: [0, 0], target: [0, 0, 0], lens: { model: 'pinhole', hfovDeg: 60 } },
      { id: 'c', name: 'No lens', position: [0, 0, 0], target: [0, 0, 1] },
    ]);

    expect(cameras.map((c) => c.id)).toEqual(['a']);
  });
});
