import { buildRig } from '../utils/kinematics';
import { endPoint, type ProbeWorld } from './probes';
import { robotFacts } from './robotFit';
import type { CaseResult, CaseRobot } from './runCase';

export const PATH_DT = 0.1;

export function runPath(result: CaseResult, robot: CaseRobot): Float32Array {
  const rig = buildRig(robot.joints, robot.parts);
  const facts = robotFacts(rig, robot.parts);
  const world: ProbeWorld = {
    model: result.model,
    effector: facts.endEffector,
    basePart: robot.parts.find((p) => !rig.ownerOf.has(p.id))?.id ?? null,
    basePoint: rig.robots[0]?.pivot ?? [0, 0, 0],
    objectAt: new Map(),
  };
  const stride = Math.round(PATH_DT / result.trace.dt);
  const path = new Float32Array(Math.ceil(result.frames.length / stride) * 3);
  const end = facts.morphology === 'fixed' ? 'end-effector' : 'base';

  for (let i = 0; i < result.frames.length; i += stride)
    endPoint(end, world, result.frames[i].poses).toArray(path, (i / stride) * 3);

  return path;
}
