import type { PolicyRecord } from '../../types/robotics';
import { eyeRays } from '../eyes';
import type { SimModel } from '../mjcfTypes';
import type { PolicySpec } from '../policy';

export interface PackagedPolicy {
  record: PolicyRecord;
  spec: PolicySpec;
}

interface ObservationTerm {
  name: string;
  size: number;
  frame?: 'root';
  part?: string;
}

function observation(spec: PolicySpec): ObservationTerm[] {
  const n = spec.joints.length;

  return [
    { name: 'gravity', size: 3, frame: 'root' },
    { name: 'angular_velocity', size: 3, frame: 'root' },
    { name: 'linear_velocity', size: 3, frame: 'root' },
    { name: 'command', size: 3 },
    { name: 'joint_position_minus_default', size: n },
    { name: 'joint_velocity', size: n },
    { name: 'last_action', size: n },
    ...(spec.eyes ?? []).map((e) => ({ name: 'depth_rays', size: eyeRays(e), part: e.part })),
  ];
}

export function policySpecFile({ record, spec }: PackagedPolicy, model: Pick<SimModel, 'joints'>) {
  return {
    name: record.name,
    task: spec.task,
    trained_steps: spec.trainedSteps,
    mujoco: spec.mujoco,
    control_dt: spec.controlDt,
    command: spec.command,
    observation: observation(spec),
    action: {
      joints: spec.joints.map((id) => model.joints.find((j) => j.id === id)?.name ?? id),
      default_pose: spec.defaultPose,
      scale: spec.actionScale,
      target: 'default_pose + scale * clip(action, -1, 1)',
    },
    network: {
      file: 'policy.json',
      input: 'clip((observation - obsMean) / obsStd, -5, 5)',
      activation: spec.activation,
      squash: spec.squash ?? null,
    },
  };
}

export const jsonBytes = (v: unknown) => new TextEncoder().encode(`${JSON.stringify(v, null, 2)}\n`);

export function policyFiles(policies: PackagedPolicy[], model: Pick<SimModel, 'joints'>): Record<string, Uint8Array> {
  return Object.fromEntries(
    policies.flatMap((p) => {
      const folder = `policies/${p.record.id.replace(/[^\w-]/g, '_')}`;

      return [
        [`${folder}/policy.json`, jsonBytes(p.spec)],
        [`${folder}/spec.json`, jsonBytes(policySpecFile(p, model))],
      ];
    }),
  );
}
