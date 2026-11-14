import type { MainModule } from '@mujoco/mujoco';
import {
  driveAccess,
  FALL_CHECK_SECONDS,
  FALL_CHECK_SETTLE_SECONDS,
  fallCheckCommands,
  fallCheckPassed,
} from '../sim/driveAccess';
import type { DriveCommand } from '../sim/driveTypes';
import { SimEngine, type Controller, type SimStats } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import type { ScenePart } from '../types/robotics';
import { runClock } from '../utils/duration';
import { errorMessage } from '../utils/errorMessage';
import type { Rig } from '../utils/kinematics';

interface FitRun {
  model: SimModel;
  controller: Controller;
  seconds: number;
  commands?: Array<{ at: number; command: DriveCommand }>;
}

export interface FitInput {
  rig: Rig;
  parts: ScenePart[];
  build: () => SimModel;
  walks: (model: SimModel) => boolean;
}

export interface Fit {
  model: SimModel | null;
  stop: string | null;
}

const SETTLE_SECONDS = 1.5;
const STEP = 0.02;

function run(mj: MainModule, { model, controller, seconds, commands = [] }: FitRun): SimStats {
  const engine = new SimEngine(mj, model);
  const due = [...commands];

  try {
    engine.setController(controller);

    for (let t = 0; t < seconds; t += STEP) {
      while (due.length && due[0].at <= t + 1e-9) engine.command(due.shift()!.command);

      engine.step(STEP);
    }

    return engine.stats();
  } finally {
    engine.dispose();
  }
}

function restHeight(model: SimModel): number {
  const robot = model.robots[0];
  const body = model.bodies.find((b) => b.name === robot?.root);
  const lift = robot ? (model.initial.roots?.[robot.key]?.position?.[1] ?? 0) : 0;

  return ((body?.origin[1] ?? 0) + lift) / 1000;
}

function fallsOnWalk(mj: MainModule, input: FitInput, model: SimModel): boolean {
  const access = driveAccess({ rig: input.rig, parts: input.parts, model });

  if (input.walks(model) || access.kind !== 'ready' || !access.needsFallCheck) return false;

  const stats = run(mj, {
    model,
    controller: { kind: 'drive', setup: access.setup },
    seconds: FALL_CHECK_SECONDS + FALL_CHECK_SETTLE_SECONDS,
    commands: fallCheckCommands(),
  });

  return !fallCheckPassed(stats, restHeight(model));
}

export function checkFit(mj: MainModule, input: FitInput): Fit {
  let model: SimModel | null = null;
  let settle: SimStats;

  try {
    model = input.build();
    settle = run(mj, { model, controller: { kind: 'hold' }, seconds: SETTLE_SECONDS });
  } catch (e) {
    return { model, stop: errorMessage(e) };
  }

  const fell = settle.robots.find((r) => r.fellAt !== null);

  if (fell) return { model, stop: `Fell at ${runClock(fell.fellAt!)}` };

  return { model, stop: fallsOnWalk(mj, input, model) ? 'Falls on its walk' : null };
}
