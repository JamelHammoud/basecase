import { offlineEvaluationMesh } from './evaluationAssets';
import type { ProjectSettings } from '../types/robotics';
import type { Randomization } from '../skills/environment';
import type { Recording } from '../sim/recorder';
import type { SeedReplay } from './seedReplay';
import type { SimModel } from '../sim/mjcfTypes';
import type { RecordedEfforts } from '../sim/recordedFrames';
import type { Trace } from '../skills/contract';
import { isHash, sha256Hex } from '../skills/hash';
import { keepTyped } from './recordingValues';
import { parseCase, type Case } from './schema';
import type { Trip } from './tripFrames';

export interface EvaluationReplay {
  version: 1;
  hash: string;
  evaluation: string;
  revision: string;
  seed: number;
  randomization?: Randomization;
  scene: Uint8Array;
  meshes: Record<string, Uint8Array>;
  model: SimModel;
  kase: Case;
  trace: Trace;
  efforts: RecordedEfforts;
  trips: Trip[];
  passed: boolean;
  margin: number;
}

export const evaluationReplayHash = (body: unknown) => sha256Hex(JSON.stringify(body, keepTyped));

const text = (value: unknown): value is string => typeof value === 'string' && value.length <= 512;
const vector = (value: unknown): boolean => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

function metadataFits(model: SimModel): boolean {
  return (
    model.bodies.every(
      (body) => text(body.name) && vector(body.origin) && Array.isArray(body.parts) && body.parts.every(text),
    ) &&
    model.joints.every(
      (joint) =>
        text(joint.id) &&
        text(joint.name) &&
        Number.isInteger(joint.actuator) &&
        joint.actuator >= -1 &&
        Number.isFinite(joint.effort),
    ) &&
    model.robots.every(
      (robot) => text(robot.key) && text(robot.root) && Array.isArray(robot.joints) && robot.joints.every(text),
    ) &&
    !!model.initial?.values &&
    Object.values(model.initial.values).every(Number.isFinite) &&
    (model.xml.match(/<body\b/g)?.length ?? 0) === model.bodies.length
  );
}

function modelFits(model: SimModel): boolean {
  return (
    !!model &&
    model.version === 2 &&
    typeof model.xml === 'string' &&
    model.xml.length <= 4 * 1024 * 1024 &&
    !/(?:<!|<\?|<include\b|<extension\b|<plugin\b|\bfile\s*=)/i.test(model.xml) &&
    Array.isArray(model.bodies) &&
    model.bodies.length <= 2048 &&
    Array.isArray(model.joints) &&
    model.joints.length <= 512 &&
    Array.isArray(model.robots) &&
    model.robots.length <= 16 &&
    metadataFits(model)
  );
}

function arraysFit(value: EvaluationReplay): boolean {
  return (
    value.scene instanceof Uint8Array &&
    value.scene.byteLength <= 8 * 1024 * 1024 &&
    !!value.meshes &&
    Object.values(value.meshes).every(
      (bytes) => bytes instanceof Uint8Array && bytes.length <= 8 * 1024 * 1024 && offlineEvaluationMesh(bytes),
    ) &&
    !!value.efforts &&
    [...value.efforts.peaks, ...value.efforts.forces].every(
      (row) => row instanceof Float32Array && row.every(Number.isFinite),
    ) &&
    Array.isArray(value.trips) &&
    value.trips.length <= 512 &&
    value.trips.every((trip) => typeof trip.label === 'string' && Number.isInteger(trip.frame) && trip.frame >= 0)
  );
}

export function readEvaluationReplay(value: unknown): EvaluationReplay | null {
  try {
    const replay = value as EvaluationReplay;
    const { hash, ...body } = replay;

    if (replay.version !== 1 || !isHash(hash) || !isHash(replay.evaluation) || !isHash(replay.revision)) return null;

    if (
      !Number.isInteger(replay.seed) ||
      replay.seed < 0 ||
      replay.seed > 0xffffffff ||
      !Number.isFinite(replay.margin) ||
      typeof replay.passed !== 'boolean'
    )
      return null;

    if (!modelFits(replay.model) || !arraysFit(replay) || evaluationReplayHash(body) !== hash) return null;

    parseCase(replay.kase);

    return replay;
  } catch {
    return null;
  }
}

export function replayOfEvaluation(recording: Recording): SeedReplay | undefined {
  const source = recording.evaluation;

  if (!source) return undefined;

  return {
    recording,
    efforts: source.efforts,
    model: source.model,
    kase: source.kase,
    trace: source.trace,
    trips: source.trips,
    passed: source.passed,
    margin: source.margin,
    seed: source.seed,
  };
}

export const evaluationScenePhysics = (project: ProjectSettings | undefined) => ({
  joints: project?.joints,
  cases: project?.cases,
  selfContact: project?.selfContact,
  servo: project?.servoCalibrations,
  body: project?.bodyCalibrations,
  units: project?.unitCalibrations,
});
