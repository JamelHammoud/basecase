import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { RobotAnimation, RobotJoint, ScenePart } from '../types/robotics';
import { buildGait, goalParts, sampleAnimation, type PointOf } from './animation';
import { buildRig, forwardKinematics, partMotion, type Rig, type V3 } from './kinematics';

const part = (id: string, position: V3, size: V3): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position,
  rotation: [0, 0, 0],
  dimensions: { width: size[0], height: size[1], depth: size[2] },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
  group: { id: 'bot', name: 'Bot' },
});

const pitch = (id: string, [parent, child]: [string, string], origin: V3, range: [number, number]): RobotJoint => ({
  id,
  name: id,
  type: 'revolute',
  parent: [parent],
  child: [child],
  origin,
  axis: [1, 0, 0],
  range,
});

function biped() {
  const parts = [part('pelvis', [0, 220, 0], [100, 30, 50])];
  const joints: RobotJoint[] = [];

  for (const [side, x] of [
    ['left', 40],
    ['right', -40],
  ] as const) {
    parts.push(
      part(`${side}_thigh`, [x, 160, 0], [30, 90, 30]),
      part(`${side}_shin`, [x, 70, 0], [25, 90, 25]),
      part(`${side}_foot`, [x, 10, 10], [30, 20, 60]),
    );
    joints.push(
      pitch(`${side}_hip`, ['pelvis', `${side}_thigh`], [x, 205, 0], [-120, 60]),
      pitch(`${side}_knee`, [`${side}_thigh`, `${side}_shin`], [x, 115, 0], [0, 150]),
      pitch(`${side}_ankle`, [`${side}_shin`, `${side}_foot`], [x, 25, 0], [-60, 60]),
    );
  }

  return { parts, rig: buildRig(joints, parts) };
}

function pointOfParts(rig: Rig, parts: ScenePart[]): PointOf {
  return (id, where) => {
    const ids = goalParts(rig, id);
    const box = new THREE.Box3();

    for (const p of parts.filter((q) => ids.includes(q.id))) {
      const half = new THREE.Vector3(p.dimensions.width, p.dimensions.height, p.dimensions.depth).multiplyScalar(0.5);

      box.union(new THREE.Box3(new THREE.Vector3(...p.position).sub(half), new THREE.Vector3(...p.position).add(half)));
    }

    if (box.isEmpty()) return null;

    const c = box.getCenter(new THREE.Vector3());

    return where === 'bottom' ? [c.x, box.min.y, c.z] : [c.x, c.y, c.z];
  };
}

const wave: RobotAnimation = {
  id: 'wave',
  name: 'Wave',
  duration: 2,
  loop: false,
  interpolation: 'linear',
  keyframes: [
    { t: 0, values: { a: 0, b: 10 } },
    { t: 1, values: { a: 90, b: 30 }, root: { position: [0, 10, 0] } },
    { t: 2, values: { a: 30, b: 30 } },
  ],
};

describe('sampleAnimation', () => {
  it('returns keyframe values at keyframe times', () => {
    expect(sampleAnimation(wave, 0).values).toEqual({ a: 0, b: 10 });
    expect(sampleAnimation(wave, 1).values).toEqual({ a: 90, b: 30 });
    expect(sampleAnimation(wave, 2).values).toEqual({ a: 30, b: 30 });
  });

  it('interpolates linearly between keyframes and clamps outside the clip', () => {
    const mid = sampleAnimation(wave, 0.5);

    expect(mid.values).toEqual({ a: 45, b: 20 });
    expect(mid.root?.position).toEqual([0, 5, 0]);
    expect(sampleAnimation(wave, -3).values).toEqual({ a: 0, b: 10 });
    expect(sampleAnimation(wave, 9).values).toEqual({ a: 30, b: 30 });
  });

  it('passes through keyframes when smooth and wraps when looping', () => {
    const smooth = { ...wave, interpolation: 'smooth' as const, loop: true };

    expect(sampleAnimation(smooth, 1).values.a).toBeCloseTo(90);
    expect(sampleAnimation(smooth, 0.5).values.a).toBeGreaterThan(45);
    expect(sampleAnimation(smooth, 2.5).values.a).toBeCloseTo(sampleAnimation(smooth, 0.5).values.a);
  });
});

describe('buildGait', () => {
  it('keeps stance feet on the ground and lifts swing feet', () => {
    const { parts, rig } = biped();
    const pointOf = pointOfParts(rig, parts);
    const built = buildGait(
      rig,
      { feet: ['left_foot', 'right_foot'], sway: 0, samples: 20 },
      { values: {} },
      { pointOf, name: 'Walk' },
    );

    if (typeof built === 'string') throw new Error(built);

    const { keyframes, duration } = built.animation;
    const duty = 0.6;
    const soleY = (k: (typeof keyframes)[number], foot: string) => {
      const m = partMotion(rig, forwardKinematics(rig, k), foot)!;

      return new THREE.Vector3(...pointOf(foot, 'bottom')!).applyMatrix4(m).y;
    };
    const lifts = { left_foot: 0, right_foot: 0 };

    expect(built.animation).toMatchObject({ name: 'Walk', loop: true, source: 'gait' });
    expect(keyframes).toHaveLength(20);

    for (const k of keyframes) {
      const ph = k.t / duration;

      for (const [foot, offset] of [
        ['left_foot', 0],
        ['right_foot', 0.5],
      ] as const) {
        const p = (((ph - offset) % 1) + 1) % 1;
        const y = soleY(k, foot);

        if (p < duty) expect(Math.abs(y)).toBeLessThan(2);
        else lifts[foot] = Math.max(lifts[foot], y);
      }
    }

    expect(lifts.left_foot).toBeGreaterThan(5);
    expect(lifts.right_foot).toBeGreaterThan(5);
  });

  it('explains why it can’t walk', () => {
    const { parts, rig } = biped();
    const pointOf = pointOfParts(rig, parts);

    expect(buildGait(rig, { feet: [] }, { values: {} }, { pointOf, name: 'Walk' })).toBe(
      'Name the feet (part ids or ankle joint ids)',
    );
    expect(buildGait(rig, { feet: ['pelvis'] }, { values: {} }, { pointOf, name: 'Walk' })).toBe(
      'No joint moves pelvis: declare the leg joints first',
    );
  });
});
