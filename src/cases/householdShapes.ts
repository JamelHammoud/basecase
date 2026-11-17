import { Euler, Quaternion, Vector3 } from 'three';
import type { V3 } from '../utils/kinematics';
import type { GoalValues } from './caseGoals';
import { HOUSEHOLD_FIXTURES, type HouseholdKind } from './householdKinds';
import type { WorldObject } from './schema';

function binWalls(floor: WorldObject): WorldObject[] {
  const [width, , depth] = floor.size;
  const [x, y, z] = floor.position;

  return [-1, 1].map((side) => ({
    ...floor,
    id: `bin-side-${side}`,
    parent: floor.id,
    joint: undefined,
    position: [x + side * (width / 2 - 2), y + 12, z],
    size: [4, 24, depth],
    massG: 2,
  }));
}

function handleConnector(primary: WorldObject, handle: WorldObject): WorldObject {
  const from = new Vector3(...primary.position);
  const to = new Vector3(...handle.position);
  const length = from.distanceTo(to);
  const turn = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), to.clone().sub(from).normalize());
  const angles = new Euler().setFromQuaternion(turn);

  return {
    ...primary,
    id: `${primary.id}-stem`,
    name: 'Handle stem',
    kind: 'cylinder',
    parent: primary.id,
    joint: undefined,
    position: from.add(to).multiplyScalar(0.5).toArray() as V3,
    rotation: [angles.x, angles.y, angles.z].map((value) => (value * 180) / Math.PI) as V3,
    size: [6, length, 6],
    massG: 1,
  };
}

export function householdShapes(objects: WorldObject[], kind: HouseholdKind, v: GoalValues): WorldObject[] {
  const primary = { ...objects[0], name: HOUSEHOLD_FIXTURES[kind].object };
  const changed: Partial<Record<HouseholdKind, Partial<WorldObject>>> = {
    lever: { size: [12, 6, v.fixtureDepthMm] },
    knob: {
      kind: 'cylinder',
      rotation: [0, 0, 90],
      position: [
        primary.joint!.origin[0] + objects[1].size[0] / 2 + 2.5,
        primary.joint!.origin[1],
        primary.joint!.origin[2],
      ],
      size: [v.fixtureWidthMm, 6, v.fixtureWidthMm],
    },
    button: { kind: 'cylinder', rotation: [90, 0, 0], size: [v.fixtureWidthMm, 6, v.fixtureWidthMm] },
    gate: {
      size: [6, v.fixtureWidthMm, v.fixtureDepthMm],
      position: [primary.position[0], primary.position[1] + 3 - v.fixtureWidthMm / 2, primary.position[2]],
    },
  };

  const body = { ...primary, ...changed[kind] };
  const handle: WorldObject = kind === 'knob' ? { ...objects[1], kind: 'sphere', size: [24, 24, 24] } : objects[1];
  const connectors = kind === 'knob' || kind === 'button' ? [handleConnector(body, handle)] : [];

  return [body, handle, ...objects.slice(2), ...connectors, ...(kind === 'bin' ? binWalls(primary) : [])];
}
