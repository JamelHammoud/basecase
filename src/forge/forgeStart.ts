import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';
import { primeCtrlHistory } from '../sim/ctrlHistory';

const SETTLE_SECONDS = 1;
const STANDING_TILT_DEGREES = 20;
const WARMSTART = 1 << 5;

export interface StartJob {
  root: string;
  initialJoints: Record<string, number>;
  rootOffset: number[];
  ctrlDefault: number[];
}

export interface Start {
  row: Float64Array;
  holdsPose: boolean;
  z0: number;
}

export function rotateIntoFrame(q: ArrayLike<number>, v: [number, number, number]): [number, number, number] {
  const [w, x, y, z] = [q[0], q[1], q[2], q[3]];
  const scale = 2 * w * w - 1;
  const cross = [y * v[2] - z * v[1], z * v[0] - x * v[2], x * v[1] - y * v[0]];
  const along = 2 * (x * v[0] + y * v[1] + z * v[2]);

  return [
    v[0] * scale - cross[0] * w * 2 + x * along,
    v[1] * scale - cross[1] * w * 2 + y * along,
    v[2] * scale - cross[2] * w * 2 + z * along,
  ];
}

function jointId(mj: MainModule, model: MjModel, name: string) {
  const id = mj.mj_name2id(model, mj.mjtObj.mjOBJ_JOINT.value, name);

  if (id < 0) throw new Error(`The model has no joint named ${name}`);

  return id;
}

interface Sim {
  mj: MainModule;
  model: MjModel;
  data: MjData;
}

function applyStartPose({ mj, model, data }: Sim, job: StartJob, rootQpos: number) {
  for (const [name, angle] of Object.entries(job.initialJoints)) {
    data.qpos[model.jnt_qposadr[jointId(mj, model, name)]] = angle;
  }

  for (let axis = 0; axis < 3; axis++) data.qpos[rootQpos + axis] += job.rootOffset[axis];
}

function holdControls(mj: MainModule, model: MjModel, data: MjData, ctrl: number[]) {
  primeCtrlHistory(
    mj,
    model,
    data,
    ctrl.slice(0, model.nu).map((value, actuator) => ({ actuator, value })),
  );
}

function stateRow(mj: MainModule, model: MjModel, data: MjData) {
  const signature = mj.mjtState.mjSTATE_INTEGRATION.value;
  const size = mj.mj_stateSize(model, signature);
  const buffer = new mj.DoubleBuffer(size);

  try {
    mj.mj_getState(model, data, buffer, signature);

    const row = Float64Array.from(buffer.GetView() as Float64Array);
    const warm = mj.mj_stateSize(model, signature & (WARMSTART - 1));

    row.fill(0, warm, warm + model.nv);

    return row;
  } finally {
    buffer.delete();
  }
}

export function settleStart(mj: MainModule, model: MjModel, job: StartJob): Start {
  const data = new mj.MjData(model);

  try {
    const rootQpos = model.jnt_qposadr[jointId(mj, model, job.root)];

    applyStartPose({ mj, model, data }, job, rootQpos);
    data.ctrl.set(job.ctrlDefault.slice(0, model.nu));
    mj.mj_forward(model, data);
    holdControls(mj, model, data, job.ctrlDefault);

    const zStart = data.qpos[rootQpos + 2];
    const steps = Math.floor(SETTLE_SECONDS / model.opt.timestep);

    for (let i = 0; i < steps; i++) mj.mj_step(model, data);

    const quat = data.qpos.subarray(rootQpos + 3, rootQpos + 7);
    const up = -rotateIntoFrame(quat, [0, 0, -1])[2];
    const holdsPose = up >= Math.cos((STANDING_TILT_DEGREES * Math.PI) / 180);

    if (!holdsPose) {
      mj.mj_resetData(model, data);
      applyStartPose({ mj, model, data }, job, rootQpos);
      mj.mj_forward(model, data);
    }

    data.qvel.fill(0);
    data.time = 0;
    holdControls(mj, model, data, job.ctrlDefault);

    return { row: stateRow(mj, model, data), holdsPose, z0: holdsPose ? data.qpos[rootQpos + 2] : zStart };
  } finally {
    data.delete();
  }
}
