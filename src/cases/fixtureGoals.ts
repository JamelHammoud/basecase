import * as THREE from 'three';
import type { V3 } from '../utils/kinematics';
import { GRIP, type CaseGoal, type BuilderRobot, type GoalPlan, type GoalValues } from './caseGoals';
import type { ReferenceCommand, WorldObject } from './schema';
import { fixtureHandle, reusedFixture } from './reusedFixture';

const OPEN = [0, 0];
const SHUT = [0, 1];
const STEP_SECONDS = 0.12;
const STEPS = 24;

export function fixtureDefaults(robot: BuilderRobot, lid: boolean): Partial<GoalValues> {
  return {
    distanceMm: Math.round(robot.facts.reachMm * 0.45),
    heightMm: Math.round(robot.facts.reachMm * 0.2),
    fixtureWidthMm: 70,
    fixtureDepthMm: 80,
    fixtureTravel: 50,
    fixtureMassG: 30,
    fixtureFriction: lid ? 2 : 100,
    fixtureDamping: lid ? 2 : 100,
    seconds: 7,
  };
}

function fixtureObject(id: string, position: V3, size: V3): WorldObject {
  return {
    id,
    name: id,
    kind: 'box',
    position,
    rotation: [0, 0, 0],
    size,
    color: '#909090',
    behavior: 'dynamic',
    massG: 10,
    friction: 0.8,
  };
}

function frameObjects(robot: BuilderRobot, v: GoalValues, lid: boolean): WorldObject[] {
  const [x, , z] = robot.facts.anchor;
  const middle = z + v.distanceMm + v.fixtureDepthMm / 2;
  const height = v.heightMm - 8;
  const wall = (id: string, position: V3, size: V3): WorldObject => ({
    ...fixtureObject(id, position, size),
    name: 'Frame',
    behavior: 'static',
  });

  return [
    wall('frame-left', [x - v.fixtureWidthMm / 2 - 4, height / 2, middle], [8, height, v.fixtureDepthMm]),
    wall('frame-right', [x + v.fixtureWidthMm / 2 + 4, height / 2, middle], [8, height, v.fixtureDepthMm]),
    wall('frame-back', [x, height / 2, middle + v.fixtureDepthMm / 2 + 4], [v.fixtureWidthMm + 16, height, 8]),
    ...(lid ? [wall('frame-front', [x, height / 2, z + v.distanceMm - 4], [v.fixtureWidthMm + 16, height, 8])] : []),
  ];
}

function objectsFor(robot: BuilderRobot, v: GoalValues, lid: boolean): WorldObject[] {
  if (robot.fixture) return reusedFixture(robot.fixture, robot, v);

  const [x, , z] = robot.facts.anchor;
  const depth = v.fixtureDepthMm;
  const hinge: V3 = [x, v.heightMm, z + v.distanceMm + depth];
  const handleWidth = Math.max(10, (robot.facts.gripper?.openingMm ?? 40) * 0.7);
  const thickness = 6;
  const handleHeight = 24;
  const handle: V3 = [x, v.heightMm + thickness / 2 + handleHeight / 2, z + v.distanceMm];
  const fixture: WorldObject = {
    ...fixtureObject('fixture', [x, v.heightMm, z + v.distanceMm + depth / 2], [v.fixtureWidthMm, thickness, depth]),
    name: lid ? 'Lid' : 'Drawer',
    massG: v.fixtureMassG,
    joint: {
      type: lid ? 'revolute' : 'prismatic',
      origin: hinge,
      axis: lid ? [1, 0, 0] : [0, 0, -1],
      range: [v.fixtureLowerStop, v.fixtureTravel],
      damping: v.fixtureDamping / 1000,
      frictionloss: v.fixtureFriction / 1000,
      ...(v.fixtureStiffness || v.fixtureSpringref
        ? { stiffness: v.fixtureStiffness / 1000, springref: v.fixtureSpringref }
        : {}),
    },
  };

  return [
    fixture,
    {
      ...fixtureObject('handle', handle, [handleWidth, handleHeight, handleWidth]),
      name: 'Handle',
      parent: 'fixture',
      massG: 5,
    },
    ...frameObjects(robot, v, lid),
  ];
}

