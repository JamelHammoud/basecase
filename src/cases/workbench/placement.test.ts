import { expect, it } from 'vitest';
import { Vector3 } from 'three';
import { fixtureRobots } from '../../sim/fixtures/robots';
import { buildRig, type V3 } from '../../utils/kinematics';
import { buildCase, builderRobot } from '../caseBuilder';
import { caseRobot } from '../testing';
import { placementFrame, readWorkbenchPose, relocateCase, relocationRefusal } from './placement';
import { placementIdentity, retainPlacement, currentPlacement, readPlacements, updatedPlacements } from './retention';
import { scaledToReach } from '../scale';

const arm = fixtureRobots().find((robot) => robot.id === 'arm-6dof')!;
const made = buildCase({ goal: 'drawer', world: 'floor' }, builderRobot(buildRig(arm.joints, arm.parts), arm.parts));

if (!made.ok) throw new Error(made.problem);

const authored = made.kase;
const pose = { position: [60, -20, 85] as V3, yawDeg: 37 };
const pivot: V3 = [7, 8, 9];

it('composes bench to base to simulation and inverts points, axes and rotations independently', () => {
  const frame = placementFrame(pose, pivot);
  const point: V3 = [130, 40, 220];
  const theta = (-37 * Math.PI) / 180;
  const [x, y, z] = point.map((value, i) => value - pose.position[i]);
  const expected = [
    x * Math.cos(theta) + z * Math.sin(theta) + 7,
    y + 8,
    -x * Math.sin(theta) + z * Math.cos(theta) + 9,
  ];

  frame.at(point).forEach((value, i) => expect(value).toBeCloseTo(expected[i], 10));
  frame.inverse(frame.at(point)).forEach((value, i) => expect(value).toBeCloseTo(point[i], 10));
  expect(new Vector3(...frame.turn([1, 0, 0])).length()).toBeCloseTo(1, 12);
  expect(frame.rotate([0, 10, 0])[1]).toBeCloseTo(-27, 10);
});

it('moves fixtures, joint frames, every target and point probe without changing physics or the source', () => {
  const source = structuredClone(authored);

  source.task.probes.push({ signal: 'fixed-point', from: { point: [1, 2, 3] }, to: { point: [4, 5, 6] } });

  const before = structuredClone(source);
  const moved = relocateCase(source, pose, pivot);
  const frame = placementFrame(pose, pivot);

  expect(source).toEqual(before);
  expect(moved.task.contract).toEqual(source.task.contract);
  expect(scaledToReach(moved, 75, [200, 100, -40])).toBe(moved);

  for (const [index, object] of moved.world.objects.entries()) {
    const own = source.world.objects[index];

    expect(object.position).toEqual(frame.at(own.position));
    expect(object.size).toEqual(own.size);
    expect(object.massG).toBe(own.massG);
    expect(object.friction).toBe(own.friction);

    if (object.joint) {
      expect(object.joint).toEqual({
        ...own.joint,
        origin: frame.at(own.joint!.origin),
        axis: frame.turn(own.joint!.axis),
      });
    }
  }

  expect(moved.reference.timeline.map((command) => command.target)).toEqual(
    source.reference.timeline.map((command) => command.target && frame.at(command.target)),
  );
  expect(moved.task.probes.at(-1)).toEqual({
    signal: 'fixed-point',
    from: { point: frame.at([1, 2, 3]) },
    to: { point: frame.at([4, 5, 6]) },
  });
});

it.each([
  null,
  {},
  { position: [0, 0], yawDeg: 0 },
  { position: [0, NaN, 0], yawDeg: 0 },
  { position: [0, 0, 0], yawDeg: Infinity },
  { position: [0, 0, 0], yawDeg: 0, pitchDeg: 1 },
  { position: [100001, 0, 0], yawDeg: 0 },
])('refuses malformed or unsupported measured poses %j', (value) => {
  expect(() => readWorkbenchPose(value)).toThrow();
});

