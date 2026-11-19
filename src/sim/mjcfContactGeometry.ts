import { Vector3 } from 'three';
import type { ScenePart } from '../types/robotics';
import { partMatrix, type V3 } from '../utils/kinematics';
import { toMj } from './mjcfFrames';
import { esc, safeId, vec } from './mjcfText';

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
