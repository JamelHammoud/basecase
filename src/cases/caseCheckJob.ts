import type { MainModule } from '@mujoco/mujoco';
import type { VelocityDrive } from '../sim/driveAccess';
import type { PolicySpec } from '../sim/policy';
import { preparedCalibratedModel } from '../sim/calibratedModel';
import type { SimModel, WorldItem } from '../sim/mjcfTypes';
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
import { caseRunner, type CaseRobot, type RunOptions } from './runCase';
import type { Case } from './schema';
import type { TryScoring } from './tries';
import { multiplyTry, type Multiplied } from './tryReplay';
import { recordingTransfer } from '../sim/recorder';
import { effortsTransfer } from '../sim/recordedFrames';
import { seedReplay, type SeedReplay } from './seedReplay';

export interface WireRobot {
  selfContact?: import('../sim/selfContact').SelfContactSettings;
  id: string;
  parts: ScenePart[];
  joints: RobotJoint[];
  measures: Record<string, MeshMeasure | undefined>;
  triangles: Record<string, Float32Array>;
  servoVolts?: number;
}

export interface WalkPick {
  hash: string;
  topSpeed: number;
}

interface Controlled {
  walk: VelocityDrive | null;
  policy?: PolicySpec | null;
  jointNoiseDeg?: number;
  worldColliders?: WorldItem[];
}

export interface RunsJob extends Controlled {
  type: 'runs';
  kase: Case;
  modelHash: string;
  robot?: WireRobot;
  seeds: number[];
  stop: string | null;
}

export interface ReplayJob extends Controlled {
  type: 'replay';
  kase: Case;
  modelHash: string;
  robot?: WireRobot;
  seed: number;
}

export interface RecordJob extends Omit<ReplayJob, 'type'> {
  type: 'record';
}

export interface MultiplyJob {
  type: 'multiply';
  source: TryScoring;
  seeds: number[];
}

export type CaseCheckJob =
  { type: 'model'; robot: WireRobot; walks: SkillRecord[] } | RunsJob | ReplayJob | RecordJob | MultiplyJob;

export type CaseCheckReply =
  | { type: 'model'; modelHash: string; walk: WalkPick | null; stop: string | null }
  | { type: 'runs'; result: SeedRuns }
  | { type: 'replay'; film: FilmShot | null }
  | { type: 'record'; replay: SeedReplay }
  | { type: 'multiply'; result: Multiplied };

export function replyTransfer(reply: CaseCheckReply): Transferable[] {
  if (reply.type === 'multiply') return reply.result.kept.flatMap((v) => recordingTransfer(v.recording));

  if (reply.type === 'record')
    return [...recordingTransfer(reply.replay.recording), ...effortsTransfer(reply.replay.efforts)];

  if (reply.type === 'runs' && 'outcomes' in reply.result) return reply.result.outcomes.map((o) => o.path.buffer);

  return [];
}

export const caseRobotOf = (robot: WireRobot): CaseRobot => ({
  selfContact: robot.selfContact,
  id: robot.id,
  parts: robot.parts,
  joints: robot.joints,
  measures: robot.measures,
  partTriangles: (id) => robot.triangles[id] ?? null,
  servoVolts: robot.servoVolts,
});

function walkPick(records: SkillRecord[], model: SimModel | null): WalkPick | null {
  if (!model?.robots[0]?.floating) return null;

  const record = readyWalkRecord({ model, design: designOf(model), records });

  return record ? { hash: record.hash, topSpeed: kitTopSpeed(model) } : null;
}

const controlOf = (job: Controlled): RunOptions =>
  job.policy
    ? { controller: 'policy', policy: job.policy, jointNoiseDeg: job.jointNoiseDeg, worldColliders: job.worldColliders }
    : { controller: 'reference', walk: job.walk, jointNoiseDeg: job.jointNoiseDeg, worldColliders: job.worldColliders };

function modelHashOf(model: SimModel) {
  const { physics, actuators } = modelHashes(model);

  return `${physics}|${actuators}`;
}

export class CaseCheckSession {
  private held: { hash: string; robot: WireRobot } | null = null;

  async run(mj: MainModule, job: CaseCheckJob): Promise<CaseCheckReply> {
    if (job.type === 'model') return this.fit(mj, job.robot, job.walks);

    if (job.type === 'multiply') return { type: 'multiply', result: await multiplyTry(mj, job.source, job.seeds) };

    const held = this.robotFor(job);
    const robot = caseRobotOf(held);

    if (job.type === 'record') {
      const result = await caseRunner(mj, job.kase, robot, { ...controlOf(job), record: true }).run(job.seed);

      return { type: 'record', replay: await seedReplay(mj, result, job.seed) };
    }

    if (job.type === 'replay') {
      const result = await caseRunner(mj, job.kase, robot, controlOf(job)).run(job.seed);

      return { type: 'replay', film: caseFilm(result, held.parts) };
    }

    const result = await runSeeds(mj, job.kase, robot, { seeds: job.seeds, stop: job.stop, ...controlOf(job) });

    return { type: 'runs', result };
  }

  private async fit(mj: MainModule, robot: WireRobot, records: SkillRecord[]): Promise<CaseCheckReply> {
    const rig = buildRig(robot.joints, robot.parts);
    const input = { ...caseRobotOf(robot), rig, project: { ...DEFAULT_PROJECT, selfContact: robot.selfContact } };
    const prepared = await preparedCalibratedModel(input, undefined).then(
      (model) => ({ model }),
      (error: unknown) => ({ error }),
    );
    const build = () => {
      if ('error' in prepared) throw prepared.error;

      return prepared.model;
    };
    const walks = (built: SimModel) => walkPick(records, built) !== null;
    const { model, stop } = checkFit(mj, { rig, parts: robot.parts, build, walks });
    const walk = walkPick(records, model);
    const modelHash = model ? modelHashOf(model) : `unbuilt|${hashOf({ parts: robot.parts, joints: robot.joints })}`;

    this.held = { hash: modelHash, robot };

    return { type: 'model', modelHash, walk, stop };
  }

  private robotFor(job: RunsJob | ReplayJob | RecordJob): WireRobot {
    if (job.robot) this.held = { hash: job.modelHash, robot: job.robot };

    if (this.held?.hash !== job.modelHash) throw new Error(`No robot with model ${job.modelHash} was sent.`);

    return this.held.robot;
  }
}
