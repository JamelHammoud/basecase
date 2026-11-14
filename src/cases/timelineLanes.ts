import type { SimJoint } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';

export interface TimelineLane {
  jointId: string;
  unit: '°' | 'mm';
  target: Float32Array | null;
  position: Float32Array;
  effort: Float32Array;
  limit: number;
}

export type LaneJoint = Pick<SimJoint, 'id' | 'type' | 'drive' | 'actuator' | 'effort'>;

const toUnit = (type: SimJoint['type']) => (type === 'prismatic' ? 1000 : 180 / Math.PI);

function column(r: Recording, read: (frame: number) => number): Float32Array {
  const out = new Float32Array(r.frames);

  for (let n = 0; n < r.frames; n++) out[n] = read(n);

  return out;
}

const NO_EFFORT = new Float32Array();

export function timelineLanes(
  joints: readonly LaneJoint[],
  r: Recording,
  efforts: Float32Array[] | null,
): TimelineLane[] {
  return joints.flatMap((j, i) => {
    const effort = efforts ? efforts[i] : NO_EFFORT;

    if (j.actuator < 0 || !effort || (efforts && !effort.length)) return [];

    const scale = toUnit(j.type);
    const address = r.jointQpos?.[i];

    return [
      {
        jointId: j.id,
        unit: j.type === 'prismatic' ? 'mm' : '°',
        target: j.drive === 'position' ? column(r, (n) => r.ctrl[n * r.nu + j.actuator] * scale) : null,
        position: column(r, (n) => (address === undefined ? Number.NaN : r.qpos[n * r.nq + address] * scale)),
        effort: effort.length ? column(r, (n) => Math.abs(effort[n] ?? Number.NaN)) : NO_EFFORT,
        limit: j.effort,
      },
    ];
  });
}
