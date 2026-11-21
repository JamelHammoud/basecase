import type { RobotRun } from '../robot/runBuffer';
import type { SimModel } from '../sim/mjcfTypes';
import { ENCODER_RAD } from './verdict';
import type { BodyErrorUnits } from './bodyTypes';
import { canonicalJson } from '../skills/hash';

export function bodyTrajectoryKey(run: RobotRun): string {
  const start = run.statuses[0]?.at ?? 0;
  const end = run.statuses.at(-1)?.at ?? start;
  const round = (value: number) => Number(value.toPrecision(12));
  const points: Array<{ at: number; joints: number[] }> = [];

  for (const [index, intent] of run.intents.entries()) {
    if (intent.at >= end || (intent.at < start && (run.intents[index + 1]?.at ?? Infinity) <= start)) continue;

    const joints = intent.joints.map(round);
    const previous = points.at(-1);

    if (previous && joints.every((value, joint) => value === previous.joints[joint])) continue;

    points.push({ at: round(Math.max(0, intent.at - start)), joints });
  }

  return canonicalJson({ joints: run.joints, duration: round(end - start), points });
}

export function bodyErrorUnits(model: SimModel, run: RobotRun, joints: number[]): BodyErrorUnits {
  const types = new Set(joints.map((index) => model.joints.find((joint) => joint.id === run.joints[index])?.type));

  if (types.has('revolute') && types.has('prismatic')) return 'mixed';

  return types.has('prismatic') ? 'm' : 'rad';
}

export function bodyRunWindow(run: RobotRun): RobotRun {
  const firstIntent = run.intents[0]?.at;

  if (firstIntent === undefined) return run;

  return { ...run, statuses: run.statuses.filter((status) => status.at >= firstIntent) };
}

export function excitedBodyJoints(model: SimModel, robot: string, run: RobotRun): number[] {
  const joints = new Map(model.joints.filter((joint) => joint.robot === robot).map((joint) => [joint.id, joint]));

  return run.joints.flatMap((id, index) => {
    const joint = joints.get(id);
    const positions = run.statuses.map((status) => status.positions[index]);
    const finite = positions.filter((value): value is number => value !== null && Number.isFinite(value));
    const threshold = joint?.type === 'revolute' ? ENCODER_RAD : 0.00001;

    return joint && finite.length && Math.max(...finite) - Math.min(...finite) > threshold ? [index] : [];
  });
}
