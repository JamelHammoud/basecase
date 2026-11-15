import { servoLayout } from '../robot/sceneRobot';
import type { RobotJoint } from '../types/robotics';
import type { Net, NetEnd } from '../wiring/netlist';
import type { GuideArrow, GuideMove, GuidePlan, GuideStep } from './guideTypes';

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
  routes: Net[];
  repairPhase?: GuideStep['repairPhase'];
  printPartId?: string;
  tools: string[];
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

function namedEnd(end: NetEnd, busIds: ReturnType<typeof servoBusIds>): NetEnd {
  const servo = end.id ? busIds.get(end.id) : null;

  return servo ? { ...end, name: `${servo.joint}, ID ${servo.id}` } : end;
}

function readyNets(nets: readonly Net[], built: Set<string>, routed: Set<Net>): Net[] {
  return nets.filter((net) => {
    const ends = [net.from.id, net.to.id].filter((id): id is string => !!id);
    const ready = ends.length > 0 && ends.every((id) => built.has(id)) && !routed.has(net);

    if (ready) routed.add(net);

    return ready;
  });
}

export function buildAlongSteps(
  plan: GuidePlan,
  joints: readonly RobotJoint[],
  nets: readonly Net[] = [],
): BuildAlongStep[] {
  const busIds = servoBusIds(joints);
  const built = new Set<string>();
  const routed = new Set<Net>();

  return plan.steps.map((step) => {
    const fresh = step.partIds.filter((id) => !built.has(id) || step.repairPhase === 'reassemble');

    fresh.forEach((id) => built.add(id));

    return {
      shown: step.shownIds ?? [...new Set([...built, ...step.contextIds])],
      moves: step.moves,
      arrows: step.arrows,
      repairPhase: step.repairPhase,
      printPartId: step.repairPhase === 'swap' && plan.repair?.printed ? plan.repair.partId : undefined,
      tools: step.tools.flatMap((id) => {
        const tool = plan.tools.find((entry) => entry.id === id);

        return tool ? [tool.name] : [];
      }),
      callout: step.callout.map((c) => ({ qty: c.qty, name: calloutName(plan, c.key) })).filter((c) => c.name),
      routes: readyNets(plan.repair ? [] : nets, built, routed).map((net) => ({
        ...net,
        from: namedEnd(net.from, busIds),
        to: namedEnd(net.to, busIds),
      })),
      servos: fresh
        .filter(() => step.repairPhase !== 'remove')
        .flatMap((partId) => {
          const servo = busIds.get(partId);

          return servo ? [{ partId, ...servo }] : [];
        }),
    };
  });
}
