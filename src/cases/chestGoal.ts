import { Vector3 } from 'three';
import type { Formula, State } from '../skills/contract';
import type { V3 } from '../utils/kinematics';
import { near, type BuilderRobot, type CaseGoal, type GoalPlan, type GoalValues } from './caseGoals';
import { fixtureParams, fixturePlan, fixtureReference } from './fixtureGoals';
import { blockSize } from './pickGoal';
import { FLOOR_PROBE_DEPTH_MM } from './probes';
import type { ReferenceCommand, WorldObject } from './schema';
import { fixtureHandle } from './reusedFixture';

const OPEN = [0, 0];
const SHUT = [0, 1];
const hold = (state: State): Formula => ({ hold_for: { seconds: 0.2, within: 'whole', state } });
const grip: State = { atom: { expr: { signal: 'block-grip' }, cmp: '>', value: 0.5, scale: 1 } };

function handleAt(fixture: WorldObject, handle: WorldObject, angle: number): V3 {
  const joint = fixture.joint!;
  const pivot = new Vector3(...joint.origin);

  return new Vector3(...handle.position)
    .sub(pivot)
    .applyAxisAngle(new Vector3(...joint.axis), (angle * Math.PI) / 180)
    .add(pivot)
    .toArray() as V3;
}

function chestObjects(robot: BuilderRobot, v: GoalValues, plan: GoalPlan): WorldObject[] {
  const size = blockSize(robot);
  const fixture = plan.objects[0];
  const handle: V3 = [fixture.position[0], fixture.position[1], fixture.position[2] - v.fixtureDepthMm / 2];
  const block: WorldObject = {
    id: 'block',
    name: 'Block',
    kind: 'box',
    position: [
      handle[0] + Math.max(100, v.fixtureWidthMm / 2 + size / 2 + 20),
      size / 2,
      robot.facts.anchor[2] + robot.facts.reachMm * 0.36,
    ],
    rotation: [0, 0, 0],
    size: [size, size, size],
    color: '#c8a26a',
    behavior: 'dynamic',
    massG: (size ** 3 * 0.15) / 1000,
    friction: 0.8,
  };

  return [
    block,
    {
      ...block,
      id: 'spot',
      name: 'Inside',
      position: [handle[0], size / 2 + 4, handle[2] + v.fixtureDepthMm / 2],
      behavior: 'marker',
      color: '#0d99ff',
      opacity: 0.2,
    },
    {
      ...block,
      id: 'bottom',
      name: 'Bottom',
      position: [handle[0], 2, handle[2] + v.fixtureDepthMm / 2],
      size: [v.fixtureWidthMm, 4, v.fixtureDepthMm],
      behavior: 'static',
      color: '#909090',
    },
  ];
}

function chestReference(
  robot: BuilderRobot,
  plan: GoalPlan,
  v: GoalValues,
  objects: WorldObject[],
): ReferenceCommand[] {
  const [block, spot] = objects;
  const size = block.size[1];
  const place: V3 = [spot.position[0], spot.position[1], spot.position[2] - size / 2];
  const gripY = Math.max(size / 2, (robot.facts.gripper?.depthMm ?? 0) + 4);
  const hoverY = v.heightMm + size + 15;
  const at = (p: V3, y: number): V3 => [p[0], y, p[2]];
  const fixture = plan.objects[0];
  const handle = fixtureHandle(plan.objects);
  const opened = handleAt(fixture, handle, v.fixtureTravel);
  const side = block.position[0];
  const timeline: ReferenceCommand[] = [
    ...plan.timeline,
    { at: 6.6, target: opened, aux: SHUT },
    { at: 7.1, target: opened, aux: OPEN },
    { at: 7.6, target: [side, opened[1] + 10, opened[2]], aux: OPEN },
    { at: 8.2, target: at(block.position, hoverY), aux: OPEN },
    { at: 8.8, target: at(block.position, gripY), aux: OPEN },
    { at: 9.8, target: at(block.position, gripY), aux: SHUT },
    { at: 10.8, target: at(block.position, hoverY), aux: SHUT },
    { at: 12.4, target: at(place, hoverY), aux: SHUT },
    { at: 14, target: at(place, gripY + 4), aux: SHUT },
    { at: 15.6, target: at(place, gripY + 4), aux: OPEN },
    { at: 16.4, target: at(place, hoverY), aux: OPEN },
    { at: 17.2, target: [side, hoverY, place[2]], aux: OPEN },
    { at: 17.6, target: [side, opened[1] + 10, opened[2]], aux: OPEN },
    { at: 18.2, target: opened, aux: OPEN },
    { at: 19.2, target: opened, aux: SHUT },
  ];

  for (let i = 1; i <= 24; i++)
    timeline.push({
      at: 19.8 + i * 0.12,
      target: handleAt(fixture, handle, v.fixtureTravel * (1 - i / 24)),
      aux: SHUT,
    });

  timeline.push(
    { at: 23.2, target: handle.position, aux: OPEN },
    { at: 23.8, target: at(handle.position, hoverY), aux: OPEN },
  );

  return timeline.map((command) => (command.at > 6.4 ? { ...command, at: command.at + 1.2 } : command));
}

