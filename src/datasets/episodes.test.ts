import { expect, it } from 'vitest';
import type { SimJoint, SimModel } from '../sim/mjcfTypes';
import { datasetJoints, robotJoints, type DatasetSlot } from './episodes';

function modelFor(seed: number): SimModel {
  const joints: SimJoint[] = Array.from({ length: seed % 25 }, (_, i) => ({
    id: `joint-${i}`,
    name: `Joint ${i % 3}`,
    type: 'revolute',
    effort: 1,
    effortSource: 'estimate',
    dynamics: 'estimated',
    robot: `robot-${i % 3}`,
    drive: 'position',
    actuator: i % 4 ? i : -1,
  }));

  return {
    version: 2,
    xml: '',
    bodies: [],
    joints,
    robots: Array.from({ length: 3 }, (_, i) => ({
      key: `robot-${i}`,
      name: `Robot ${i}`,
      root: `root-${i}`,
      floating: false,
      morphology: 'fixed',
      joints: joints
        .filter((joint) => joint.robot === `robot-${i}`)
        .map((joint) => joint.id)
        .reverse(),
      fingerprint: `robot-${i}`,
    })),
    initial: { values: {}, roots: {} },
    massKg: {},
  };
}

function previousColumns(model: SimModel, slots?: DatasetSlot[]) {
  if (!slots || slots.length < 2) {
    const joints = robotJoints(model);

    return {
      joints,
      names: joints.map((joint) => joint.name),
      groups: [{ name: 'joints', start: 0, end: joints.length }],
    };
  }

  const per = slots.map((slot) => ({ slot: slot.id, joints: robotJoints(model, slot.robot) }));
  const starts = per.map((_, i) => per.slice(0, i).reduce((sum, entry) => sum + entry.joints.length, 0));

  return {
    joints: per.flatMap((entry) => entry.joints),
    names: per.flatMap((entry) => entry.joints.map((joint) => `${entry.slot}.${joint.name}`)),
    groups: per.map((entry, i) => ({ name: entry.slot, start: starts[i], end: starts[i] + entry.joints.length })),
  };
}

it('preserves slot column order, empty groups and passive exclusions across dataset layouts', () => {
  for (let seed = 0; seed < 80; seed++) {
    const model = modelFor(seed);
    const slots = Array.from({ length: seed % 5 }, (_, i) => ({
      id: `slot-${i}`,
      robot: `robot-${(seed + i * 2) % 4}`,
    }));
    const before = structuredClone({ model, slots });
    const expected = previousColumns(model, slots);
    const actual = datasetJoints(model, slots);

    expect(actual).toEqual(expected);
    actual.joints.forEach((joint, i) => expect(joint).toBe(expected.joints[i]));
    expect(datasetJoints(model)).toEqual(previousColumns(model));
    expect({ model, slots }).toEqual(before);
  }
});

it('rebuilds independent columns after slot and model edits, including repeated robot selections', () => {
  const model = modelFor(12);
  const slots = [
    { id: 'first', robot: 'robot-1' },
    { id: 'empty', robot: 'missing' },
    { id: 'again', robot: 'robot-1' },
    { id: 'last', robot: 'robot-2' },
  ];
  const first = datasetJoints(model, slots);
  const before = {
    ...first,
    joints: [...first.joints],
    names: [...first.names],
    groups: structuredClone(first.groups),
  };

  expect(first.groups.map(({ start, end }) => [start, end])).toEqual([
    [0, 3],
    [3, 3],
    [3, 6],
    [6, 9],
  ]);
  model.joints.reverse();
  slots.reverse();
  slots[0].id = 'renamed';
  expect(datasetJoints(model, slots)).toEqual(previousColumns(model, slots));
  expect(first).toEqual(before);
});
