import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';
import type { SimModel } from '../mjcfTypes';
import { pairKey } from '../../../electron/cad-kernel/pairKey.mjs';

export interface PhysicsSample {
  step: number;
  qpos: number[];
  qvel: number[];
  contacts: string[];
  poses: number[];
}

export interface ContactReplay {
  name: string;
  xml: string;
  signature: number;
  state: number[];
  actuatorForceRange: number[];
  bodyNames: string[];
  controls: number[][];
  expected: PhysicsSample[];
}

function integrationState(mj: MainModule, model: MjModel, data: MjData): number[] {
  const signature = mj.mjtState.mjSTATE_INTEGRATION.value;
  const buffer = new mj.DoubleBuffer(mj.mj_stateSize(model, signature));

  try {
    mj.mj_getState(model, data, buffer, signature);

    return Array.from(buffer.GetView() as Float64Array);
  } finally {
    buffer.delete();
  }
}

function contactBodies(mj: MainModule, model: MjModel, data: MjData): string[] {
  const list = data.contact;
  const pairs = new Set<string>();
  const bodyName = (geom: number) => mj.mj_id2name(model, mj.mjtObj.mjOBJ_BODY.value, model.geom_bodyid[geom]);

  try {
    for (let i = 0; i < data.ncon; i++) {
      const contact = list.get(i)!;

      if (contact.dist <= 0 && contact.efc_address >= 0)
        pairs.add(pairKey(bodyName(contact.geom1), bodyName(contact.geom2), '\u0000'));

      contact.delete();
    }

    return [...pairs].sort();
  } finally {
    list.delete();
  }
}

function sample(mj: MainModule, model: MjModel, data: MjData, step: number): PhysicsSample {
  mj.mj_kinematics(model, data);

  return {
    step,
    qpos: Array.from(data.qpos),
    qvel: Array.from(data.qvel),
    contacts: contactBodies(mj, model, data),
    poses: Array.from({ length: model.nbody }, (_, i) => [
      ...data.xpos.subarray(i * 3, i * 3 + 3),
      ...data.xquat.subarray(i * 4, i * 4 + 4),
    ]).flat(),
  };
}

export function captureContactReplay(mj: MainModule) {
  let state: number[] | null = null;
  let actuatorForceRange: number[] = [];
  let bodyNames: string[] = [];
  const controls: number[][] = [];
  const expected: PhysicsSample[] = [];
  const step = (model: MjModel, data: MjData) => {
    if (!state) {
      state = integrationState(mj, model, data);
      actuatorForceRange = Array.from(model.actuator_forcerange);
      bodyNames = Array.from({ length: model.nbody }, (_, i) => mj.mj_id2name(model, mj.mjtObj.mjOBJ_BODY.value, i));
      expected.push(sample(mj, model, data, 0));
    }

    controls.push(Array.from(data.ctrl));
    mj.mj_step(model, data);

    if (controls.length % 10 === 0) expected.push(sample(mj, model, data, controls.length));
  };
  const module = Object.create(mj, { mj_step: { value: step } }) as MainModule;
  const finish = (name: string, model: SimModel): ContactReplay => {
    if (!state) throw new Error('Capture a physics step before exporting a replay.');

    return {
      name,
      xml: model.xml,
      signature: mj.mjtState.mjSTATE_INTEGRATION.value,
      state,
      actuatorForceRange,
      bodyNames,
      controls,
      expected,
    };
  };

  return { module, finish };
}
