import type { Recording } from '../../sim/recorder';

export function inspectionRecording(): Recording {
  return {
    frames: 2,
    dt: 0.02,
    nq: 1,
    nv: 1,
    nu: 1,
    nbody: 1,
    t: new Float32Array([0, 0.02]),
    ctrl: new Float32Array(2),
    qpos: new Float64Array(2),
    qvel: new Float32Array(2),
    poses: new Float32Array(14),
    jointQpos: new Int32Array([0]),
    jointDof: new Int32Array([0]),
    root: [-1, -1],
  };
}
