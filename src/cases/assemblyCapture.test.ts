import { expect, it } from 'vitest';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { modelToParts } from '../utils/libraryParts';
import { resolveJoints } from '../utils/kinematics';
import { sceneModel } from '../workspace/libraryModels';

function assembly() {
  const base: ScenePart = {
    id: 'base',
    name: 'Chest',
    kind: 'box',
    category: 'primitives',
    role: 'solid',
    position: [0.037, 0, 0],
    rotation: [0, 0, 23],
    dimensions: { width: 100, height: 20, depth: 80 },
    color: '#909090',
    note: '',
    visible: true,
    locked: false,
    massG: 60,
  };
  const lid: ScenePart = {
    ...base,
    id: 'lid',
    name: 'Lid',
    position: [0.037, 20.123, 0],
    massG: 20,
    mesh: {
      positions: [0, 0, 0, 10, 0, 0, 0, 10, 0],
      indices: [0, 1, 2],
      baseSize: [100, 20, 80],
      source: 'https://example.com/lid.stl',
    },
  };
  const joint: RobotJoint = {
    id: 'hinge',
    name: 'Hinge',
    type: 'revolute',
    parent: ['base'],
    child: ['lid'],
    origin: [0, 15, 35],
    axis: [1, 0, 0],
    range: [0, 95],
    actuation: 'passive',
    damping: 0.01,
    frictionloss: 0.002,
    frame: { part: 'base', origin: [0, 15, 35], axis: [1, 0, 0] },
  };

  return { parts: [base, lid], joints: [joint] };
}

it('captures geometry, supplied masses and passive local frames in the existing Library model', async () => {
  const source = assembly();
  const saved = await sceneModel({
    sourceParts: source.parts,
    joints: source.joints,
    single: null,
    sceneName: 'Chest',
    screenshot: () => undefined,
  });
  let next = 0;
  const restored = modelToParts(JSON.parse(JSON.stringify(saved)), [300, 0, 100], () => `placed-${next++}`);
  const joint = restored.joints[0];

  expect(restored.parts[1].mesh).toEqual(source.parts[1].mesh);
  expect(restored.parts.map((p) => p.massG)).toEqual([60, 20]);
  expect(restored.parts[1].position[1] - restored.parts[0].position[1]).toBeCloseTo(20.123, 12);
  expect(joint).toMatchObject({
    actuation: 'passive',
    range: [0, 95],
    damping: 0.01,
    frictionloss: 0.002,
    parent: [restored.parts[0].id],
    child: [restored.parts[1].id],
    frame: { part: restored.parts[0].id, origin: [0, 15, 35], axis: [1, 0, 0] },
  });
  expect(resolveJoints(restored.joints, restored.parts)[0].axis).toEqual(
    resolveJoints(source.joints, source.parts)[0].axis,
  );
});

it('isolates two insertions from each other and the saved source, including nested geometry and joint limits', async () => {
  const source = assembly();
  const model = await sceneModel({
    sourceParts: source.parts,
    joints: source.joints,
    single: null,
    sceneName: 'Chest',
    screenshot: () => undefined,
  });
  let next = 0;
  const makeId = () => `copy-${next++}`;
  const first = modelToParts(model, [0, 0, 0], makeId);
  const second = modelToParts(model, [200, 0, 0], makeId);

  first.parts[1].mesh!.positions[0] = 99;
  first.parts[0].dimensions.width = 200;
  first.joints[0].range![1] = 45;
  expect(second.parts[1].mesh!.positions[0]).toBe(0);
  expect(second.parts[0].dimensions.width).toBe(100);
  expect(second.joints[0].range).toEqual([0, 95]);
  expect(model.nodes[1].part!.mesh!.positions[0]).toBe(0);
  expect(source.parts[0].dimensions.width).toBe(100);
  expect(second.joints[0].id).not.toBe(first.joints[0].id);
  expect(new Set([...first.parts, ...second.parts].map((p) => p.id)).size).toBe(4);
});
