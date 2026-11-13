import type { MainModule } from '@mujoco/mujoco';
import type { VelocityDrive } from '../sim/driveAccess';
import { buildMjcf } from '../sim/mjcf';
import type { MeshMeasure } from '../three/meshMeasure';
import type { PolicySpec } from '../sim/policy';
import { modelHashes } from '../skills/artifacts';
import { kitTopSpeed } from '../skills/kitModel';
import { recordFreshness, type SkillRecord } from '../skills/skillRecords';
import { designOf } from '../skills/skillsRuntime';
import { DEFAULT_PROJECT, type RobotJoint, type ScenePart } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { runSeeds, type SeedRuns } from './caseRuns';
import type { CaseRobot } from './runCase';
import type { Case } from './schema';

export interface WireRobot {
  id: string;
  parts: ScenePart[];
  joints: RobotJoint[];
  measures: Record<string, MeshMeasure | undefined>;
  triangles: Record<string, Float32Array>;
}

export interface WalkOffer {
  record: SkillRecord;
  policy: PolicySpec;
}

export interface RunsJob {
  type: 'runs';
  kase: Case;
  modelHash: string;
  robot?: WireRobot;
  seeds: number[];
  walk: VelocityDrive | null;
}

export type CaseCheckJob = { type: 'model'; robot: WireRobot; walk: WalkOffer | null } | RunsJob;

export type CaseCheckReply =
  { type: 'model'; modelHash: string; walk: VelocityDrive | null } | { type: 'runs'; result: SeedRuns };

export const caseRobotOf = (robot: WireRobot): CaseRobot => ({
  id: robot.id,
  parts: robot.parts,
  joints: robot.joints,
  measures: robot.measures,
  partTriangles: (id) => robot.triangles[id] ?? null,
});

function robotModel(robot: WireRobot) {
  const rig = buildRig(robot.joints, robot.parts);

  return buildMjcf({ ...caseRobotOf(robot), rig, project: DEFAULT_PROJECT });
}

function readyWalk(offer: WalkOffer | null, model: ReturnType<typeof robotModel>): VelocityDrive | null {
  if (!offer || !model.robots[0]?.floating) return null;

  const fresh = recordFreshness(offer.record, { design: designOf(model), model }) === 'fresh';

  return fresh && offer.record.evidence ? { policy: offer.policy, topSpeed: kitTopSpeed(model) } : null;
}

export class CaseCheckSession {
  private held: { hash: string; robot: WireRobot } | null = null;

  async run(mj: MainModule, job: CaseCheckJob): Promise<CaseCheckReply> {
    if (job.type === 'model') {
      const model = robotModel(job.robot);
      const { physics, actuators } = modelHashes(model);
      const modelHash = `${physics}|${actuators}`;

      this.held = { hash: modelHash, robot: job.robot };

      return { type: 'model', modelHash, walk: readyWalk(job.walk, model) };
    }

    if (job.robot) this.held = { hash: job.modelHash, robot: job.robot };

    if (this.held?.hash !== job.modelHash) throw new Error(`No robot with model ${job.modelHash} was sent.`);

    const robot = caseRobotOf(this.held.robot);
    const result = await runSeeds(mj, job.kase, robot, { seeds: job.seeds, walk: job.walk });

    return { type: 'runs', result };
  }
}