it.each([
  { at: 0, joints: { shoulder: 20 } },
  { at: 0, target: [0, 0, 0], joints: { shoulder: 20 } },
  { at: 0, target: [0, 0, 0], v: [1, 0, 0] },
  { at: 0, aux: [1, 0] },
  { at: 0, push: 'fixture' },
])('refuses the entire reference before starting when any command is unsupported %j', (command) => {
  const kase = { ...authored, reference: { timeline: [...authored.reference.timeline, command] } };

  expect(relocationRefusal(kase as typeof authored)).toBeTruthy();
  expect(relocationRefusal(authored)).toBeNull();
});

it('retains entered evidence per unit and refuses evidence after any source or placement edit', () => {
  const robot = caseRobot(arm);
  const identity = placementIdentity({ unit: 'arm-a', kase: authored, robot, pose });
  const retained = retainPlacement(identity, { passed: true, margin: 1, failed: [] });
  const records = [retained];

  expect(currentPlacement(records, identity)).toEqual(retained);
  expect(currentPlacement(JSON.parse(JSON.stringify(records)), identity)).toEqual(retained);

  const variants = [
    { unit: 'arm-b' },
    { pose: { ...pose, yawDeg: 38 } },
    { kase: { ...authored, brief: 'Edited source' } },
    { robot: { ...robot, parts: robot.parts.map((part) => ({ ...part, position: [1, 2, 3] as V3 })) } },
    {
      kase: {
        ...authored,
        slot: { ...authored.slot!, binding: { endEffector: { part: 'tool', point: [1, 2, 3] as V3 } } },
      },
    },
  ];

  for (const variant of variants) {
    const changed = placementIdentity({ unit: 'arm-a', kase: authored, robot, pose, ...variant });

    expect(currentPlacement(records, changed)).toBeNull();
  }

  const other = placementIdentity({ unit: 'arm-b', kase: authored, robot, pose });

  expect(currentPlacement([...records, retainPlacement(other)], identity)).toEqual(retained);

  const geometry = new Float32Array(robot.partTriangles(robot.parts[0].id)!);
  const bits = new Uint32Array(geometry.buffer);

  bits[0] += 1;

  const changedMesh = placementIdentity({
    unit: 'arm-a',
    kase: authored,
    pose,
    robot: { ...robot, partTriangles: (id) => (id === robot.parts[0].id ? geometry : robot.partTriangles(id)) },
  });

  expect(currentPlacement(records, changedMesh)).toBeNull();
});

it('refuses corrupted saved transforms and mismatched source fingerprints', () => {
  const identity = placementIdentity({ unit: 'arm-a', kase: authored, robot: caseRobot(arm), pose });
  const record = retainPlacement(identity, { passed: true, margin: 1, failed: [] });

  expect(readPlacements([record])).toEqual([record]);
  expect(readPlacements([{ ...record, pose: { ...pose, position: [0, 0, 0] } }])).toEqual([]);
  expect(readPlacements([{ ...record, unit: 'arm-b' }])).toEqual([]);
  expect(readPlacements([{ ...record, evidence: 'measured' }])).toEqual([]);
  expect(readPlacements([{ ...record, rehearsal: { ...record.rehearsal, passed: false } }])).toEqual([]);
  expect(readPlacements([{ ...record, rehearsalHash: '0'.repeat(64) }])).toEqual([]);
});

it('replaces only its unit and Case key and preserves all prior placements at the storage bound', () => {
  const robot = caseRobot(arm);
  const record = (unit: string) => retainPlacement(placementIdentity({ unit, kase: authored, robot, pose }));
  const prior = Array.from({ length: 128 }, (_, index) => record(`arm-${index}`));
  const original = structuredClone(prior);
  const replacement = record('arm-0');

  expect(updatedPlacements(prior, replacement)).toHaveLength(128);
  expect(updatedPlacements(prior, replacement).slice(0, 127)).toEqual(readPlacements(prior).slice(1));
  expect(() => updatedPlacements(prior, record('arm-new'))).toThrow('128');
  expect(prior).toEqual(original);
});
