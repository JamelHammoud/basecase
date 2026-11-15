import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import type { ScrewLine, StrengthJob } from '../../strength/types';
import { lightenInFrame } from './lightenFrame';
import { analysisHandlers } from './analysisOps';

it('moves every load and preserved interface into the same rigid frame as the worker mesh', () => {
  const matrix = new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(10, 20, 30);
  const line: ScrewLine = { from: [10, 20, 30], to: [10, 24, 30], radius: 3 };
  const job: StrengthJob = {
    key: 'joint|servo|bracket',
    part: 'bracket',
    material: 'PLA',
    infillPct: 15,
    down: [0, -1, 0],
    load: { origin: [10, 20, 30], axis: [0, 1, 0], torqueNmm: 500, screws: [line] },
    holds: [{ from: [6, 20, 30], to: [6, 24, 30], radius: 2 }],
  };
  const result = lightenInFrame(matrix.toArray(), {
    part: 'bracket',
    jobs: [job],
    targetShare: 0.5,
    minWallMm: 1.5,
    frozen: {
      lines: [line],
      boxes: [{ min: [6, 20, 30], max: [10, 24, 32] }],
      planes: [{ point: [10, 20, 30], normal: [0, 1, 0], halfThickness: 2 }],
    },
  });

  expect(result.jobs[0].load.origin).toEqual([0, 0, 0]);
  expect(result.jobs[0].load.axis[0]).toBeCloseTo(1);
  expect(result.jobs[0].load.axis[1]).toBeCloseTo(0);
  expect(result.jobs[0].load.screws[0].to[0]).toBeCloseTo(4);
  expect(result.jobs[0].holds[0].from[1]).toBeCloseTo(4);
  expect(result.jobs[0].load.torqueNmm).toBe(500);
  expect(result.jobs[0].down).toEqual([0, -1, 0]);
  expect(result.frozen.lines[0].radius).toBe(3);
  expect(result.frozen.boxes[0].min[0]).toBeCloseTo(0);
  expect(result.frozen.boxes[0].max).toEqual([4, 4, 2]);
  expect(result.frozen.planes[0].normal[0]).toBeCloseTo(1);
  expect(result.frozen.planes[0].point).toEqual([0, 0, 0]);
  expect(job.load.origin).toEqual([10, 20, 30]);
});

it('refuses a renderer fallback instead of running topology work on the main thread', async () => {
  vi.stubGlobal('document', {});

  try {
    await expect(
      analysisHandlers.analyze({
        geometries: [],
        shapes: [],
        task: { kind: 'lighten', instances: [], part: 'bracket', jobs: [], targetShare: 0.5, minWallMm: 1.5 },
      }),
    ).rejects.toThrow('Reload the app before lightening a part.');
  } finally {
    vi.unstubAllGlobals();
  }
});
