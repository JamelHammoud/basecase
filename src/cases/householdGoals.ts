import { Euler, Quaternion, Vector3 } from 'three';
import type { V3 } from '../utils/kinematics';
import type { BuilderRobot, CaseGoal, GoalPlan, GoalValues } from './caseGoals';
import { fixtureDefaults, fixtureParams, fixturePlan } from './fixtureGoals';
import { HOUSEHOLD_FIXTURES, type HouseholdKind } from './householdKinds';
import { householdShapes } from './householdShapes';
import type { WorldObject } from './schema';

const radians = (v: number) => (v * Math.PI) / 180;
const degrees = (v: number) => (v * 180) / Math.PI;

function rotatedObject(object: WorldObject, turn: Quaternion, origin: Vector3): WorldObject {
  const at = (v: V3) => new Vector3(...v).sub(origin).applyQuaternion(turn).add(origin).toArray() as V3;
  const rotation = new Quaternion().setFromEuler(new Euler(...(object.rotation.map(radians) as V3)));
  const angles = new Euler().setFromQuaternion(turn.clone().multiply(rotation));

  return {
    ...object,
    position: at(object.position),
    rotation: [angles.x, angles.y, angles.z].map(degrees) as V3,
    ...(object.joint
      ? {
          joint: {
            ...object.joint,
            origin: at(object.joint.origin),
            axis: new Vector3(...object.joint.axis).applyQuaternion(turn).toArray() as V3,
          },
        }
      : {}),
  };
}

export function householdDefaults(robot: BuilderRobot, kind: HouseholdKind): Partial<GoalValues> {
  const base = fixtureDefaults(robot, HOUSEHOLD_FIXTURES[kind].hinge);

  if (kind === 'knob') return { ...base, fixtureDepthMm: 30 };

  if (kind === 'door') return { ...base, fixtureDepthMm: 100 };

  if (kind === 'button')
    return { ...base, fixtureTravel: 10, fixtureFriction: 0, fixtureStiffness: 2000, fixtureDamping: 100 };

  return base;
}

function householdPlan(robot: BuilderRobot, v: GoalValues, kind: HouseholdKind): GoalPlan {
  const fixture = HOUSEHOLD_FIXTURES[kind];
  const plan = fixturePlan(robot, v, fixture.hinge);

  if (robot.fixture) return plan;

  const origin = new Vector3(...plan.objects[1].position);
  const turn = new Quaternion().setFromEuler(new Euler(...(fixture.turn.map(radians) as V3)));
  const at = (p: V3): V3 => new Vector3(...p).sub(origin).applyQuaternion(turn).add(origin).toArray() as V3;
  const objects = householdShapes(plan.objects, kind, v)
    .filter((object) => object.behavior !== 'static')
    .map((object) => rotatedObject(object, turn, origin));

  return {
    ...plan,
    brief: 'Move the mechanism through contact with its handle.',
    objects,
    timeline: plan.timeline.map((command) => ({ ...command, target: command.target ? at(command.target) : undefined })),
  };
}

export const HOUSEHOLD_GOALS: CaseGoal[] = (Object.keys(HOUSEHOLD_FIXTURES) as HouseholdKind[]).map((kind) => ({
  kind,
  name: HOUSEHOLD_FIXTURES[kind].name,
  needs: ['gripper'],
  bounds: { heightMm: { min: 20 } },
  params: fixtureParams,
  plan: (robot, values) => householdPlan(robot, values, kind),
}));
