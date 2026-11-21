import { DEFAULT_PROJECT, type ScenePart } from '../../types/robotics';
import { buildRig } from '../../utils/kinematics';
import { box, joint } from './parts';
import { buildMjcf, type SimModel } from '../mjcf';

function robot(index: number) {
  const prefix = `r${index}`;
  const x = index * 30;
  const parts = ['base', 'middle', 'tip'].map((id) => box(`${prefix}-${id}`, [x, 15, 0], [40, 40, 40], 100));
  const joints = [
    joint({
      id: `${prefix}-first`,
      link: [parts[0].id, parts[1].id],
      origin: [x, 15, 0],
      axis: [1, 0, 0],
      effortNm: 1,
    }),
    joint({
      id: `${prefix}-second`,
      link: [parts[1].id, parts[2].id],
      origin: [x, 15, 0],
      axis: [0, 1, 0],
      effortNm: 1,
    }),
  ];

  return { parts, joints };
}

export function contactScene(count: number, selfContact: number[] = [], reverse = false): SimModel {
  const robots = Array.from({ length: count }, (_, i) => robot(i));
  const scenery = box('scenery', [15, 15, 30], [40, 40, 40], 100);
  const object: ScenePart = { ...box('object', [15, 15, -30], [40, 40, 40], 100), physics: { dynamic: true } };
  const parts = [...robots.flatMap((r) => r.parts), scenery, object];
  const joints = robots.flatMap((r) => r.joints);
  const rig = buildRig(joints, parts);
  const config = Object.fromEntries(selfContact.map((index) => [rig.robots[index].key, { enabled: true }]));

  if (reverse) rig.robots.reverse();

  return buildMjcf({
    parts,
    rig,
    project: { ...DEFAULT_PROJECT, selfContact: config },
    measures: {},
    partTriangles: () => null,
    world: [
      { ...box('wall', [15, 45, 0], [40, 40, 40], 100), behavior: 'static' },
      { ...box('crate', [15, -15, 0], [40, 40, 40], 100), behavior: 'dynamic' },
      { ...box('marker', [15, 15, 0], [40, 40, 40], 100), behavior: 'marker' },
    ],
  });
}

export function contactSliders(count = 2): SimModel {
  const robots = Array.from({ length: count }, (_, i) => {
    const x = i * 39.8;
    const parts = [
      box(`slider${i}-base`, [x, 100, 0], [10, 10, 10], 100),
      box(`slider${i}-tip`, [x, 20, 0], [40, 40, 40], 100),
    ];
    const joints = [
      joint({
        id: `slider${i}`,
        link: [parts[0].id, parts[1].id],
        origin: [x, 100, 0],
        axis: [1, 0, 0],
        type: 'prismatic',
        effortNm: 1,
      }),
    ];

    return { parts, joints };
  });
  const parts = robots.flatMap((r) => r.parts);

  return buildMjcf({
    parts,
    rig: buildRig(
      robots.flatMap((r) => r.joints),
      parts,
    ),
    project: DEFAULT_PROJECT,
    measures: {},
    partTriangles: () => null,
  });
}
