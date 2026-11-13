import type { MainModule } from '@mujoco/mujoco';
import type { VelocityDrive } from '../sim/driveAccess';
import { buildMjcf } from '../sim/mjcf';
import type { SimModel } from '../sim/mjcfTypes';
import type { MeshMeasure } from '../three/meshMeasure';
import { modelHashes } from '../skills/artifacts';
import { kitTopSpeed } from '../skills/kitModel';
import { hashOf } from '../skills/hash';
import type { SkillRecord } from '../skills/skillRecords';
import { readyWalkRecord } from '../skills/skillRows';
import { designOf } from '../skills/skillsRuntime';
import { DEFAULT_PROJECT, type RobotJoint, type ScenePart } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { caseFilm } from './caseFilm';
import { runSeeds, type SeedRuns } from './caseRuns';
import type { FilmShot } from './filmstrip';
import { checkFit } from './fitCheck';
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
  stop: string | null;
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
  | { type: 'model'; modelHash: string; walk: WalkPick | null; stop: string | null }
  | { type: 'runs'; result: SeedRuns }
  | { type: 'replay'; film: FilmShot | null };

export const caseRobotOf = (robot: WireRobot): CaseRobot => ({
  id: robot.id,
  parts: robot.parts,
  joints: robot.joints,
  measures: robot.measures,
  partTriangles: (id) => robot.triangles[id] ?? null,
});

function walkPick(records: SkillRecord[], model: SimModel | null): WalkPick | null {
  if (!model?.robots[0]?.floating) return null;

  const record = readyWalkRecord({ model, design: designOf(model), records });

  return record ? { hash: record.hash, topSpeed: kitTopSpeed(model) } : null;
}

function modelHashOf(model: SimModel) {
  const { physics, actuators } = modelHashes(model);

  return `${physics}|${actuators}`;
}

export class CaseCheckSession {
  private held: { hash: string; robot: WireRobot } | null = null;

  async run(mj: MainModule, job: CaseCheckJob): Promise<CaseCheckReply> {
    if (job.type === 'model') return this.fit(mj, job.robot, job.walks);

    const held = this.robotFor(job);
    const robot = caseRobotOf(held);

    if (job.type === 'replay') {
      const result = await caseRunner(mj, job.kase, robot, { controller: 'reference', walk: job.walk }).run(job.seed);

      return { type: 'replay', film: caseFilm(result, held.parts) };
    }

    const result = await runSeeds(mj, job.kase, robot, { seeds: job.seeds, walk: job.walk, stop: job.stop });

    return { type: 'runs', result };
  }

  private fit(mj: MainModule, robot: WireRobot, records: SkillRecord[]): CaseCheckReply {
    const rig = buildRig(robot.joints, robot.parts);
    const build = () => buildMjcf({ ...caseRobotOf(robot), rig, project: DEFAULT_PROJECT });
    const walks = (built: SimModel) => walkPick(records, built) !== null;
    const { model, stop } = checkFit(mj, { rig, parts: robot.parts, build, walks });
    const walk = walkPick(records, model);
    const modelHash = model ? modelHashOf(model) : `unbuilt|${hashOf({ parts: robot.parts, joints: robot.joints })}`;

    this.held = { hash: modelHash, robot };

    return { type: 'model', modelHash, walk, stop };
  }

  private robotFor(job: RunsJob | ReplayJob): WireRobot {
    if (job.robot) this.held = { hash: job.modelHash, robot: job.robot };

    if (this.held?.hash !== job.modelHash) throw new Error(`No robot with model ${job.modelHash} was sent.`);

    return this.held.robot;
  }
}
