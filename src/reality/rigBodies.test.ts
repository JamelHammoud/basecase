import { describe, expect, it, vi } from 'vitest';
import { box, joint } from '../sim/fixtures/parts';
import { fixtureRobots } from '../sim/fixtures/robots';
import { safeId } from '../sim/mjcfText';
import type { SimBody } from '../sim/mjcfTypes';
import { buildRig, isMovable, type Rig } from '../utils/kinematics';
import { rigBodies } from './bodyLayout';

function scannedBodies(rig: Rig): SimBody[] {
  const bodies: SimBody[] = [];
  let movable = 0;
  const visit = (robot: string, parent: string, id: string) => {
    const current = rig.byId.get(id)!;
    const name = `b_j${movable}_${safeId(current.id)}`;

    if (isMovable(current)) movable++;

    bodies.push({
      name,
      origin: current.origin,
      robot,
      parent,
      joint: id,
      parts: [...rig.ownerOf].filter(([, owner]) => owner === id).map(([part]) => part),
    });

    for (const child of rig.joints.filter((candidate) => rig.parentOf.get(candidate.id) === id))
      visit(robot, name, child.id);
  };

  for (const [index, robot] of rig.robots.entries()) {
    const root = `root_${index}`;

    bodies.push({
      name: root,
      origin: robot.pivot,
      robot: robot.key,
      parts: [...robot.parts].filter((id) => !rig.ownerOf.has(id)),
    });

    for (const current of rig.joints.filter(
      (candidate) => rig.robotOf.get(candidate.id) === robot.key && !rig.parentOf.get(candidate.id),
    ))
      visit(robot.key, root, current.id);
  }

  return bodies;
}

function forest(seed: number, count = 24) {
  const robots = 1 + (seed % 4);
  const parts = Array.from({ length: count + robots }, (_, i) => box(`p${i}`, [i * 3, i % 5, -i], [10, 12, 8], 25));
  const joints = Array.from({ length: count }, (_, i) => {
    const ancestor =
      i >= robots && (i + seed) % 3 !== 0 ? Math.floor((i - robots) / robots) * robots + (i % robots) : -1;
    const current = joint({
      id: `joint ${i}`,
      link: [ancestor < 0 ? `p${i % robots}` : `p${ancestor + robots}`, `p${i + robots}`],
      origin: [i, seed, -i],
      axis: [0, 0, 1],
      effortNm: 1,
      parentJoint: ancestor < 0 ? undefined : `joint ${ancestor}`,
    });

    return { ...current, type: (i + seed) % 5 === 0 ? ('fixed' as const) : current.type };
  });

  return buildRig(seed % 2 ? joints.toReversed() : joints, parts);
}

function flatRig(count: number) {
  const parts = Array.from({ length: count + 1 }, (_, i) => box(`p${i}`, [i, 0, 0], [1, 1, 1], 1));
  const joints = Array.from({ length: count }, (_, i) =>
    joint({ id: `j${i}`, link: ['p0', `p${i + 1}`], origin: [i, 0, 0], axis: [1, 0, 0], effortNm: 1 }),
  );

  return buildRig(joints, parts);
}

function countedLayout(rig: Rig, layout: typeof rigBodies) {
  const parent = vi.spyOn(rig.parentOf, 'get');
  const entries = rig.ownerOf[Symbol.iterator].bind(rig.ownerOf);
  let ownershipReads = 0;
  const owners = vi.spyOn(rig.ownerOf, Symbol.iterator).mockImplementation(function* () {
    for (const entry of entries()) {
      ownershipReads++;

      yield entry;
    }

    return undefined;
  });

  try {
    const bodies = layout(rig);

    return { bodies, parentReads: parent.mock.calls.length, ownershipReads };
  } finally {
    parent.mockRestore();
    owners.mockRestore();
  }
}

describe('rig body membership', () => {
  it.each(fixtureRobots())('preserves the complete $id layout', (robot) => {
    const rig = buildRig(robot.joints, robot.parts);

    expect(rigBodies(rig)).toEqual(scannedBodies(rig));
  });

  it('preserves branching, robot order, fixed-body numbering and membership order', () => {
    for (let seed = 0; seed < 120; seed++) {
      const rig = forest(seed, seed % 40);
      const before = structuredClone(rig);
      const bodies = rigBodies(rig);

      expect(bodies).toEqual(scannedBodies(rig));
      expect(rig).toEqual(before);

      for (const body of bodies) {
        const origin = body.joint
          ? rig.byId.get(body.joint)!.origin
          : rig.robots.find((robot) => robot.key === body.robot)!.pivot;

        expect(body.origin).toBe(origin);
      }
    }
  });

  it('rebuilds membership after topology, ownership and robot-order edits', () => {
    const rig = forest(3);
    const previous = rigBodies(rig);
    const first = rig.joints[0].id;
    const second = rig.joints.find((current) => current.id !== first)!.id;

    rig.parentOf.set(second, first);
    rig.ownerOf.set('extra', first);
    rig.ownerOf.delete(rig.ownerOf.keys().next().value!);
    rig.robots.reverse();
    rig.joints.reverse();

    const bodies = rigBodies(rig);

    expect(bodies).toEqual(scannedBodies(rig));
    expect(bodies).not.toEqual(previous);
    expect(previous.flatMap((body) => body.parts)).not.toContain('extra');
    bodies[0].parts.push('output-only');
    expect(rigBodies(rig)).toEqual(scannedBodies(rig));
  });

  it('keeps repeated visits and their result membership arrays independent', () => {
    const rig = flatRig(2);

    rig.joints.push(rig.joints[0]);

    const bodies = rigBodies(rig);

    expect(bodies).toEqual(scannedBodies(rig));

    const repeated = bodies.filter((body) => body.joint === rig.joints[0].id);

    expect(repeated).toHaveLength(2);
    expect(repeated[0].parts).not.toBe(repeated[1].parts);
    repeated[0].parts.push('one-visit');
    expect(repeated[1].parts).not.toContain('one-visit');
  });

  it.each([300, 600])('reads topology and ownership once for %i joints', (count) => {
    const rig = flatRig(count);
    const previous = countedLayout(rig, scannedBodies);
    const current = countedLayout(rig, rigBodies);

    expect(current.bodies).toEqual(previous.bodies);
    expect(previous.parentReads).toBe(count * count + count);
    expect(previous.ownershipReads).toBe(count * count);
    expect(current.parentReads).toBe(count);
    expect(current.ownershipReads).toBe(count);
  });
});
