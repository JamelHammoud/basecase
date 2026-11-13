import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';
import { act, observe, policyObsSize, type ObsSource, type PolicySpec } from '../sim/policy';
import { rotateIntoFrame, settleStart, type Start, type StartJob } from './forgeStart';
import { gateStart, RESET_JOINT_NOISE } from './gateStarts';

const EVAL_SECONDS = 8;
const MIN_UPRIGHT = 0.5;
const MIN_HEIGHT_SHARE = 0.45;

export interface ReplayJob extends StartJob {
  joints: Array<{ name: string }>;
  gateSpeed: number;
  seed: number;
  resetNoise?: number;
}

export interface ReplayResult {
  seeds: number;
  passed: number;
  fell: number;
  meanSpeed: number;
}

interface Robot {
  rootQpos: number;
  rootDof: number;
  actuators: number[];
  decimation: number;
  z0: number;
}

interface Run {
  mj: MainModule;
  model: MjModel;
  data: MjData;
  policy: PolicySpec;
  robot: Robot;
}

function named(mj: MainModule, model: MjModel, kind: 'JOINT' | 'ACTUATOR', name: string) {
  const type = kind === 'JOINT' ? mj.mjtObj.mjOBJ_JOINT.value : mj.mjtObj.mjOBJ_ACTUATOR.value;
  const id = mj.mj_name2id(model, type, name);

  if (id < 0) throw new Error(`The model has no ${kind.toLowerCase()} named ${name}`);

  return id;
}

function source(mj: MainModule, model: MjModel, job: ReplayJob, data: MjData): ObsSource {
  const root = named(mj, model, 'JOINT', job.root);
  const joints = job.joints.map((j) => named(mj, model, 'JOINT', j.name));

  return {
    qpos: data.qpos,
    qvel: data.qvel,
    rootQpos: model.jnt_qposadr[root],
    rootDof: model.jnt_dofadr[root],
    jointQpos: joints.map((j) => model.jnt_qposadr[j]),
    jointDof: joints.map((j) => model.jnt_dofadr[j]),
  };
}

const rootQuat = (src: ObsSource) => [3, 4, 5, 6].map((k) => src.qpos[src.rootQpos + k]);

function ctrlLimits(mj: MainModule, model: MjModel, job: ReplayJob) {
  const actuators = job.joints.map((j) => named(mj, model, 'ACTUATOR', j.name));
  const limited = (a: number) => model.actuator_ctrllimited[a] !== 0;

  return {
    ctrlLow: actuators.map((a) => (limited(a) ? model.actuator_ctrlrange[2 * a] : -Infinity)),
    ctrlHigh: actuators.map((a) => (limited(a) ? model.actuator_ctrlrange[2 * a + 1] : Infinity)),
  };
}

export function replayStarts(mj: MainModule, model: MjModel, replay: { job: ReplayJob; start: Start; seeds: number }) {
  const { job, start, seeds } = replay;
  const data = new mj.MjData(model);

  try {
    mj.mj_setState(model, data, Array.from(start.row), mj.mjtState.mjSTATE_INTEGRATION.value);

    const src = source(mj, model, job, data);
    const spec = {
      qpos: Array.from(src.qpos),
      rootQpos: src.rootQpos,
      jointQpos: src.jointQpos,
      ...ctrlLimits(mj, model, job),
      noise: job.resetNoise ?? RESET_JOINT_NOISE,
      seed: job.seed,
    };

    return Array.from({ length: seeds }, (_, robot) => gateStart(spec, robot));
  } finally {
    data.delete();
  }
}

function fallen(src: ObsSource, z0: number) {
  const up = -rotateIntoFrame(rootQuat(src), [0, 0, -1])[2];

  return up < MIN_UPRIGHT || src.qpos[src.rootQpos + 2] < MIN_HEIGHT_SHARE * z0;
}

function forwardSpeed(src: ObsSource) {
  const { qvel, rootDof: rd } = src;

  return -rotateIntoFrame(rootQuat(src), [qvel[rd], qvel[rd + 1], qvel[rd + 2]])[1];
}

function walk(run: Run, src: ObsSource, ctrlDefault: number[]) {
  const { mj, model, data, policy, robot } = run;
  const obs = new Float32Array(policyObsSize(policy));
  let last: Float32Array = new Float32Array(policy.joints.length);
  let forward = 0;

  for (let k = 0; k < EVAL_SECONDS / policy.controlDt; k++) {
    observe(src, policy, last, obs);
    last = act(policy, obs);
    data.ctrl.set(ctrlDefault.slice(0, model.nu));
    robot.actuators.forEach((a, j) => (data.ctrl[a] = policy.defaultPose[j] + policy.actionScale * last[j]));

    for (let s = 0; s < robot.decimation; s++) mj.mj_step(model, data);

    if (fallen(src, robot.z0)) return { fell: true, speed: forward / EVAL_SECONDS };

    forward += forwardSpeed(src) * policy.controlDt;
  }

  return { fell: false, speed: forward / EVAL_SECONDS };
}

export interface Replay {
  xml: string;
  job: ReplayJob;
  policy: PolicySpec;
  seeds: number;
}

export function replayWalk(mj: MainModule, replay: Replay): ReplayResult {
  const { xml, job, policy, seeds } = replay;
  const model = mj.MjModel.from_xml_string(xml);
  const data = new mj.MjData(model);

  try {
    const start = settleStart(mj, model, job);
    const src = source(mj, model, job, data);
    const robot: Robot = {
      rootQpos: src.rootQpos,
      rootDof: src.rootDof,
      actuators: job.joints.map((j) => named(mj, model, 'ACTUATOR', j.name)),
      decimation: Math.max(1, Math.round(policy.controlDt / model.opt.timestep)),
      z0: start.z0,
    };
    const starts = replayStarts(mj, model, { job, start, seeds });
    const results = starts.map((qpos) => {
      mj.mj_setState(model, data, Array.from(start.row), mj.mjtState.mjSTATE_INTEGRATION.value);
      (data.qpos as Float64Array).set(qpos);
      mj.mj_forward(model, data);

      return walk({ mj, model, data, policy, robot }, src, job.ctrlDefault);
    });
    const passed = results.filter((r) => !r.fell && r.speed >= job.gateSpeed).length;

    return {
      seeds,
      passed,
      fell: results.filter((r) => r.fell).length,
      meanSpeed: results.reduce((sum, r) => sum + r.speed, 0) / seeds,
    };
  } finally {
    data.delete();
    model.delete();
  }
}
