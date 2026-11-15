import { knockGame } from '../cases/fixtureGames';
import type { WorldObject } from '../cases/schema';
import type { CameraView } from '../cameras/views';
import { box, joint } from '../sim/fixtures/parts';
import type { CustomModelSubNode, ScenePart } from '../types/robotics';
import { buildRig, type V3 } from '../utils/kinematics';
import { trainingPlan } from './trainingPlan';

export const acceptanceView: CameraView = {
  key: 'acceptance',
  label: 'Acceptance',
  part: null,
  position: [0, 150, 1000],
  target: [0, 150, 0],
  up: [0, 1, 0],
  fovDeg: 73.73979529168804,
  lens: { model: 'pinhole', hfovDeg: 90 },
};

export const acceptanceBlock = (x = 0): ScenePart => box('target', [x, 150, 0], [200, 100, 100], 100);

const node = (
  name: string,
  position: V3,
  size: V3,
  kind: NonNullable<CustomModelSubNode['primitiveKind']> = 'box',
): CustomModelSubNode => ({
  id: name,
  name,
  nodeType: 'primitive',
  primitiveKind: kind,
  role: 'solid',
  position,
  rotation: [0, 0, 0],
  dimensions: { width: size[0], height: size[1], depth: size[2] },
  color: '#bbbbbb',
});

function objectFor(part: ScenePart, points: Record<string, V3>): WorldObject {
  return {
    id: part.id,
    name: part.name,
    kind: 'custom_model',
    position: part.position,
    rotation: part.rotation,
    size: [part.dimensions.width, part.dimensions.height, part.dimensions.depth],
    color: part.color,
    behavior: 'static',
    points,
  };
}

function landmarkObjects() {
  const mug: ScenePart = {
    ...box('mug', [-560, 50, 0], [125, 100, 80], 100),
    name: 'Mug',
    kind: 'custom_model',
    customNodes: [node('cup', [0, 0, 0], [80, 100, 80], 'tube'), node('handle', [60, 40, 0], [50, 20, 50], 'torus')],
  };
  const person: ScenePart = {
    ...box('person', [0, 90, 0], [240, 20, 350], 100),
    name: 'Person',
    kind: 'custom_model',
    customNodes: [
      node('head', [0, 0, -150], [60, 20, 60], 'sphere'),
      node('body', [0, 0, -30], [80, 20, 140]),
      node('left_arm', [-80, 0, -50], [80, 20, 30]),
      node('right_arm', [80, 0, -50], [80, 20, 30]),
      node('left_leg', [-40, 0, 100], [30, 20, 140]),
      node('right_leg', [40, 0, 100], [30, 20, 140]),
    ],
  };
  const objects = [
    objectFor(mug, { handle: [75, 50, 0] }),
    objectFor(person, {
      head: [0, 10, -150],
      left_hand: [-80, 10, -50],
      right_hand: [80, 10, -50],
      left_foot: [-40, 10, 150],
      right_foot: [40, 10, 150],
    }),
  ];

  return { world: [mug, person], objects };
}

export function landmarkPlan() {
  const legs = [
    { id: 'front_left_tip', x: 420, z: -100 },
    { id: 'front_right_tip', x: 580, z: -100 },
    { id: 'middle_left_tip', x: 420, z: 0 },
    { id: 'middle_right_tip', x: 580, z: 0 },
    { id: 'rear_left_tip', x: 420, z: 100 },
    { id: 'rear_right_tip', x: 580, z: 100 },
  ];
  const parts = [
    box('robot_body', [500, 90, 0], [140, 20, 100], 100),
    ...legs.map(({ id, x, z }) => box(`robot_${id}`, [x, 90, z], [40, 20, 80], 100)),
  ];
  const joints = legs.map(({ id, x, z }) =>
    joint({ id, link: ['robot_body', `robot_${id}`], origin: [x, 100, z], axis: [0, 1, 0], effortNm: 1, limb: 'leg' }),
  );
  const landmarks = landmarkObjects();
  const view: CameraView = {
    ...acceptanceView,
    position: [0, 1100, 0],
    target: [0, 100, 0],
    up: [0, 0, -1],
  };
  const kase = { ...knockGame({ seconds: 1, target: 1 }), world: { objects: landmarks.objects } };
  const plan = trainingPlan({
    parts,
    rig: buildRig(joints, parts),
    model: null,
    views: [view],
    kase,
    sceneId: 'acceptance',
    count: 1,
    cameras: [view.key],
    classes: [],
    seed: 17,
  });

  return { ...plan, world: landmarks.world };
}
