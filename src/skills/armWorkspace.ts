import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import { fromMj, toMj } from '../sim/mjcfFrames';
import type { JointValues } from '../types/robotics';
import type { V3 } from '../utils/kinematics';
import { ArmConfiguration } from './armConfiguration';
import { reachSampleRandom } from './feasibilityReachSamples';
import { ConfigurationYield } from './configurationYield';
import { bodyPoint } from './feasibilityKinematics';

export const WORKSPACE_BUDGET = 2048;

function validateRequest(request: WorkspaceRequest) {
  const budget = request.budget ?? WORKSPACE_BUDGET;

  if (!Number.isInteger(budget) || budget < 1 || budget > 8192)
    throw new Error('Choose a sample budget from 1 to 8192.');

  if (request.point.length !== 3 || !request.point.every(Number.isFinite))
    throw new Error('Choose a finite tool point in millimeters.');

  return budget;
}

export interface WorkspaceRequest {
  part: string;
  point: V3;
  budget?: number;
  stop?: () => boolean;
}

export interface WorkspaceSamples {
  positions: Float64Array;
  configurations: Float64Array;
  joints: string[];
  fixedValues: JointValues;
  checks: number;
  durationMs: number;
}

function toolPoint(space: ArmConfiguration, mj: MainModule, request: WorkspaceRequest) {
  const owner = space.engine.sim.bodies.find((body) => body.parts.includes(request.part))!;
  const body = mj.mj_name2id(space.engine.model, mj.mjtObj.mjOBJ_BODY.value, owner.name);
  const local = toMj(request.point.map((v, i) => v - owner.origin[i]) as V3);

  return () => fromMj(...bodyPoint(space.engine, body, local));
}

export async function sampleArmWorkspace(
  mj: MainModule,
  model: SimModel,
  request: WorkspaceRequest,
): Promise<WorkspaceSamples> {
  const budget = validateRequest(request);

  if (request.stop?.()) throw new Error('Stopped.');

  const started = performance.now();
  const space = new ArmConfiguration(mj, model, [request.part]);
  const yielding = new ConfigurationYield();

  try {
    if (space.joints.some((j) => !j.range.every(Number.isFinite) || j.range[0] > j.range[1]))
      throw new Error('Workspace sampling needs finite joint limits.');

    const pointAt = toolPoint(space, mj, request);
    const random = reachSampleRandom();
    const positions = new Float64Array(budget * 3);
    const configurations = new Float64Array(budget * space.joints.length);
    const q = [...space.start];
    let accepted = 0;

    for (let i = 0; i < budget; i++) {
      if (request.stop?.()) throw new Error('Stopped.');

      space.joints.forEach((j, k) => (q[k] = j.range[0] + (j.range[1] - j.range[0]) * random()));

      if (space.clear(q)) {
        positions.set(pointAt(), accepted * 3);
        configurations.set(q, accepted * q.length);
        accepted++;
      }

      if ((i + 1) % 64 === 0) await yielding.wait();
    }

    if (request.stop?.()) throw new Error('Stopped.');

    return {
      positions: positions.slice(0, accepted * 3),
      configurations: configurations.slice(0, accepted * q.length),
      joints: space.joints.map((j) => j.id),
      fixedValues: space.fixedValues,
      checks: budget,
      durationMs: performance.now() - started,
    };
  } finally {
    yielding.dispose();
    space.dispose();
  }
}

export function workspaceValues(samples: WorkspaceSamples, index: number): JointValues {
  if (!Number.isInteger(index) || index < 0 || index >= samples.positions.length / 3)
    throw new Error('Choose a displayed sample.');

  return {
    ...samples.fixedValues,
    ...Object.fromEntries(
      samples.joints.map((id, k) => [id, (samples.configurations[index * samples.joints.length + k] * 180) / Math.PI]),
    ),
  };
}
