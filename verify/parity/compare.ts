import type { MainModule } from '@mujoco/mujoco';

export interface Reference {
  version: string;
  single: { qpos: number[]; xpos: number[]; cinert: number[]; qfrc_bias: number[]; qacc: number[]; ncon: number };
  rollout: Array<{ step: number; qpos: number[]; qvel: number[] }>;
}

export const ABS_TOLERANCE = 1e-9;
export const REL_TOLERANCE = 1e-9;
export const ROLLOUT_TOLERANCE = 1e-6;

function worst(a: ArrayLike<number>, b: ArrayLike<number>, floor: number): number {
  let w = 0;

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const scale = Math.max(Math.abs(b[i] ?? 0), floor);

    w = Math.max(w, Math.abs((a[i] ?? Infinity) - (b[i] ?? Infinity)) / scale);
  }

  return w;
}

export interface ParityResult {
  forward: number;
  contacts: number;
  rollout: number;
}

export function compareWasm(mj: MainModule, xml: string, ref: Reference): ParityResult {
  const model = mj.MjModel.from_xml_string(xml);
  const data = new mj.MjData(model);

  mj.mj_forward(model, data);

  const forward = Math.max(
    worst(data.qpos, ref.single.qpos, 1),
    worst(data.xpos, ref.single.xpos, 1),
    worst(data.cinert, ref.single.cinert, 1),
    worst(data.qfrc_bias, ref.single.qfrc_bias, 1),
    worst(data.qacc, ref.single.qacc, 1),
  );
  const contacts = Math.abs(data.ncon - ref.single.ncon);
  let rollout = 0;
  let k = 0;
  const last = ref.rollout.at(-1)?.step ?? 0;

  for (let i = 0; i < last; i++) {
    for (let a = 0; a < model.nu; a++) data.ctrl[a] = 0.2 * Math.sin(0.01 * i);

    mj.mj_step(model, data);

    if (ref.rollout[k]?.step === i + 1) {
      rollout = Math.max(rollout, worst(data.qpos, ref.rollout[k].qpos, 1), worst(data.qvel, ref.rollout[k].qvel, 1));
      k++;
    }
  }

  data.delete();
  model.delete();

  return { forward, contacts, rollout };
}
