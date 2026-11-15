import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { buildRig, forwardKinematics, isMovable, partMotion, type Rig, type V3 } from './kinematics';
import { prepareIkJacobian } from './kinematicsJacobian';
import { posedAxis, type PosedRig } from './kinematicsMotion';

const part = (id: string): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 10, height: 10, depth: 10 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
});

function fixture(size = 4) {
  const parts = Array.from({ length: size + 2 }, (_, i) => part(`part${i}`));
  const joints: RobotJoint[] = Array.from({ length: size }, (_, i) => ({
    id: `joint${i}`,
    name: `Joint ${i}`,
    type: i % 3 === 1 ? 'prismatic' : 'revolute',
    parent: [`part${i}`],
    child: [`part${i + 1}`],
    origin: [i * 25, i * 7, i * -4],
    axis: [Number(i % 3 === 0), Number(i % 3 === 1), Number(i % 3 === 2)],
    range: [-80, 80],
  }));

  joints.push({
    id: 'branch',
    name: 'Branch',
    type: 'revolute',
    parent: ['part1'],
    child: [`part${size + 1}`],
    origin: [20, 10, 0],
    axis: [1, 2, -3],
    range: [-80, 80],
  });

  const rig = buildRig(joints, parts);
  const vars = rig.joints.filter(isMovable).reverse();
  const ids = [`part${size}`, `part${size + 1}`, 'part1', 'part0', 'missing'];
  const owners = ids.map((id) => rig.ownerOf.get(id) ?? null);

  return { rig, vars, ids, owners };
}

function reference(
  input: { rig: Rig; vars: RobotJoint[]; owners: Array<string | null>; posed: PosedRig },
  points: THREE.Vector3[],
) {
  const { rig, vars, owners, posed } = input;
  const axes = vars.map((joint) => posedAxis(rig, posed, joint));

  return owners.map((owner, i) =>
    vars.map((joint, a) => {
      if (!owner || !rig.chain.get(owner)?.has(joint.id)) return new THREE.Vector3();

      if (joint.type === 'prismatic') return axes[a].axis.clone();

      return axes[a].axis
        .clone()
        .cross(points[i].clone().sub(axes[a].origin))
        .multiplyScalar(Math.PI / 180);
    }),
  );
}

const coordinates = (columns: THREE.Vector3[][]) => columns.map((row) => row.map((column) => column.toArray()));

const at = (rig: Rig, posed: PosedRig, id: string, point: V3) =>
  new THREE.Vector3(...point).applyMatrix4(partMotion(rig, posed, id) ?? posed.root);

