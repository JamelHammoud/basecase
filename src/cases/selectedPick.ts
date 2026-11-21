import { validPartAppearances } from '../appearance/validation';
import { Euler, Vector3 } from 'three';
import type { ScenePart } from '../types/robotics';
import { partEdges } from '../utils/partEdges';
import type { BuilderRobot } from './caseGoals';
import { readFixtureGeometry } from './fixtureGeometry';
import type { WorldObject } from './schema';

function modifiedGeometry(part: ScenePart): boolean {
  return [
    part.mesh,
    part.cad,
    part.sculptMesh,
    part.customNodes,
    part.sheetTransform,
    part.deformers,
    partEdges(part),
    part.boolean,
    part.csg,
    part.componentId,
    part.hardware,
    part.sketch,
  ].some(Boolean);
}

export function selectedPickGeometryProblem(part: ScenePart): string | null {
  if (!validPartAppearances([part])) return 'The scene’s parts are damaged.';

  const primitive = ['box', 'cube', 'cylinder'].includes(part.kind);

  if (!primitive || modifiedGeometry(part) || part.role !== 'solid')
    return 'Select a rigid box or cylinder without shape edits.';

  try {
    readFixtureGeometry(part, part.id);
  } catch {
    return 'Set finite object dimensions and placement before making a pick Case.';
  }

  if (part.kind === 'cylinder' && part.dimensions.width !== part.dimensions.depth)
    return 'Set equal cylinder width and depth before making a pick Case.';

  return selectedPickPhysicsProblem(part);
}

function selectedPickPhysicsProblem(part: ScenePart): string | null {
  const mass = part.massG;
  const friction = part.physics?.friction;

  if (!(mass !== undefined && Number.isFinite(mass) && mass >= 0.1 && mass <= 1e6))
    return 'Set the object weight from 0.1 to 1000000 g before making a pick Case.';

  if (!(friction !== undefined && Number.isFinite(friction) && friction >= 0 && friction <= 100))
    return 'Set object friction from 0 to 100 before making a pick Case.';

  return null;
}

export function selectedPickSpan(part: ScenePart, across: readonly number[]): number {
  const angles = part.rotation.map((value) => (-value * Math.PI) / 180) as [number, number, number];
  const direction = new Vector3(...across).applyEuler(new Euler(...angles, 'ZYX'));
  const { width, height, depth } = part.dimensions;

  if (part.kind === 'cylinder') return Math.hypot(direction.x, direction.z) * width + Math.abs(direction.y) * height;

  return Math.abs(direction.x) * width + Math.abs(direction.y) * height + Math.abs(direction.z) * depth;
}

export function selectedPickProblem(part: ScenePart, robot: BuilderRobot): string | null {
  const problem = selectedPickGeometryProblem(part);

  if (problem) return problem;

  if (robot.rig?.robots.some((item) => item.parts.has(part.id))) return 'Select an object separate from the robot.';

  const gripper = robot.facts.gripper;

  if (!gripper) return 'Select a robot with opposing driven jaws.';

  const width = selectedPickSpan(part, gripper.across);

  if (width >= gripper.openingMm || width <= gripper.closedOpeningMm)
    return 'Fit the fingers and jaw travel around the selected object.';

  const bottom = part.position[1] - selectedPickSpan(part, [0, 1, 0]) / 2;

  if (Math.abs(bottom) > 0.1) return 'Place the selected object on the floor before making a pick Case.';

  return null;
}

export function selectedPickObject(part: ScenePart): WorldObject {
  const geometry = structuredClone(part);
  const zero = (value: number) => (value === 0 ? 0 : value);

  geometry.position = geometry.position.map(zero) as typeof geometry.position;
  geometry.rotation = geometry.rotation.map(zero) as typeof geometry.rotation;

  return {
    id: part.id,
    name: part.name,
    kind: part.kind as WorldObject['kind'],
    geometry,
    position: [...geometry.position],
    rotation: [...geometry.rotation],
    size: [part.dimensions.width, part.dimensions.height, part.dimensions.depth],
    color: part.color,
    behavior: 'dynamic',
    massG: part.massG,
    massSource: 'supplied',
    friction: part.physics!.friction,
  };
}
