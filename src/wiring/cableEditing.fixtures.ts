import { component, sceneOf, servoJoints } from './fixtures';
import { box, joint } from '../sim/fixtures/parts';
import type { WiringScene } from './connectors';

function robot(count: number): WiringScene {
  const arm = servoJoints({ prefix: 'servo', componentId: 'feetech-sts3215', variant: 'c001', count });
  const parts = [
    component('adapter', 'waveshare-bus-servo-adapter-a'),
    ...arm.parts.map((part, i) => ({ ...part, position: [(i + 1) * 70, 40, 0] as [number, number, number] })),
  ];
  const joints = arm.joints.map((entry, i) => ({
    ...entry,
    parent: [i ? `servo${i}` : 'adapter'],
    parentJoint: i ? arm.joints[i - 1].id : undefined,
    origin: [(i + 1) * 70, 40, 0] as [number, number, number],
    range: [-15, 15] as [number, number],
  }));

  return sceneOf(parts, joints);
}

function withCamera(scene: WiringScene) {
  const camera = {
    ...component('camera', 'raspberry-pi-camera-3'),
    position: [160, 70, 0] as [number, number, number],
  };
  const last = scene.project.joints!.at(-1)!;

  return {
    ...scene,
    parts: [...scene.parts, camera],
    project: {
      ...scene.project,
      joints: scene.project.joints!.map((entry) =>
        entry.id === last.id ? { ...entry, child: [...entry.child, 'camera'] } : entry,
      ),
    },
  };
}

function mixedBuses() {
  const scene = robot(2);
  const second = servoJoints({ prefix: 'xl', componentId: 'dynamixel-xl330-m288', count: 1 });

  return sceneOf(
    [
      ...scene.parts,
      { ...component('u2d2', 'robotis-u2d2'), position: [0, 200, 0] },
      ...second.parts.map((part) => ({ ...part, position: [70, 200, 0] as [number, number, number] })),
    ],
    [...scene.project.joints!, ...second.joints.map((entry) => ({ ...entry, range: [-15, 15] as [number, number] }))],
  );
}

function lid() {
  const scene = robot(1);
  const lid = box('lid', [60, 150, 0], [100, 5, 100], 20);
  const walls = [
    box('floor', [60, 70, 0], [100, 5, 100], 30),
    box('left-wall', [10, 110, 0], [5, 80, 100], 30),
    box('right-wall', [110, 110, 0], [5, 80, 100], 30),
    box('front-wall', [60, 110, -50], [100, 80, 5], 30),
    box('back-wall', [60, 110, 50], [100, 80, 5], 30),
  ];
  const hinge = {
    ...joint({
      id: 'lid-hinge',
      link: ['adapter', 'lid'],
      origin: [10, 150, 0],
      axis: [0, 0, 1],
      effortNm: 1,
      range: [0, 90],
    }),
    parent: ['adapter', ...walls.map((wall) => wall.id)],
    child: ['lid', 'servo1'],
    actuators: ['servo1'],
  };
  const parts = scene.parts.map((part) =>
    part.id === 'servo1' ? { ...part, position: [60, 150, 0] as [number, number, number] } : part,
  );

  return sceneOf([...parts, lid, ...walls], [hinge]);
}

function rover() {
  const scene = robot(2);
  const chassis = box('chassis', [0, -30, 0], [100, 40, 120], 200);
  const positions: Array<[number, number, number]> = [
    [-70, 0, 0],
    [70, 0, 0],
  ];

  return sceneOf(
    [...scene.parts.map((part, i) => (i ? { ...part, position: positions[i - 1] } : part)), chassis],
    scene.project.joints!.map((entry, i) => ({
      ...entry,
      parent: ['chassis', 'adapter'],
      parentJoint: undefined,
      axis: [1, 0, 0],
      origin: positions[i],
      limb: undefined,
    })),
  );
}

function walker(legs: number) {
  const scene = robot(legs * 3);
  const body = box('body', [0, -30, 0], [100, 40, 160], 300);
  const positions = scene.parts.slice(1).map((_, i): [number, number, number] => {
    const leg = Math.floor(i / 3);
    const segment = i % 3;
    const side = leg % 2 ? -1 : 1;

    return [side * (70 + segment * 35), -segment * 30, (Math.floor(leg / 2) - (legs / 2 - 1) / 2) * 80];
  });
  const parts = [...scene.parts.map((part, i) => (i ? { ...part, position: positions[i - 1] } : part)), body];
  const joints = scene.project.joints!.map((entry, i) => ({
    ...entry,
    limb: 'leg' as const,
    parent: i % 3 ? [scene.parts[i].id] : ['body', 'adapter'],
    parentJoint: i % 3 ? scene.project.joints![i - 1].id : undefined,
    axis: (i % 3 ? [0, 0, 1] : [0, 1, 0]) as [number, number, number],
    origin: positions[i],
  }));

  return sceneOf(parts, joints);
}

function panTilt() {
  const scene = withCamera(robot(2));

  return {
    ...scene,
    project: {
      ...scene.project,
      joints: scene.project.joints!.map((entry, i) => ({
        ...entry,
        axis: (i ? [1, 0, 0] : [0, 1, 0]) as [number, number, number],
      })),
    },
  };
}

export function cableEditingDesigns() {
  const slider = robot(1);
  const adapters = robot(4);

  return [
    { name: 'two-servo arm', scene: robot(2), coverageLimited: false },
    { name: 'wrist-camera arm', scene: withCamera(robot(2)), coverageLimited: false },
    { name: 'rover', scene: rover(), coverageLimited: false },
    { name: 'quadruped', scene: walker(4), coverageLimited: true },
    { name: 'hexapod', scene: walker(6), coverageLimited: true },
    { name: 'pan-tilt camera', scene: panTilt(), coverageLimited: false },
    {
      name: 'sliding mechanism',
      scene: {
        ...slider,
        project: {
          ...slider.project,
          joints: slider.project.joints!.map((entry) => ({
            ...entry,
            type: 'prismatic' as const,
            range: [-20, 20] as [number, number],
          })),
        },
      },
      coverageLimited: false,
    },
    {
      name: 'two-adapter servo chain',
      scene: {
        ...adapters,
        parts: [
          ...adapters.parts,
          {
            ...component('adapter-2', 'waveshare-bus-servo-adapter-a'),
            position: [0, 200, 0] as [number, number, number],
          },
        ],
      },
      coverageLimited: false,
    },
    { name: 'mixed servo buses', scene: mixedBuses(), coverageLimited: false },
    { name: 'enclosure with removable lid', scene: lid(), coverageLimited: false },
  ];
}
