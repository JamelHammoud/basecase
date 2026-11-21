import { selectedPickGeometryProblem } from './selectedPick';
import type { WorldObject } from './schema';
import { asId, refuse } from './validate';

function matchesSource(object: WorldObject): boolean {
  const part = object.geometry!;
  const dimensions = [part.dimensions.width, part.dimensions.height, part.dimensions.depth];

  return (
    part.id === object.id &&
    object.kind === part.kind &&
    object.size.every((value, axis) => value === dimensions[axis]) &&
    object.massG === part.massG &&
    object.friction === part.physics?.friction &&
    object.massSource === 'supplied'
  );
}

export function readPickTarget(value: unknown, objects: WorldObject[]): string | undefined {
  if (value === undefined) return undefined;

  const id = asId(value, 'world.pickTarget');
  const object = objects.find((item) => item.id === id);
  const part = object?.geometry;

  if (!object || !part || object.behavior !== 'dynamic' || object.parent || object.joint || object.movable)
    return refuse('world.pickTarget', 'must name an independent dynamic object with its selected geometry');

  const problem = selectedPickGeometryProblem(part);

  if (problem) return refuse('world.pickTarget', problem);

  return matchesSource(object) ? id : refuse('world.pickTarget', 'must retain selected geometry, weight and friction');
}