describe('prepared inverse-kinematics Jacobian', () => {
  it('matches fresh columns and finite differences across branches, mixed joints and roots', () => {
    const { rig, vars, ids, owners } = fixture();
    const update = prepareIkJacobian(rig, vars, owners);
    const point: V3 = [130, 15, 20];
    const root = { position: [8, -14, 25] as V3, rotation: [15, -23, 37] as V3 };
    const before = structuredClone({ joints: rig.joints, parts: rig.parts, root });

    for (let sample = 0; sample < 12; sample++) {
      const values = Object.fromEntries(vars.map((joint, i) => [joint.id, Math.sin(sample + i) * 40]));
      const posed = forwardKinematics(rig, { values, root });
      const points = ids.map((id) => at(rig, posed, id, point));
      const actual = update(
        posed,
        points.map((p) => ({ p })),
      );
      const expected = reference({ rig, vars, owners, posed }, points);

      expect(coordinates(actual)).toEqual(coordinates(expected));

      vars.forEach((joint, a) => {
        const epsilon = 1e-4;
        const low = forwardKinematics(rig, { values: { ...values, [joint.id]: values[joint.id] - epsilon }, root });
        const high = forwardKinematics(rig, { values: { ...values, [joint.id]: values[joint.id] + epsilon }, root });

        ids.forEach((id, i) => {
          const derivative = at(rig, high, id, point)
            .sub(at(rig, low, id, point))
            .multiplyScalar(1 / (2 * epsilon));

          expect(actual[i][a].distanceTo(derivative)).toBeLessThan(1e-6);
        });
      });
    }

    expect({ joints: rig.joints, parts: rig.parts, root }).toEqual(before);
  });

  it('keeps every column and row while updating poses and target points', () => {
    const { rig, vars, owners } = fixture();
    const update = prepareIkJacobian(rig, vars, owners);
    const points = owners.map((_, i) => ({ p: new THREE.Vector3(100 + i, 20, -10) }));
    const columns = update(forwardKinematics(rig, { values: {} }), points);
    const rows = columns.slice();
    const vectors = columns.map((row) => row.slice());
    const initial = coordinates(columns);

    points[0].p.set(70, -10, 45);

    const posed = forwardKinematics(rig, { values: { joint0: 35, joint1: -20, branch: 25 } });
    const next = update(posed, points);

    expect(next).toBe(columns);
    expect(coordinates(next)).not.toEqual(initial);
    expect(coordinates(next)).toEqual(
      coordinates(
        reference(
          { rig, vars, owners, posed },
          points.map(({ p }) => p),
        ),
      ),
    );
    next.forEach((row, i) => {
      expect(row).toBe(rows[i]);
      row.forEach((column, a) => expect(column).toBe(vectors[i][a]));
    });
  });

  it('owns each workspace and reads topology edits when preparing the next solve', () => {
    const { rig, vars, owners } = fixture();
    const update = prepareIkJacobian(rig, vars, owners);
    const posed = forwardKinematics(rig, { values: {} });
    const points = owners.map(() => ({ p: new THREE.Vector3(130, 20, 10) }));
    const first = update(posed, points);
    const before = coordinates(first);

    rig.chain.get(owners[0]!)!.delete('joint0');

    const next = prepareIkJacobian(rig, vars, owners)(posed, points);

    expect(coordinates(first)).toEqual(before);
    expect(coordinates(next)).toEqual(
      coordinates(
        reference(
          { rig, vars, owners, posed },
          points.map(({ p }) => p),
        ),
      ),
    );
    expect(next[0][vars.findIndex((joint) => joint.id === 'joint0')].length()).toBe(0);
    next.forEach((row, i) => row.forEach((column, a) => expect(column).not.toBe(first[i][a])));
  });
});

describe('inverse-kinematics Jacobian boundaries and work', () => {
  it('preserves zero and nonfinite columns, including empty inputs', () => {
    const { rig, vars, owners } = fixture();
    const posed = forwardKinematics(rig, { values: {} });
    const points = owners.map(() => ({ p: new THREE.Vector3(NaN, Infinity, -Infinity) }));
    const actual = prepareIkJacobian(rig, vars, owners)(posed, points);

    expect(coordinates(actual)).toEqual(
      coordinates(
        reference(
          { rig, vars, owners, posed },
          points.map(({ p }) => p),
        ),
      ),
    );
    expect(prepareIkJacobian(rig, vars, [])(posed, [])).toEqual([]);
    expect(prepareIkJacobian(rig, [], owners)(posed, points)).toEqual(owners.map(() => []));
  });

  it.each([6, 12])('avoids column clones and repeated ancestry reads across %i joints', (size) => {
    const { rig } = fixture(size);
    const vars = rig.joints.filter((joint) => joint.id !== 'branch');
    const owners = Array<string | null>(3).fill(`joint${size - 1}`);
    const posed = forwardKinematics(rig, { values: {} });
    const points = owners.map(() => new THREE.Vector3(size * 25, 30, 10));
    const residuals = points.map((p) => ({ p }));
    const chain = vi.spyOn(rig.chain, 'get');
    const clones = vi.spyOn(THREE.Vector3.prototype, 'clone');
    const steps = size * 50;

    try {
      const update = prepareIkJacobian(rig, vars, owners);
      const columns = new Set<THREE.Vector3>();

      for (let step = 0; step < steps; step++)
        update(posed, residuals).forEach((row) => row.forEach((column) => columns.add(column)));

      expect(chain).toHaveBeenCalledTimes(owners.length);
      expect(clones).not.toHaveBeenCalled();
      expect(columns.size).toBe(owners.length * vars.length);
      chain.mockClear();
      clones.mockClear();

      for (let step = 0; step < steps; step++) reference({ rig, vars, owners, posed }, points);

      expect(chain).toHaveBeenCalledTimes(steps * owners.length * vars.length);
      expect(clones).toHaveBeenCalledTimes(
        steps * owners.length * (vars.length * 2 - vars.filter((j) => j.type === 'prismatic').length),
      );
    } finally {
      chain.mockRestore();
      clones.mockRestore();
    }
  });
});
