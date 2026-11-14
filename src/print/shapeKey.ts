import type { ScenePart } from '../types/robotics';
import { hashText, jsonHash, numbersHash } from '../utils/geometryHash';

export function shapeKey(p: ScenePart): string {
  const c = p.cad;

  return [
    p.id,
    p.kind,
    JSON.stringify(p.dimensions),
    JSON.stringify(p.deformers ?? null),
    JSON.stringify(p.edges ?? null),
    c ? `${c.language}:${hashText(c.code)}:${numbersHash(c.positions)}` : '',
    numbersHash(p.sculptMesh?.positions),
    numbersHash(p.mesh?.positions),
    jsonHash(p.customNodes),
    p.hardware ? JSON.stringify(p.hardware) : '',
  ].join('|');
}
