import type { SimJoint } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';

export interface TimelineLane {
  jointId: string;
  unit: '°' | 'mm';
  target: Float32Array | null;
  position: Float32Array;
  effort: Float32Array | null;
  limit: number;
}

export type LaneJoint = Pick<SimJoint, 'id' | 'type' | 'actuator' | 'drive' | 'effort'>;

const toUnit = (type: LaneJoint['type']) => (type === 'prismatic' ? 1000 : 180 / Math.PI);

function column(r: Recording, read: (frame: number) => number): Float32Array {
  const out = new Float32Array(r.frames);

  for (let n = 0; n < r.frames; n++) out[n] = read(n);

  return out;
}

export function timelineLanes(joints: LaneJoint[], r: Recording, efforts: Float32Array[] | null): TimelineLane[] {
  return joints.flatMap((j, i) => {
    const effort = efforts?.[i];

    if (j.actuator < 0 || (efforts && !effort?.length)) return [];

    const scale = toUnit(j.type);
    const address = r.jointQpos?.[i];

    return [
      {
        jointId: j.id,
        unit: j.type === 'prismatic' ? 'mm' : '°',
        target: j.drive === 'position' ? column(r, (n) => r.ctrl[n * r.nu + j.actuator] * scale) : null,
        position: column(r, (n) => (address === undefined ? Number.NaN : r.qpos[n * r.nq + address] * scale)),
        effort: effort ? column(r, (n) => Math.abs(effort[n] ?? Number.NaN)) : null,
        limit: j.effort,
      },
    ];
  });
}
