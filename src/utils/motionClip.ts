import { autoMapBones, type Keypoint, type Mocap } from './mocapBones';

export type ClipVec = [number, number, number];

export interface MotionClip {
  name: string;
  frameTime: number;
  points: string[];
  parentOf: Record<string, string | null>;
  rest: ClipVec[];
  frames: ClipVec[][];
  keypoints: Partial<Record<Keypoint, string>>;
}

export const MAX_FRAMES = 240;

const plain = (pos: Map<string, { x: number; y: number; z: number }>, points: string[]): ClipVec[] =>
  points.map((name) => {
    const p = pos.get(name);

    return p ? [p.x, p.y, p.z] : [0, 0, 0];
  });

export function clipOf(m: Mocap, maxFrames = MAX_FRAMES): MotionClip {
  const points = [...m.bones, ...(m.ends ?? [])];
  const count = Math.max(2, m.frames || Math.round(m.duration / m.frameTime) + 1);
  const stride = Math.max(1, Math.ceil(count / maxFrames));
  const frames = Array.from({ length: Math.ceil(count / stride) }, (_, k) =>
    plain(m.sample(Math.min(k * stride * m.frameTime, m.duration)), points),
  );

  return {
    name: m.name,
    frameTime: m.frameTime * stride,
    points,
    parentOf: Object.fromEntries(points.map((p) => [p, m.parentOf.get(p) ?? null])),
    rest: plain(m.rest, points),
    frames,
    keypoints: autoMapBones(m),
  };
}
