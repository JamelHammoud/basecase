import { Vector3, Quaternion } from 'three';
import type { ScenePart } from '../types/robotics';
import { partMatrix, type V3 } from '../utils/kinematics';
import { toMj, quatToMj } from './mjcfFrames';
import { esc, safeId, vec } from './mjcfText';
import { partEdges } from '../utils/partEdges';

export function authoredBox(part: ScenePart): boolean {
  return (
    (part.kind === 'box' || part.kind === 'cube') &&
    !partEdges(part) &&
    !part.sheetTransform &&
    !part.deformers &&
    !part.sculptMesh &&
    !part.boolean &&
    !part.csg &&
    !part.componentId &&
    !part.mesh &&
    !part.cad &&
    !part.customModelId &&
    !part.sketch &&
    !part.hardware
  );
}

export function fallbackCollider(p: ScenePart, origin: V3, attrs: string): string {
  const place = partMatrix(p);
  const d = p.dimensions;
  const center = new Vector3().applyMatrix4(place);
  const q = new Quaternion().setFromRotationMatrix(place);
  const pos = toMj([center.x - origin[0], center.y - origin[1], center.z - origin[2]]);
  const half = [Math.max(d.width, 1) / 2000, Math.max(d.depth, 1) / 2000, Math.max(d.height, 1) / 2000];

  return `<geom name="${esc(`g_${p.id.replace(/[^\w-]/g, '_')}`)}" type="box" size="${vec(half)}" pos="${vec(pos)}" quat="${vec(quatToMj(q))}" ${attrs}/>`;
}

export function contactGeometry(options: {
  part: ScenePart;
  origin: V3;
  hulls: Float32Array[];
  attrs: string;
  assets: string[];
}): string {
  const { part, origin, hulls, attrs, assets } = options;
  const place = partMatrix(part);
  const point = new Vector3();
  const shared = attrs.replace(/mass="([^"]*)"/, (_, mass: string) => `mass="${Number(mass) / hulls.length}"`);

  return hulls
    .map((hull, index) => {
      const vertices: number[] = [];

      for (let i = 0; i < hull.length; i += 3) {
        point.fromArray(hull, i).applyMatrix4(place);
        vertices.push(...toMj([point.x - origin[0], point.y - origin[1], point.z - origin[2]]));
      }

      const mesh = `m${assets.length}_${safeId(part.id)}_c${index}`;

      assets.push(`    <mesh name="${mesh}" vertex="${vec(vertices)}" maxhullvert="96" inertia="convex"/>`);

      return `<geom name="${esc(`g_${safeId(part.id)}_c${index}`)}" type="mesh" mesh="${mesh}" ${shared}/>`;
    })
    .join('\n');
}
