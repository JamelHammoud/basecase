import { buildCase, builderRobot } from '../../cases/caseBuilder';
import type { Case } from '../../cases/schema';
import type { Formula } from '../../skills/contract';
import { workbenchTask } from '../../cases/workbench/tasks.fixtures';
import { buildRig } from '../../utils/kinematics';

export const TEACHING_TASKS = [
  'block pickup',
  'cylinder transfer',
  'tray placement',
  'drawer pulling',
  'hinged-lid opening',
  'button pressing',
  'lever operation',
  'object pushing',
  'obstacle-aware reaching',
  'block inside a chest',
] as const;

const near = (signal: string): Formula => ({
  hold_for: { seconds: 0.3, within: 'whole', state: { atom: { expr: { signal }, cmp: '<', value: 15, scale: 15 } } },
});

function pushing(kase: Case) {
  const block = kase.world.objects.find((object) => object.id === 'block')!;
  const spot = kase.world.objects.find((object) => object.id === 'spot')!;
  const [x, y, z] = block.position;

  spot.position[2] = z + 60;
  block.friction = 0.3;
  kase.reference.timeline = [
    { at: 0.2, target: [x, 83, z - 45], aux: [0, 1] },
    { at: 2.2, target: [x, y, z - 45], aux: [0, 1] },
    { at: 3.2, target: [x, y, z + 25], aux: [0, 1] },
    { at: 5, target: [x, 83, z + 25], aux: [0, 1] },
  ];
  kase.task.probes.push({ signal: 'contact', kind: 'contact', from: 'end-effector', to: { object: 'block' } });
  kase.task.contract = {
    version: 1,
    success: {
      all: [
        {
          always: {
            window: { last: 0.3 },
            state: { atom: { expr: { signal: 'spot' }, cmp: '<', value: 18, scale: 18 } },
          },
        },
        {
          eventually: {
            window: 'whole',
            state: { atom: { expr: { signal: 'contact' }, cmp: '>', value: 0.5, scale: 1 } },
          },
        },
      ],
    },
    failures: [],
  };

  return kase;
}

function reaching(kase: Case) {
  const block = kase.world.objects.find((object) => object.id === 'block')!;
  const spot = kase.world.objects.find((object) => object.id === 'spot')!;

  kase.world.objects = [
    { ...spot, id: 'front', position: [0, 65, 160], size: [20, 20, 20] },
    { ...spot, id: 'back', position: [0, 65, 270], size: [20, 20, 20] },
    { ...block, id: 'obstacle', behavior: 'static', position: [0, 40, 220], size: [80, 80, 10] },
  ];
  kase.reference.timeline = [
    { at: 0.2, target: [0, 65, 160], aux: [0, 1] },
    { at: 2.5, target: [0, 150, 160], aux: [0, 1] },
    { at: 3.3, target: [0, 150, 270], aux: [0, 1] },
    { at: 4.2, target: [0, 65, 270], aux: [0, 1] },
  ];
  kase.task.probes = [
    { signal: 'front', from: 'end-effector', to: { object: 'front' } },
    { signal: 'back', from: 'end-effector', to: { object: 'back' } },
    { signal: 'obstacle-contact', kind: 'contact', from: 'end-effector', to: { object: 'obstacle' } },
  ];
  kase.task.contract = {
    version: 1,
    success: { sequence: [near('front'), near('back')] },
    failures: [
      {
        label: 'Touched the obstacle',
        formula: {
          eventually: {
            window: 'whole',
            state: { atom: { expr: { signal: 'obstacle-contact' }, cmp: '>', value: 0.5, scale: 1 } },
          },
        },
      },
    ],
  };

  return kase;
}

export function teachingTask(index: number) {
  const fixture = workbenchTask([0, 6, 1, 2, 3, 5, 4, 0, 0, 0][index]);
  const rig = buildRig(fixture.robot.joints, fixture.robot.parts);

  if (index === 7) fixture.source = pushing(fixture.source);

  if (index === 8) fixture.source = reaching(fixture.source);

  if (index === 9) fixture.source = chestTask(builderRobot(rig, fixture.robot.parts));

  return { robot: fixture.robot, kase: fixture.source, rig };
}

function chestTask(robot: Parameters<typeof buildCase>[1]) {
  const made = buildCase({ goal: 'chest', world: 'floor' }, robot);

  if (!made.ok) throw new Error(made.problem);

  return made.kase;
}
