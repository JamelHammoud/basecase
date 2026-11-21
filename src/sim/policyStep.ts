import type { MjData } from '@mujoco/mujoco';
import type { EyeCaster } from './eyes';
import type { SimModel } from './mjcfTypes';
import {
  act,
  CLOCK_SIZE,
  observe,
  observeClock,
  obsSize,
  policyObsSize,
  type ObsSource,
  type PolicySpec,
} from './policy';

export interface PolicyState {
  action: Float32Array;
  obs: Float32Array;
  nextAt: number;
  startedAt: number;
  src: ObsSource;
  targets: Float64Array;
  actuators: number[];
  command: [number, number, number];
  eyes: EyeCaster | null;
}

export function createPolicyState(
  policy: PolicySpec,
  input: {
    data: MjData;
    joints: SimModel['joints'];
    root: { rootQpos: number; rootDof: number } | undefined;
    addresses: { qpos: number[]; dof: number[] };
    eyes: () => EyeCaster | null;
  },
): PolicyState {
  const width = policy.joints.length;
  const idx = policy.joints.map((id) => input.joints.findIndex((joint) => joint.id === id));

  if (!input.root || idx.some((i) => i < 0))
    throw new Error('This policy was trained on joints this robot no longer has. Train it again.');

  return {
    action: new Float32Array(width),
    obs: new Float32Array(policyObsSize(policy)),
    nextAt: input.data.time,
    startedAt: input.data.time,
    src: {
      qpos: input.data.qpos,
      qvel: input.data.qvel,
      rootQpos: input.root.rootQpos,
      rootDof: input.root.rootDof,
      jointQpos: idx.map((i) => input.addresses.qpos[i]),
      jointDof: idx.map((i) => input.addresses.dof[i]),
    },
    targets: new Float64Array(width),
    actuators: idx.map((i) => input.joints[i].actuator),
    command: [...policy.command],
    eyes: input.eyes(),
  };
}

export function stepPolicy(policy: PolicySpec, ps: PolicyState, data: MjData): void {
  if (data.time < ps.nextAt - 1e-9) return;

  ps.src.qpos = data.qpos;
  ps.src.qvel = data.qvel;
  observe(ps.src, { defaultPose: policy.defaultPose, command: ps.command }, ps.action, ps.obs);
  ps.eyes?.cast(ps.obs, obsSize(policy.joints.length));

  if (policy.clock) {
    const step = Math.round((ps.nextAt - ps.startedAt) / policy.controlDt);

    observeClock(policy.clock, step, ps.obs, policyObsSize(policy) - CLOCK_SIZE);
  }

  ps.action = act(policy, ps.obs);

  for (let k = 0; k < ps.action.length; k++) ps.targets[k] = policy.defaultPose[k] + policy.actionScale * ps.action[k];

  ps.nextAt += policy.controlDt;
}
