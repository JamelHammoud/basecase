import type { RaceInput } from './raceTypes';
import { checkArmMotion } from './armMotionTrial';
import { errorMessage } from '../utils/errorMessage';

export async function fixedMoveProblem(input: RaceInput): Promise<string | null> {
  const { task } = input;

  if (task.goal.kind !== 'track') return null;

  const animation = task.goal.animation;
  const robot = task.model.robots.find((r) => r.key === task.environment.robot);

  if (!robot || robot.floating) return null;

  const changed = new Set(
    task.environment.action.joints.filter((id) =>
      animation.keyframes.some(
        (key) =>
          Math.abs((key.values[id] ?? task.model.initial.values[id] ?? 0) - (task.model.initial.values[id] ?? 0)) >
          1e-8,
      ),
    ),
  );
  const parts = task.model.bodies
    .filter((body) => body.joint && changed.has(body.joint))
    .flatMap((body) => body.parts.slice(0, 1));

  try {
    const checked = await checkArmMotion(input.mj, task.model, {
      controller: { kind: 'animation', animation },
      environment: task.environment,
      parts,
      stop: () => input.signal?.aborted ?? false,
    });

    return checked.controller ? null : checked.reason;
  } catch (error) {
    return errorMessage(error);
  }
}
