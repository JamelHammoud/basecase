import type { RobotRun } from '../robot/runBuffer';
import type { SimModel } from '../sim/mjcfTypes';
import { ENCODER_RAD } from './verdict';
import type { BodyErrorUnits } from './bodyTypes';

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
