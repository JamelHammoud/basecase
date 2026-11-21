import type { PartKind, ScenePart } from '../types/robotics';
import type { WorldItem } from '../sim/mjcfTypes';
import type { WorldObject } from './schema';
import { personMesh } from './personGeometry';

export function worldItem(o: WorldObject): WorldItem {
  const geometry = { ...o.geometry } as Partial<WorldItem>;

  delete geometry.sourcePartId;

  const part: ScenePart = {
    ...geometry,
    id: o.id,
    name: o.name,
    kind: o.geometry?.kind ?? (o.kind as PartKind),
    category: 'structure',
    role: 'solid',
    position: o.position,
    rotation: o.rotation,
    dimensions: { ...o.geometry?.dimensions, width: o.size[0], height: o.size[1], depth: o.size[2] },
    color: o.color,
    note: '',
    visible: true,
    locked: true,
    ...(o.opacity !== undefined ? { opacity: o.opacity } : {}),
    ...(o.massG !== undefined ? { massG: o.massG } : {}),
    ...(o.friction !== undefined ? { physics: { dynamic: o.behavior === 'dynamic', friction: o.friction } } : {}),
  };

  return {
    ...part,
    ...(o.person ? { kind: 'mesh' as const, mesh: personMesh(o.size), person: o.person } : {}),
    behavior: o.behavior,
    ...(o.parent ? { parent: o.parent } : {}),
    ...(o.joint ? { joint: o.joint } : {}),
    ...(o.movable ? { movable: true } : {}),
  };
}
