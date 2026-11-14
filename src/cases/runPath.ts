import type { V3 } from '../utils/kinematics';
import { endPoint, type ProbeWorld } from './probes';
import type { ProbeEnd } from './schema';

export const PATH_HZ = 10;

export const NO_PATH = new Float32Array(0);

interface PathOf {
  dt: number;
  world: ProbeWorld;
  fixed: boolean;
}

export const pathEnd = (fixed: boolean, world: Pick<ProbeWorld, 'effector'>): ProbeEnd =>
  fixed && world.effector ? 'end-effector' : 'base';

export function runPath(frames: ReadonlyArray<{ poses: Float64Array }>, { dt, world, fixed }: PathOf): Float32Array {
  const every = Math.max(1, Math.round(1 / (PATH_HZ * dt)));
  const end = pathEnd(fixed, world);
  const count = Math.ceil(frames.length / every);
  const path = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) path.set(endPoint(end, world, frames[i * every].poses).toArray(), i * 3);

  return path;
}

export const pathPoints = (path: Float32Array): V3[] =>
  Array.from({ length: path.length / 3 }, (_, i) => [path[i * 3], path[i * 3 + 1], path[i * 3 + 2]]);
