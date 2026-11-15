import * as THREE from 'three';
import type { LightenFrozen, LightenInput, LightenResult } from '../../strength/lighten';
import type { ScrewLine, V3 } from '../../strength/types';

export interface LightenTask extends Omit<LightenInput, 'positions'> {
  part: string;
  shapeTransform?: number[];
}

export function lightenResultInFrame(result: LightenResult, transform?: number[]): LightenResult {
  if (!transform) return result;

  const inverse = new THREE.Matrix4().fromArray(transform).invert();

  new THREE.BufferAttribute(result.positions, 3).applyMatrix4(inverse);

  return result;
}

const point = (inverse: THREE.Matrix4, p: V3): V3 => new THREE.Vector3(...p).applyMatrix4(inverse).toArray() as V3;

const direction = (inverse: THREE.Matrix4, v: V3): V3 =>
  new THREE.Vector3(...v).transformDirection(inverse).toArray() as V3;

function localBox(inverse: THREE.Matrix4, box: { min: V3; max: V3 }) {
  const moved = new THREE.Box3(new THREE.Vector3(...box.min), new THREE.Vector3(...box.max)).applyMatrix4(inverse);

  return { min: moved.min.toArray() as V3, max: moved.max.toArray() as V3 };
}

type LocalLighten = Omit<LightenInput, 'positions' | 'frozen'> & { frozen: Required<LightenFrozen> };

export function lightenInFrame(matrix: number[], task: LightenTask): LocalLighten {
  const inverse = new THREE.Matrix4().fromArray(matrix).invert();
  const line = (s: ScrewLine): ScrewLine => ({ ...s, from: point(inverse, s.from), to: point(inverse, s.to) });
  const jobs = task.jobs.map((job) => ({
    ...job,
    load: {
      ...job.load,
      origin: point(inverse, job.load.origin),
      axis: direction(inverse, job.load.axis),
      screws: job.load.screws.map(line),
    },
    holds: job.holds.map(line),
  }));

  return {
    jobs,
    targetShare: task.targetShare,
    minWallMm: task.minWallMm,
    frozen: {
      lines: task.frozen?.lines?.map(line) ?? [],
      boxes: task.frozen?.boxes?.map((b) => localBox(inverse, b)) ?? [],
      planes:
        task.frozen?.planes?.map((p) => ({
          ...p,
          point: point(inverse, p.point),
          normal: direction(inverse, p.normal),
        })) ?? [],
    },
  };
}
