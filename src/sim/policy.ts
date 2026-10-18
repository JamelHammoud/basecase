/**
 * A trained policy and the contract it was trained under. The Python trainer
 * (electron/trainer/train.py) builds the same observation in the same order, so a policy runs
 * the same in the canvas as in training. Change one, change both, and bump `version`.
 *
 * Observation (robot's root body frame; MuJoCo axes: the robot faces −Y, its left is +X):
 *   0–2   gravity direction
 *   3–5   angular velocity (rad/s)
 *   6–8   linear velocity (m/s)
 *   9–11  command: forward m/s, left m/s, turn rad/s
 *   12…   joint positions − default (rad / m), joint velocities, last action
 * Action: joint targets = default + actionScale × action, held for controlDt.
 */

export const POLICY_FORMAT = 'basecase-policy';
export const POLICY_VERSION = 1;

export type TrainTask = 'stand' | 'walk';

export interface PolicyLayer {
  in: number;
  out: number;
  /** Row-major out × in */
  w: number[];
  b: number[];
}

export interface PolicySpec {
  format: typeof POLICY_FORMAT;
  version: number;
  task: TrainTask;
  /** Robot name when trained */
  robot: string;
  /** Scene joint ids, in action order */
  joints: string[];
  /** Joint targets the actions are offsets from (rad / m) */
  defaultPose: number[];
  actionScale: number;
  /** Seconds between actions */
  controlDt: number;
  command: [number, number, number];
  obsMean: number[];
  obsStd: number[];
  layers: PolicyLayer[];
  activation: 'elu' | 'tanh';
  /** Environment steps it trained for */
  trainedSteps: number;
  /** MuJoCo version it trained on */
  mujoco: string;
  createdAt: string;
}

export const obsSize = (joints: number) => 12 + 3 * joints;

/** Rotates a world vector into a frame given by quaternion (w, x, y, z): Rᵀ v */
export function toBodyFrame(q: ArrayLike<number>, qo: number, v: [number, number, number]): [number, number, number] {
  const w = q[qo], x = q[qo + 1], y = q[qo + 2], z = q[qo + 3];
  // Conjugate rotation
  const [vx, vy, vz] = v;
  const tx = 2 * (-y * vz + z * vy), ty = 2 * (-z * vx + x * vz), tz = 2 * (-x * vy + y * vx);
  return [vx + w * tx + (-y * tz + z * ty), vy + w * ty + (-z * tx + x * tz), vz + w * tz + (-x * ty + y * tx)];
}

export interface ObsSource {
  qpos: ArrayLike<number>;
  qvel: ArrayLike<number>;
  /** Free joint addresses of the root */
  rootQpos: number;
  rootDof: number;
  jointQpos: number[];
  jointDof: number[];
}

export function observe(src: ObsSource, spec: Pick<PolicySpec, 'defaultPose' | 'command'>, lastAction: ArrayLike<number>, out: Float32Array): Float32Array {
  const { qpos, qvel, rootQpos: rq, rootDof: rd } = src;
  const g = toBodyFrame(qpos, rq + 3, [0, 0, -1]);
  const v = toBodyFrame(qpos, rq + 3, [qvel[rd], qvel[rd + 1], qvel[rd + 2]]);
  out[0] = g[0]; out[1] = g[1]; out[2] = g[2];
  // A free joint's angular velocity is already in the body frame
  out[3] = qvel[rd + 3]; out[4] = qvel[rd + 4]; out[5] = qvel[rd + 5];
  out[6] = v[0]; out[7] = v[1]; out[8] = v[2];
  out[9] = spec.command[0]; out[10] = spec.command[1]; out[11] = spec.command[2];
  const n = src.jointQpos.length;
  for (let i = 0; i < n; i++) {
    out[12 + i] = qpos[src.jointQpos[i]] - spec.defaultPose[i];
    out[12 + n + i] = qvel[src.jointDof[i]];
    out[12 + 2 * n + i] = lastAction[i];
  }
  return out;
}

/** The policy's action for an observation (normalized and clipped like in training) */
export function act(spec: PolicySpec, obs: Float32Array): Float32Array {
  let x = new Float32Array(obs.length);
  for (let i = 0; i < obs.length; i++) x[i] = Math.max(-5, Math.min(5, (obs[i] - spec.obsMean[i]) / spec.obsStd[i]));
  spec.layers.forEach((L, li) => {
    const y = new Float32Array(L.out);
    for (let o = 0; o < L.out; o++) {
      let s = L.b[o];
      const row = o * L.in;
      for (let i = 0; i < L.in; i++) s += L.w[row + i] * x[i];
      if (li < spec.layers.length - 1) s = spec.activation === 'elu' ? (s > 0 ? s : Math.expm1(s)) : Math.tanh(s);
      y[o] = s;
    }
    x = y;
  });
  for (let i = 0; i < x.length; i++) x[i] = Math.max(-1, Math.min(1, x[i]));
  return x;
}

export function isPolicySpec(v: unknown): v is PolicySpec {
  const p = v as PolicySpec;
  return !!p && p.format === POLICY_FORMAT && Array.isArray(p.layers) && Array.isArray(p.joints);
}
