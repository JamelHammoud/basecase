import type { ForgeJob, ForgeOutcome } from '../src/skills/forgeRunner';

export type StubbedHook = '__studio' | '__gallery';

export const ARENA_LINE = /\d+ of \d+ tries, at least \d+%/;

export const stubTabGpu = () =>
  Object.defineProperty(Navigator.prototype, 'gpu', {
    configurable: true,
    get: () => ({ requestAdapter: () => Promise.resolve({}) }),
  });

export function holdPolicy(job: Record<string, unknown>, trainedSteps = 1) {
  const spec = job as { joints: Array<{ id: string }>; robotName: string; defaultPose: number[] };
  const joints = spec.joints.map((j) => j.id);
  const inputs = 12 + 3 * joints.length;

  return {
    format: 'basecase-policy',
    version: 1,
    task: 'stand',
    robot: spec.robotName,
    joints,
    defaultPose: spec.defaultPose,
    actionScale: job.actionScale,
    controlDt: job.controlDt,
    command: job.command,
    obsMean: new Array(inputs).fill(0),
    obsStd: new Array(inputs).fill(1),
    layers: [{ in: inputs, out: joints.length, w: new Array(inputs * joints.length).fill(0), b: joints.map(() => 0) }],
    activation: 'elu',
    trainedSteps,
    mujoco: 'stub',
    createdAt: '2026-11-13T00:00:00',
  };
}

export function stubHoldPose(hook: StubbedHook) {
  const holdPose = () => (job: ForgeJob) => {
    const spec = job.job as { joints: Array<{ id: string }>; robotName: string; defaultPose: number[] };
    const joints = spec.joints.map((j) => j.id);
    const inputs = 12 + 3 * joints.length;
    const policy = {
      format: 'basecase-policy',
      version: 1,
      task: 'stand',
      robot: spec.robotName,
      joints,
      defaultPose: spec.defaultPose,
      actionScale: job.job.actionScale,
      controlDt: job.job.controlDt,
      command: job.job.command,
      obsMean: new Array(inputs).fill(0),
      obsStd: new Array(inputs).fill(1),
      layers: [
        { in: inputs, out: joints.length, w: new Array(inputs * joints.length).fill(0), b: joints.map(() => 0) },
      ],
      activation: 'elu',
      trainedSteps: 1,
      mujoco: 'stub',
      createdAt: '2026-11-13T00:00:00',
    };
    const outcome = { ok: true, policy, events: [{ type: 'done', steps: 1 }], stderr: '', run: 'stub-1' };

    return Promise.resolve(outcome as unknown as ForgeOutcome);
  };
  const target = (window as unknown as Record<StubbedHook, { stubTabEngine: (engine: unknown) => unknown }>)[hook];

  return target.stubTabEngine(holdPose);
}
