import type { RobotJoint, ScenePart } from '../types/robotics';
import { partBounds } from '../utils/selection';
import { boxesTouch } from './guideMath';
import type { Box, GuideScene, V3 } from './guideTypes';

const CONTACT_GAP_MM = 0.5;

export function partAxis(rotation: V3): V3 {
  const [x, y, z] = rotation.map((d) => (d * Math.PI) / 180);
  const [a, b, c, d, e, f] = [Math.cos(x), Math.sin(x), Math.cos(y), Math.sin(y), Math.cos(z), Math.sin(z)];

  return [-c * f, a * e - b * f * d, b * e + a * f * d];
}

export function boxContacts(boxes: Record<string, Box>, gap = CONTACT_GAP_MM): Record<string, string[]> {
  const ids = Object.keys(boxes).sort((a, b) => boxes[a].min[0] - boxes[b].min[0]);
  const out: Record<string, string[]> = Object.fromEntries(ids.map((id) => [id, []]));

  for (let i = 0; i < ids.length; i++) {
    const a = boxes[ids[i]];

    for (let j = i + 1; j < ids.length && boxes[ids[j]].min[0] - gap <= a.max[0]; j++) {
      if (!boxesTouch(a, boxes[ids[j]], gap)) continue;

      out[ids[i]].push(ids[j]);
      out[ids[j]].push(ids[i]);
    }
  }

  return out;
}

export function approximateScene(title: string, parts: ScenePart[], joints: RobotJoint[]): GuideScene {
  const boxes = Object.fromEntries(parts.map((p) => [p.id, partBounds(p)]));
  const axes = Object.fromEntries(parts.filter((p) => p.kind === 'hardware').map((p) => [p.id, partAxis(p.rotation)]));

  return { title, parts, joints, boxes, contacts: boxContacts(boxes), axes };
}
