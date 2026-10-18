export const POLICY_FORMAT = 'basecase-policy';
export const POLICY_VERSION = 1;

export type TrainTask = 'stand' | 'walk';

export interface PolicyLayer {
  in: number;
  out: number;
  w: number[];
  b: number[];
}

export interface PolicySpec {
  format: typeof POLICY_FORMAT;
  version: number;
  task: TrainTask;
  robot: string;
  joints: string[];
  defaultPose: number[];
  actionScale: number;
  controlDt: number;
  command: [number, number, number];
  obsMean: number[];
  obsStd: number[];
  layers: PolicyLayer[];
  activation: 'elu' | 'tanh';
  trainedSteps: number;
  mujoco: string;
  createdAt: string;
}

export const obsSize = (joints: number) => 12 + 3 * joints;

export function toBodyFrame(q: ArrayLike<number>, qo: number, v: [number, number, number]): [number, number, number] {
  const w = q[qo],
    x = q[qo + 1],
    y = q[qo + 2],
    z = q[qo + 3];
  const [vx, vy, vz] = v;
  const tx = 2 * (-y * vz + z * vy),
    ty = 2 * (-z * vx + x * vz),
    tz = 2 * (-x * vy + y * vx);

  return [vx + w * tx + (-y * tz + z * ty), vy + w * ty + (-z * tx + x * tz), vz + w * tz + (-x * ty + y * tx)];
}

export interface ObsSource {
  qpos: ArrayLike<number>;
  qvel: ArrayLike<number>;
  rootQpos: number;
  rootDof: number;
  jointQpos: number[];
  jointDof: number[];
}

export function observe(
  src: ObsSource,
  spec: Pick<PolicySpec, 'defaultPose' | 'command'>,
  lastAction: ArrayLike<number>,
  out: Float32Array,
): Float32Array {
  const { qpos, qvel, rootQpos: rq, rootDof: rd } = src;
  const g = toBodyFrame(qpos, rq + 3, [0, 0, -1]);
  const v = toBodyFrame(qpos, rq + 3, [qvel[rd], qvel[rd + 1], qvel[rd + 2]]);

  out[0] = g[0];
  out[1] = g[1];
  out[2] = g[2];
  out[3] = qvel[rd + 3];
  out[4] = qvel[rd + 4];
  out[5] = qvel[rd + 5];
  out[6] = v[0];
  out[7] = v[1];
  out[8] = v[2];
  out[9] = spec.command[0];
  out[10] = spec.command[1];
  out[11] = spec.command[2];

  const n = src.jointQpos.length;

  for (let i = 0; i < n; i++) {
    out[12 + i] = qpos[src.jointQpos[i]] - spec.defaultPose[i];
    out[12 + n + i] = qvel[src.jointDof[i]];
    out[12 + 2 * n + i] = lastAction[i];
  }

  return out;
}

const elu = (s: number) => (s > 0 ? s : Math.expm1(s));

export function act(spec: PolicySpec, obs: Float32Array): Float32Array {
  let x = new Float32Array(obs.length);

  for (let i = 0; i < obs.length; i++) x[i] = Math.max(-5, Math.min(5, (obs[i] - spec.obsMean[i]) / spec.obsStd[i]));

  spec.layers.forEach((L, li) => {
    const y = new Float32Array(L.out);

    for (let o = 0; o < L.out; o++) {
      let s = L.b[o];
      const row = o * L.in;

      for (let i = 0; i < L.in; i++) s += L.w[row + i] * x[i];

      if (li < spec.layers.length - 1) s = spec.activation === 'elu' ? elu(s) : Math.tanh(s);

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
