import type { MainModule } from '@mujoco/mujoco';
import type { RobotRun } from '../robot/runBuffer';
import { SimEngine } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import { applyBodyFit } from './bodyModel';
import type { BodyFit } from './bodyTypes';

export interface BodyReplayBudget {
  remainingSteps: number;
  cancelled?: () => boolean;
}

export class BodyReplayStopped extends Error {
  readonly reason: 'cancelled' | 'budget';

  constructor(reason: 'cancelled' | 'budget') {
    super(reason);
    this.reason = reason;
  }
}

function spendStep(budget: BodyReplayBudget) {
  if (budget.cancelled?.()) throw new BodyReplayStopped('cancelled');

  if (budget.remainingSteps <= 0) throw new BodyReplayStopped('budget');

  budget.remainingSteps--;
}

export interface BodyReplayInput {
  mj: MainModule;
  model: SimModel;
  robot: string;
  run: RobotRun;
  budget?: BodyReplayBudget;
  engine?: SimEngine;
  onFrame?: () => void;
  onStart?: (engine: SimEngine) => void;
}

export function replayBody(input: BodyReplayInput, fit: BodyFit): number[][] {
  if (input.engine) return replayRun(input.engine, input);

  return replayBodies({ ...input, runs: [input.run] }, fit)[0];
}

export function replayBodies(input: Omit<BodyReplayInput, 'run'> & { runs: RobotRun[] }, fit: BodyFit): number[][][] {
  const engine = new SimEngine(input.mj, applyBodyFit(input.model, input.robot, fit));

  try {
    return input.runs.map((run) => replayRun(engine, { ...input, run }));
  } finally {
    engine.dispose();
  }
}

function replayRun(engine: SimEngine, input: BodyReplayInput): number[][] {
  const { model, run } = input;
  const indices = run.joints.map((id) => model.joints.findIndex((joint) => joint.id === id));
  const initial = { ...model.initial, values: { ...model.initial.values } };

  run.joints.forEach((id, index) => {
    const joint = model.joints[indices[index]];
    const position = run.statuses[0].positions[index];

    if (joint && position !== null) initial.values[id] = position * (joint.type === 'revolute' ? 180 / Math.PI : 1000);
  });
  engine.reset(initial);
  input.onStart?.(engine);

  return replayFrames(engine, { ...input, indices });
}

function replayFrames(engine: SimEngine, input: BodyReplayInput & { indices: number[] }): number[][] {
  const { model, run, indices } = input;
  const firstAt = run.statuses[0].at;
  const predicted: number[][] = [];
  let intent = 0;
  let lastIntent = -1;

  for (const status of run.statuses) {
    const until = (status.at - firstAt) / 1000;

    while (engine.data.time + engine.dt / 2 < until) {
      if (input.budget) spendStep(input.budget);

      const at = firstAt + engine.data.time * 1000;

      while (intent + 1 < run.intents.length && run.intents[intent + 1].at <= at + 1e-6) intent++;

      if (intent !== lastIntent) {
        engine.setController({ kind: 'hold', values: intentValues(model, run, run.intents[intent].joints) });
        lastIntent = intent;
      }

      engine.step(engine.dt);
    }

    const angles = engine.jointAngles();

    predicted.push(indices.map((i) => angles[i]));
    input.onFrame?.();
  }

  return predicted;
}

function intentValues(model: SimModel, run: RobotRun, goals: number[]) {
  return Object.fromEntries(
    run.joints.map((id, i) => {
      const joint = model.joints.find((j) => j.id === id);

      return [id, goals[i] * (joint?.type === 'revolute' ? 180 / Math.PI : 1000)];
    }),
  );
}
