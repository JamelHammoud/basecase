import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../types/robotics';
import { eulerToMatrix, type V3 } from './agentFrame';
import { mirrorParts } from './agentMirror';
import { specToPart } from './agentScene';
import { findPort, portsOf, worldPort } from './ports';

const POSES: Array<{ position: V3; rotation: V3 }> = [
  { position: [40, 120, 10], rotation: [0, 0, 0] },
  { position: [55, 80, -12], rotation: [0, 0, 90] },
  { position: [30, 200, 5], rotation: [90, 0, 0] },
  { position: [62, 150, 20], rotation: [180, 0, -90] },
  { position: [48, 90, -30], rotation: [35, -20, 110] },
];

function servo(id: string, pose: (typeof POSES)[number], key = 'component:feetech-sts3215|c018') {
  return specToPart({ id, catalog: key, position: pose.position, rotation: pose.rotation });
}

const mirrorX = (v: V3): V3 => [-v[0], v[1], v[2]];
const gap = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function legacyMirror(part: ScenePart): ScenePart {
  const S = new THREE.Matrix4().makeScale(-1, 1, 1);
  const m = S.clone().multiply(eulerToMatrix(part.rotation)).multiply(S);
  const e = new THREE.Euler().setFromRotationMatrix(m, 'XYZ');

  return {
    ...part,
    position: mirrorX(part.position),
    rotation: [e.x, e.y, e.z].map((r) => (r * 180) / Math.PI) as V3,
  };
}

function worstPortError(src: ScenePart, copy: ScenePart) {
  return Math.max(
    ...portsOf(src).map((port) => {
      const want = worldPort(src, port);
      const got = portsOf(copy).map((q) => worldPort(copy, q));

      return Math.min(...got.map((g) => gap(g.position, mirrorX(want.position)) + gap(g.axis, mirrorX(want.axis))));
    }),
  );
}

describe('mirroring catalog parts by datum', () => {
  it.each(POSES.map((pose, i) => [i, pose] as const))(
    'lands the STS3215 output on the mirrored axis (%i)',
    (_i, pose) => {
      const left = servo('left_hip_servo', pose);
      const [right] = mirrorParts([left], [left.id], 'x', {});
      const output = findPort(left, 'output')!;
      const want = worldPort(left, output);
      const got = worldPort(right, findPort(right, 'output')!);

      expect(right.id).toBe('right_hip_servo');
      expect(gap(got.position, mirrorX(want.position))).toBeLessThan(0.1);
      expect(gap(got.axis, mirrorX(want.axis))).toBeLessThan(0.002);
      expect(worstPortError(left, right)).toBeLessThan(0.1);

      const legacy = legacyMirror(left);

      expect(gap(worldPort(legacy, output).position, mirrorX(want.position))).toBeGreaterThan(24.9);
    },
  );

  it('keeps every Dynamixel and board port on its mirrored twin', () => {
    for (const key of ['component:dynamixel-xl430-w250', 'component:raspberry-pi-5', 'hardware:socket_head|M3|12']) {
      for (const pose of POSES) {
        const left = servo('left_part', pose, key);
        const [right] = mirrorParts([left], [left.id], 'x', {});

        expect(worstPortError(left, right)).toBeLessThan(0.1);
      }
    }
  });
});

const box: NonNullable<Parameters<typeof specToPart>[0]['cad']> = {
  language: 'openscad',
  code: 'include <robotics.scad>\nw = 10;\ncuboid([w, 20, 30]);',
  positions: [0, 0, 0, 10, 0, 0, 10, 20, 0, 0, 20, 30],
  indices: [0, 1, 2, 0, 2, 3],
  stats: { volume: 6000 },
};

describe('mirror twins', () => {
  const foot = { ...specToPart({ id: 'left_foot', shape: 'cad_part', cad: box, position: [30, 0, 0] }), jointId: 'j1' };

  it('links the copy to its source, mirrors its code and drops the joint link', () => {
    const [copy] = mirrorParts([foot], ['left_foot'], 'x', {});

    expect(copy.mirrorOf).toEqual({ id: 'left_foot', axis: 'x' });
    expect(copy.jointId).toBeUndefined();
    expect(copy.cad!.code).toContain('mirror([1, 0, 0])');
    expect(copy.cad!.code.indexOf('w = 10;')).toBeLessThan(copy.cad!.code.indexOf('mirror('));
  });

  it('replaces the existing twin when mirrored again', () => {
    const [first] = mirrorParts([foot], ['left_foot'], 'x', {});
    const renamed = { ...first, id: 'rf' };
    const [again] = mirrorParts([foot, renamed], ['left_foot'], 'x', {});

    expect(again.id).toBe('rf');
  });

  it('copies the latest geometry of the source', () => {
    const edited = { ...foot, cad: { ...foot.cad!, positions: foot.cad!.positions.map((v) => v * 2) } };
    const [copy] = mirrorParts([edited], ['left_foot'], 'x', {});

    expect(copy.cad!.positions.map(Math.abs)).toEqual(edited.cad!.positions.map(Math.abs));
  });
});
