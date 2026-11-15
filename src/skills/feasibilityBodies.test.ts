import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { seededRandom } from '../utils/seededRandom';
import { feasibilityBodies } from './feasibilityBodies';
import { bodyCorners, chainOf, closeKin, openKin, refresh, toLocal, type Kin, type V3 } from './feasibilityKinematics';
import { centerOfMass, findFeet, robotMassKg } from './feasibilityStance';
import { fixtureModel } from './fixtureModels';

const under = (parents: ArrayLike<number>, root: number, body: number) => {
  let at = body;

  while (at > 0 && at !== root) at = parents[at];

  return at === root;
};

function compareTree(parents: number[], root: number) {
  const before = [...parents];
  const tree = feasibilityBodies(parents, root);
  const members = parents.map((_, body) => body).filter((body) => under(parents, root, body));
  const leaves = members.filter((body) => body !== root && !parents.some((parent, child) => child && parent === body));

  expect(tree.members).toEqual(members);
  expect(tree.leaves).toEqual(leaves);

  for (let ancestor = 0; ancestor < parents.length; ancestor++) {
    for (let body = 0; body < parents.length; body++)
      expect(tree.contains(body, ancestor)).toBe(under(parents, ancestor, body));
  }

  expect(parents).toEqual(before);
}

describe('feasibility body membership', () => {
  it('matches parent walks for world, chains, branches, siblings and nonconsecutive subtree ids', () => {
    for (const parents of [[0], [0, 0, 1, 2, 3], [0, 0, 1, 1, 0, 4, 4], [0, 3, 0, 0, 1]]) {
      for (let root = 0; root < parents.length; root++) compareTree(parents, root);
    }
  });

  it('matches parent walks across seeded trees', () => {
    const random = seededRandom('7814cafec82511ad392d1284def1b789');

    for (let run = 0; run < 40; run++) {
      const parents = Array.from({ length: 30 }, (_, body) => Math.floor(random() * body));

      compareTree(parents, Math.floor(random() * parents.length));
    }
  });

  it('prepares independent indexes after topology and robot changes', () => {
    const parents = [0, 0, 1, 0, 3];
    const first = feasibilityBodies(parents, 1);

    parents[2] = 3;
    expect(feasibilityBodies(parents, 1).members).toEqual([1]);
    expect(feasibilityBodies(parents, 3).members).toEqual([2, 3, 4]);
    expect(first.members).toEqual([1, 2]);
    expect(first.contains(2)).toBe(true);
  });

  it.each([300, 600])(
    'reads each parent once for %i-body chains and stars, then answers without model reads',
    (size) => {
      for (const star of [false, true]) {
        const source = Array.from({ length: size + 1 }, (_, body) => (star ? 0 : Math.max(0, body - 1)));
        let reads = 0;
        const parents = new Proxy(source, {
          get(target, key, receiver) {
            if (typeof key === 'string' && /^\d+$/.test(key)) reads++;

            return Reflect.get(target, key, receiver);
          },
        });
        const tree = feasibilityBodies(parents, 1);

        expect(reads).toBe(size);

        for (let body = 0; body <= size; body++) {
          expect(tree.contains(body)).toBe(star ? body === 1 : body >= 1);
          expect(tree.contains(body, body)).toBe(true);
        }

        expect(tree.leaves).toEqual(star ? [] : [size]);
        expect(reads).toBe(size);

        reads = 0;

        for (let body = 0; body <= size; body++) expect(under(parents, 1, body)).toBe(tree.contains(body));

        expect(reads).toBe(star ? size - 1 : (size * (size - 1)) / 2);
      }
    },
  );
});

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

function referenceMass(kin: Kin) {
  const members = Array.from({ length: kin.model.nbody }, (_, body) => body).filter((body) =>
    under(kin.model.body_parentid, kin.root, body),
  );
  const mass = members.reduce((sum, body) => sum + kin.model.body_mass[body], 0);
  const center: V3 = [0, 0, 0];

  for (const body of members)
    for (let axis = 0; axis < 3; axis++)
      center[axis] += (kin.model.body_mass[body] * kin.data.xipos[body * 3 + axis]) / mass;

  return { mass, center };
}

function referenceFeet(kin: Kin) {
  const parents = kin.model.body_parentid as ArrayLike<number>;
  const bodies = Array.from({ length: kin.model.nbody }, (_, body) => body).filter((body) =>
    under(parents, kin.root, body),
  );
  const leaves = bodies.filter((body) => body !== kin.root && !bodies.some((child) => parents[child] === body));
  const corners = new Map(leaves.map((body) => [body, bodyCorners(kin, body)]));
  const lowest = (points: V3[]) => points.reduce((low, point) => Math.min(low, point[2]), Infinity);
  const ground = Math.min(...leaves.map((body) => lowest(corners.get(body)!)));

  return leaves
    .filter((body) => lowest(corners.get(body)!) <= ground + 0.01)
    .map((body) => {
      const all = corners.get(body)!;
      const low = lowest(all);
      const sole = all.filter((point) => point[2] <= low + 0.001);
      const center = [0, 1, 2].map((axis) => sole.reduce((sum, point) => sum + point[axis], 0) / sole.length) as V3;

      return { body, local: toLocal(kin, body, center), sole };
    });
}

function compareChains(kin: Kin) {
  for (const body of kin.bodies.members) {
    const ancestors = new Set<number>();

    for (let at = body; at > 0 && at !== kin.root; at = kin.model.body_parentid[at]) ancestors.add(at);

    expect(chainOf(kin, body)).toEqual(kin.joints.filter((joint) => ancestors.has(joint.body)));
  }
}

it.each(['quad-servo', 'biped-servo', 'arm-6dof'] as const)(
  'keeps %s mass and feet current across poses and mass edits',
  (robot) => {
    const kin = openKin(mj, fixtureModel(robot), { relax: { effortScale: 1, rangeDeg: 0, linkScale: 1 } });

    try {
      const parents = Array.from(kin.model.body_parentid as ArrayLike<number>);

      compareTree(parents, kin.root);
      compareChains(kin);

      for (const angle of [0, 0.15, -0.1]) {
        kin.data.qpos[kin.joints[0].qpos] = angle;
        kin.model.body_mass[kin.root] *= 1.1;
        refresh(kin);

        const expected = referenceMass(kin);
        const feet = findFeet(kin);

        expect(robotMassKg(kin)).toBe(expected.mass);
        expect(centerOfMass(kin)).toEqual(expected.center);
        expect(feet).toEqual(referenceFeet(kin));
        expect(feet.length).toBeGreaterThan(0);
        expect(feet.every((foot) => kin.bodies.leaves.includes(foot.body))).toBe(true);
        expect(feet.every((foot) => foot.sole.length > 0)).toBe(true);
      }
    } finally {
      closeKin(kin);
    }
  },
);
