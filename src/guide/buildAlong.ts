import { servoLayout } from '../robot/sceneRobot';
import type { RobotJoint } from '../types/robotics';
import type { GuideArrow, GuideMove, GuidePlan } from './guideTypes';

export interface BuildAlongServo {
  partId: string;
  joint: string;
  id: number;
}

export interface BuildAlongStep {
  shown: string[];
  moves: GuideMove[];
  arrows: GuideArrow[];
  callout: Array<{ qty: number; name: string }>;
  servos: BuildAlongServo[];
}

const MODULE_KEY = 'module:';

export function servoBusIds(joints: readonly RobotJoint[]): Map<string, Omit<BuildAlongServo, 'partId'>> {
  const { movable, ids } = servoLayout(joints);

  return new Map(movable.flatMap((j, i) => (j.actuators ?? []).map((id) => [id, { joint: j.name, id: ids[i] }])));
}

function calloutName(plan: GuidePlan, key: string): string {
  if (key.startsWith(MODULE_KEY)) return plan.modules.find((m) => m.id === key.slice(MODULE_KEY.length))?.name ?? '';

  return plan.items.find((i) => i.key === key)?.name ?? '';
}

export function buildAlongSteps(plan: GuidePlan, joints: readonly RobotJoint[]): BuildAlongStep[] {
  const busIds = servoBusIds(joints);
  const built = new Set<string>();

  return plan.steps.map((step) => {
    const fresh = step.partIds.filter((id) => !built.has(id));

    fresh.forEach((id) => built.add(id));

    return {
      shown: [...new Set([...built, ...step.contextIds])],
      moves: step.moves,
      arrows: step.arrows,
      callout: step.callout.map((c) => ({ qty: c.qty, name: calloutName(plan, c.key) })).filter((c) => c.name),
      servos: fresh.flatMap((partId) => {
        const servo = busIds.get(partId);

        return servo ? [{ partId, ...servo }] : [];
      }),
    };
  });
}