export function fixtureReference(
  robot: BuilderRobot,
  objects: WorldObject[],
  v: GoalValues,
  lid: boolean,
): ReferenceCommand[] {
  const fixture = objects[0];
  const handle = fixtureHandle(objects);
  const grip = new THREE.Vector3(...handle.position);
  const pivot = new THREE.Vector3(...fixture.joint!.origin);
  const travel = v.fixtureTravel * 1.2;
  const hover: V3 = [grip.x, grip.y + Math.max(50, robot.facts.gripper?.depthMm ?? 50), grip.z];
  const timeline: ReferenceCommand[] = [
    { at: 0.1, target: hover, aux: OPEN },
    { at: 1.6, target: handle.position, aux: OPEN },
    { at: 2.8, target: handle.position, aux: SHUT },
  ];

  for (let i = 1; i <= STEPS; i++) {
    const fraction = i / STEPS;
    const target = lid
      ? grip
          .clone()
          .sub(pivot)
          .applyAxisAngle(new THREE.Vector3(...fixture.joint!.axis), (travel * fraction * Math.PI) / 180)
          .add(pivot)
      : grip.clone().addScaledVector(new THREE.Vector3(...fixture.joint!.axis), travel * fraction);

    timeline.push({ at: 3.5 + i * STEP_SECONDS, target: target.toArray() as V3, aux: SHUT });
  }

  return timeline;
}

export function fixturePlan(robot: BuilderRobot, v: GoalValues, lid: boolean): GoalPlan {
  const objects = objectsFor(robot, v, lid);

  return {
    brief: lid ? 'Grip the handle and open the lid.' : 'Grip the handle and pull the drawer.',
    slot: {
      needs: ['arm', 'gripper'],
      binding: { endEffector: robot.facts.endEffector ?? undefined },
      reachMm: robot.facts.reachMm,
      anchor: robot.facts.anchor,
    },
    objects,
    probes: [
      { signal: 'handle-contact', kind: 'contact', from: 'end-effector', to: { object: fixtureHandle(objects).id } },
    ],
    success: {
      hold_for: {
        seconds: 0.2,
        within: 'whole',
        state: {
          all: [
            {
              atom: {
                expr: { signal: 'fixture-travel' },
                cmp: '>',
                value: v.fixtureTravel * 0.8,
                scale: v.fixtureTravel,
              },
            },
            { atom: { expr: { signal: 'handle-contact' }, cmp: '>', value: 0.5, scale: 1 } },
          ],
        },
      },
    },
    timeline: fixtureReference(robot, objects, v, lid),
    controls: GRIP,
    route: { from: robot.pivot, to: fixtureHandle(objects).position, halfWidth: v.fixtureWidthMm },
  };
}

export const fixtureParams: CaseGoal['params'] = [
  'distanceMm',
  'heightMm',
  'fixtureWidthMm',
  'fixtureDepthMm',
  'fixtureTravel',
  'fixtureLowerStop',
  'fixtureMassG',
  'fixtureFriction',
  'fixtureDamping',
  'fixtureStiffness',
  'fixtureSpringref',
  'seconds',
];

export const FIXTURE_GOALS: CaseGoal[] = [
  {
    kind: 'lid',
    name: 'Open a Lid',
    needs: ['gripper'],
    bounds: { heightMm: { min: 20 } },
    params: fixtureParams,
    plan: (robot, values) => fixturePlan(robot, values, true),
  },
  {
    kind: 'drawer',
    name: 'Pull a Drawer',
    needs: ['gripper'],
    bounds: { heightMm: { min: 20 } },
    params: fixtureParams,
    plan: (robot, values) => fixturePlan(robot, values, false),
  },
];
