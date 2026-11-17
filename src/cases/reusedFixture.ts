import type { CustomModelDefinition } from '../types/robotics';
import type { BuilderRobot, GoalValues } from './caseGoals';
import { placeCaseFixture, fixtureSource } from './fixtureAssembly';
import { worldItem, type WorldObject } from './schema';
import { fixtureMass } from './fixtureGeometry';
import { halfExtents } from '../utils/selection';

export const fixtureHandle = (objects: WorldObject[]): WorldObject =>
  objects.find((object) => object.id === 'handle') ?? objects.find((object) => object.joint)!;

export function fixtureModelValues(model: CustomModelDefinition): Partial<GoalValues> {
  const { parts, joint, part } = fixtureSource(model);

  if (!joint || !part) return {};

  const extent = halfExtents(part);
  const floor = Math.min(...parts.map((item) => item.position[1] - halfExtents(item)[1]));

  return {
    fixtureWidthMm: extent[0] * 2,
    fixtureDepthMm: extent[2] * 2,
    fixtureTravel: joint.range?.[1],
    fixtureLowerStop: joint.range?.[0],
    fixtureStiffness: joint.stiffness === undefined ? undefined : joint.stiffness * 1000,
    fixtureSpringref: joint.springref,
    fixtureMassG: fixtureMass(part),
    fixtureFriction: (joint.frictionloss ?? 0) * 1000,
    fixtureDamping: (joint.damping ?? 0) * 1000,
    heightMm: joint.origin[1] - floor,
  };
}

export function reusedFixture(model: CustomModelDefinition, robot: BuilderRobot, v: GoalValues): WorldObject[] {
  const defaults = fixtureModelValues(model);
  const scaleX = v.fixtureWidthMm / (defaults.fixtureWidthMm ?? v.fixtureWidthMm);
  const scaleZ = v.fixtureDepthMm / (defaults.fixtureDepthMm ?? v.fixtureDepthMm);
  const dimensions = model.defaultDimensions;
  const source = placeCaseFixture(model, {
    position: [0, 0, 0],
    size: [dimensions.width * scaleX, dimensions.height, dimensions.depth * scaleZ],
  });
  const jointed = source.find((object) => object.joint)!;
  const handle = source.find((object) => object.parent === jointed.id && /handle|grip/i.test(object.name)) ?? jointed;
  const front = jointed.position[2] - halfExtents(worldItem(jointed))[2];
  const rename = new Map<string, string>([[jointed.id, 'fixture']]);

  if (handle !== jointed) rename.set(handle.id, 'handle');

  const shift = [
    robot.facts.anchor[0] - handle.position[0],
    v.heightMm - jointed.joint!.origin[1],
    robot.facts.anchor[2] + v.distanceMm - front,
  ];
  const objects = source.map((object): WorldObject => ({
    ...object,
    id: rename.get(object.id) ?? object.id,
    parent: object.parent ? (rename.get(object.parent) ?? object.parent) : undefined,
    position: object.position.map((value, i) => value + shift[i]) as WorldObject['position'],
    ...(object.joint
      ? {
          joint: {
            ...object.joint,
            origin: object.joint.origin.map((value, i) => value + shift[i]) as WorldObject['position'],
            ...(object === jointed
              ? {
                  range: [v.fixtureLowerStop, v.fixtureTravel] as [number, number],
                  frictionloss: v.fixtureFriction / 1000,
                  damping: v.fixtureDamping / 1000,
                  stiffness: v.fixtureStiffness / 1000,
                  springref: v.fixtureSpringref,
                }
              : {}),
          },
        }
      : {}),
    ...(object === jointed
      ? {
          massG: v.fixtureMassG,
          massSource: robot.fixtureEdits?.fixtureMassG === undefined ? object.massSource : 'supplied',
        }
      : {}),
  }));

  return [
    ...objects.filter((object) => object.id === 'fixture'),
    ...objects.filter((object) => object.id === 'handle'),
    ...objects.filter((object) => object.id !== 'fixture' && object.id !== 'handle'),
  ];
}
