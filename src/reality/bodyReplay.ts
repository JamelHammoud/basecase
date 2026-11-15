import type { MainModule } from '@mujoco/mujoco';
import type { RobotRun } from '../robot/runBuffer';
import { SimEngine } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import { applyBodyFit } from './bodyModel';
import type { BodyFit } from './bodyTypes';

export interface BodyReplayInput {
  mj: MainModule;
  model: SimModel;
  robot: string;
  run: RobotRun;
}

export function replayBody(input: BodyReplayInput, fit: BodyFit): number[][] {
  const { mj, model, robot, run } = input;
  const engine = new SimEngine(mj, applyBodyFit(model, robot, fit));
  const indices = run.joints.map((id) => model.joints.findIndex((j) => j.id === id));
  const initial = { ...model.initial, values: { ...model.initial.values } };

  run.joints.forEach((id, i) => {
    const joint = model.joints[indices[i]];
    const p = run.statuses[0].positions[i];

    if (joint && p !== null) initial.values[id] = p * (joint.type === 'revolute' ? 180 / Math.PI : 1000);
  });

  try {
    engine.reset(initial);

    return replayFrames(engine, { ...input, indices });
  } finally {
    engine.dispose();
  }
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
