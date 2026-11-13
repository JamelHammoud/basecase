import type { MjData } from '@mujoco/mujoco';
import type { EyeCaster } from './eyes';
import { act, observe, obsSize, type ObsSource, type PolicySpec } from './policy';

export interface PolicyState {
  action: Float32Array;
  obs: Float32Array;
  nextAt: number;
  src: ObsSource;
  targets: Float64Array;
  command: [number, number, number];
  eyes: EyeCaster | null;
}

export function stepPolicy(policy: PolicySpec, ps: PolicyState, data: MjData): void {
  if (data.time < ps.nextAt - 1e-9) return;

  ps.src.qpos = data.qpos;
  ps.src.qvel = data.qvel;
  observe(ps.src, { defaultPose: policy.defaultPose, command: ps.command }, ps.action, ps.obs);
  ps.eyes?.cast(ps.obs, obsSize(policy.joints.length));
  ps.action = act(policy, ps.obs);

  for (let k = 0; k < ps.action.length; k++) ps.targets[k] = policy.defaultPose[k] + policy.actionScale * ps.action[k];

  ps.nextAt += policy.controlDt;
}