function chestSuccess(opened: Formula, size: number): Formula {
  const placed: State = {
    all: [
      near('inside', Math.min(10, size / 3)),
      { atom: { expr: { delta: { signal: 'block-lift' } }, cmp: '<', value: 6, scale: size } },
    ],
  };

  return {
    sequence: [
      opened,
      hold({
        all: [grip, { atom: { expr: { delta: { signal: 'block-lift' } }, cmp: '>', value: size / 2, scale: size } }],
      }),
      {
        all: [
          { always: { window: 'whole', state: { any: [grip, placed] } } },
          {
            sequence: [
              hold({ all: [grip, placed] }),
              {
                always: {
                  window: { last: 0.3 },
                  state: {
                    all: [
                      placed,
                      { atom: { expr: { signal: 'fixture-travel' }, cmp: '<', value: 5, scale: 80 } },
                      { atom: { expr: { signal: 'block-contact' }, cmp: '<', value: 0.5, scale: 1 } },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

function chestPlan(robot: BuilderRobot, v: GoalValues): GoalPlan {
  const plan = fixturePlan(robot, v, true);

  if (!robot.fixture) {
    const handle = fixtureHandle(plan.objects);
    const lid = plan.objects[0];

    plan.objects[1] = {
      ...handle,
      kind: 'cylinder',
      rotation: [0, 0, 90],
      position: [lid.position[0], v.heightMm + 35, lid.position[2]],
      size: [24, 35, 24],
      massG: 2,
    };
    plan.objects.push({
      ...handle,
      id: 'handle-stem',
      name: 'Handle stem',
      parent: lid.id,
      position: [lid.position[0], v.heightMm + 17.5, lid.position[2]],
      rotation: [0, 0, 0],
      size: [8, 35, 8],
      massG: 1,
    });
    plan.timeline = fixtureReference(robot, plan.objects, v, true);
  }

  const objects = chestObjects(robot, v, plan);
  const block = objects[0];

  return {
    ...plan,
    brief: 'Open the lid, put the block inside, and close the lid.',
    objects: [...plan.objects, ...objects.filter((object) => object.id !== 'bottom' || !robot.fixture)],
    timeline: chestReference(robot, plan, v, objects),
    probes: [
      ...plan.probes,
      { signal: 'block-grip', kind: 'grip', from: 'end-effector', to: { object: 'block' } },
      { signal: 'block-contact', kind: 'contact', from: 'end-effector', to: { object: 'block' } },
      { signal: 'inside', from: { object: 'block' }, to: { object: 'spot' } },
      {
        signal: 'block-lift',
        from: { object: 'block' },
        to: { point: [block.position[0], -FLOOR_PROBE_DEPTH_MM, block.position[2]] },
      },
    ],
    success: chestSuccess(plan.success, block.size[1]),
  };
}

export const chestGoal: CaseGoal = {
  kind: 'chest',
  name: 'Put Away a Block',
  needs: ['gripper'],
  params: fixtureParams,
  bounds: { heightMm: { min: 40 } },
  plan: chestPlan,
};
