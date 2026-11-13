import type { MainModule } from '@mujoco/mujoco';
import type { VelocityDrive } from '../sim/driveAccess';
import { buildMjcf } from '../sim/mjcf';
import type { MeshMeasure } from '../three/meshMeasure';
import { modelHashes } from '../skills/artifacts';
import { kitTopSpeed } from '../skills/kitModel';
import type { SkillRecord } from '../skills/skillRecords';
import { readyWalkRecord } from '../skills/skillRows';
import { designOf } from '../skills/skillsRuntime';
import { DEFAULT_PROJECT, type RobotJoint, type ScenePart } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { caseFilm } from './caseFilm';
import { runSeeds, type SeedRuns } from './caseRuns';
import type { FilmShot } from './filmstrip';
import { caseRunner, type CaseRobot } from './runCase';
import type { Case } from './schema';

export interface WireRobot {
  id: string;
  parts: ScenePart[];
  joints: RobotJoint[];
  measures: Record<string, MeshMeasure | undefined>;
  triangles: Record<string, Float32Array>;
}

export interface WalkPick {
  hash: string;
  topSpeed: number;
}

export interface RunsJob {
  type: 'runs';
  kase: Case;
  modelHash: string;
  robot?: WireRobot;
  seeds: number[];
  walk: VelocityDrive | null;
}

export interface ReplayJob {
  type: 'replay';
  kase: Case;
  modelHash: string;
  robot?: WireRobot;
  seed: number;
  walk: VelocityDrive | null;
}

export type CaseCheckJob = { type: 'model'; robot: WireRobot; walks: SkillRecord[] } | RunsJob | ReplayJob;

export type CaseCheckReply =
  | { type: 'model'; modelHash: string; walk: WalkPick | null }
  | { type: 'runs'; result: SeedRuns }
  | { type: 'replay'; film: FilmShot | null };

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

function walkPick(records: SkillRecord[], model: ReturnType<typeof robotModel>): WalkPick | null {
  if (!model.robots[0]?.floating) return null;

  const record = readyWalkRecord({ model, design: designOf(model), records });

  return record ? { hash: record.hash, topSpeed: kitTopSpeed(model) } : null;
}

export class CaseCheckSession {
  private held: { hash: string; robot: WireRobot } | null = null;

  async run(mj: MainModule, job: CaseCheckJob): Promise<CaseCheckReply> {
    if (job.type === 'model') {
      const model = robotModel(job.robot);
      const { physics, actuators } = modelHashes(model);
      const modelHash = `${physics}|${actuators}`;

      this.held = { hash: modelHash, robot: job.robot };

      return { type: 'model', modelHash, walk: walkPick(job.walks, model) };
    }

    const held = this.robotFor(job);
    const robot = caseRobotOf(held);

    if (job.type === 'replay') {
      const result = await caseRunner(mj, job.kase, robot, { controller: 'reference', walk: job.walk }).run(job.seed);

      return { type: 'replay', film: caseFilm(result, held.parts) };
    }

    const result = await runSeeds(mj, job.kase, robot, { seeds: job.seeds, walk: job.walk });

    return { type: 'runs', result };
  }

  private robotFor(job: RunsJob | ReplayJob): WireRobot {
    if (job.robot) this.held = { hash: job.modelHash, robot: job.robot };

    if (this.held?.hash !== job.modelHash) throw new Error(`No robot with model ${job.modelHash} was sent.`);

    return this.held.robot;
  }
}
