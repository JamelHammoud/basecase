import { replayCase } from '../cases/replayCase';
import { scaledToReach } from '../cases/scale';
import { loadTake } from '../cases/tryStore';
import { robotRunFor, robotSnapshot } from '../robot/robotStore';
import { faultReplayable, replayable, runOfTake } from '../robot/runBuffer';
import { linkParts } from '../utils/kinematics';
import { clockTime } from '../utils/timeAgo';
import type { WorkspaceCore } from './useWorkspaceCore';

const factsOf = (core: WorkspaceCore) => core.simTraining.cases.builder.robot.facts;

export const canReplayRuns = (core: WorkspaceCore) => factsOf(core).capabilities.includes('arm');

export function replayableFault(core: WorkspaceCore): number | null {
  const message = robotSnapshot().messages.find((m) => m.kind === 'fault' && faultReplayable(robotRunFor(m.id)));

  return message && canReplayRuns(core) ? message.id : null;
}

export async function replayRobotRun(core: WorkspaceCore, messageId: number) {
  const fault = robotRunFor(messageId);
  const take = faultReplayable(fault) ? await loadTake(fault.takeId) : null;
  const run = fault && take ? runOfTake(take, fault) : null;

  if (!replayable(run)) return;

  const { cases } = core.simTraining;
  const facts = factsOf(core);
  const world = cases.active ? scaledToReach(cases.active, facts.reachMm, facts.anchor).world.objects : [];
  const built = replayCase({ run, name: `Fault at ${clockTime(run.faultAt)}`, world });

  if (!built.ok) return core.showToast(built.problem);

  cases.addAndTry(built.kase);
  core.tool.setRightTab('sim');

  if (run.faultJoint) core.setSelectedIds(linkParts(core.posing.rig, run.faultJoint));
}
