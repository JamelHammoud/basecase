import { physicalParts } from '../appearance/physical';
import { loadDatasetContent, saveDatasetContent } from '../datasets/datasetStore/content';
import { encodeJson, decodeJson } from '../datasets/snapshotWorker';
import { datasetContentHash } from '../datasets/contentHash';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { BodyAnalysisRefusal, BodyAnalysisRequest, BodyAnalysisResult } from './bodyAnalysisTypes';
import type { BodyExperimentEvidence } from './bodyExperimentTypes';
import { checkedMotionRecording } from '../../electron/robot/bodyMotionRecording.mjs';
import type { BodyMotionOutcome } from './bodyMotionTypes';
import { safeBodyMotion } from './bodyMotionEvidence';
import { bodySourceProject, validBodySourceVersion, type BodySourceVersion } from './bodySource';

export const BODY_EVIDENCE_BYTES = 8_388_608;
export const BODY_EVIDENCE_COUNT = 32;

export interface BodyEvidenceSnapshot {
  sourceVersion?: BodySourceVersion;
  experiment?: BodyExperimentEvidence;
  refusal?: BodyAnalysisRefusal;
  request: BodyAnalysisRequest;
  sourceKey: string;
  calibration: unknown;
  result?: BodyAnalysisResult;
  sessionHash?: string;
  motion?: BodyMotionOutcome;
}

export interface BodyEvidenceRef {
  sourceVersion?: BodySourceVersion;
  content: string;
  joints: string[];
  sessionHash?: string;
  modelHash: string;
  recording: string;
  unit: string;
  scene: string;
  sourceKey: string;
  analyzed: boolean;
}

export interface BodyEvidencePorts {
  encode: (value: unknown) => Promise<Uint8Array>;
  decode: (bytes: Uint8Array) => Promise<unknown>;
  save: (bytes: Uint8Array) => Promise<string>;
  load: (hash: string) => Promise<Uint8Array | null>;
}

const defaults: BodyEvidencePorts = {
  encode: encodeJson,
  decode: decodeJson,
  save: saveDatasetContent,
  load: loadDatasetContent,
};

export async function bodySourceKey(
  parts: ScenePart[],
  project: ProjectSettings,
  version?: BodySourceVersion,
): Promise<string> {
  const source = bodySourceProject(project, version);
  const bytes = await encodeJson({ parts: physicalParts(parts), project: source });

  if (bytes.byteLength > BODY_EVIDENCE_BYTES) throw new Error('Body analysis source exceeds its storage limit.');

  return datasetContentHash(bytes);
}

export async function rememberBodyEvidence(input: BodyEvidenceSnapshot, ports = defaults): Promise<BodyEvidenceRef> {
  const bytes = await ports.encode(input);

  if (bytes.byteLength > BODY_EVIDENCE_BYTES) throw new Error('Body analysis evidence exceeds its storage limit.');

  const content = await ports.save(bytes);

  return bodyReference(input, content);
}

function bodyReference(input: BodyEvidenceSnapshot, content: string): BodyEvidenceRef {
  const { source } = input.request;

  return {
    ...(input.sourceVersion ? { sourceVersion: input.sourceVersion } : {}),
    content,
    joints: [...input.request.run.joints],
    sessionHash: input.sessionHash,
    modelHash: source.modelHash,
    recording: source.recording,
    unit: source.unit,
    scene: source.scene,
    sourceKey: input.sourceKey,
    analyzed: !!input.result,
  };
}

export async function readBodyEvidenceContent(content: string, ports = defaults) {
  if (!/^[0-9a-f]{64}$/.test(content)) return null;

  try {
    const bytes = await ports.load(content);

    if (!bytes || bytes.byteLength > BODY_EVIDENCE_BYTES) return null;

    const snapshot = (await ports.decode(bytes)) as BodyEvidenceSnapshot;
    const reference = bodyReference(snapshot, content);

    return matchesBodyReference(snapshot, reference) ? { snapshot, reference } : null;
  } catch {
    return null;
  }
}

export async function readBodyEvidence(ref: BodyEvidenceRef, ports = defaults): Promise<BodyEvidenceSnapshot | null> {
  const bytes = await ports.load(ref.content);

  if (!bytes || bytes.byteLength > BODY_EVIDENCE_BYTES) return null;

  try {
    const value = (await ports.decode(bytes)) as BodyEvidenceSnapshot | null;

    return matchesBodyReference(value, ref) ? value : null;
  } catch {
    return null;
  }
}

function matchesBodyReference(value: BodyEvidenceSnapshot | null, ref: BodyEvidenceRef): boolean {
  if (!value?.request?.source) return false;

  const { source, run } = value.request;

  return (
    matchingSourceVersion(value, ref) &&
    source.recording === ref.recording &&
    source.unit === ref.unit &&
    source.scene === ref.scene &&
    source.modelHash === ref.modelHash &&
    value.sessionHash === ref.sessionHash &&
    Array.isArray(run?.joints) &&
    Array.isArray(ref.joints) &&
    run.joints.join('\0') === ref.joints.join('\0') &&
    value.sourceKey === ref.sourceKey &&
    safeBodyEvidenceResults(value)
  );
}

const matchingSourceVersion = (value: BodyEvidenceSnapshot, ref: BodyEvidenceRef) =>
  validBodySourceVersion(value.sourceVersion) &&
  validBodySourceVersion(ref.sourceVersion) &&
  (value.sourceVersion ?? 1) === (ref.sourceVersion ?? 1);

function safeBodyEvidenceResults(value: BodyEvidenceSnapshot): boolean {
  return safeBodyResult(value.result, value.request.source) && safeExperiment(value) && safeBodyMotion(value);
}

function safeExperiment(value: BodyEvidenceSnapshot): boolean {
  if (value.experiment === undefined) return value.refusal === undefined;

  const { recommendation, recording } = value.experiment;

  return (
    !!checkedMotionRecording(recording) &&
    recording.recommendation === recommendation?.content &&
    recording.sourceKey === recommendation.sourceKey &&
    recommendation.unit === value.request.source.unit &&
    recommendation.scene === value.request.source.scene &&
    recommendation.modelHash === value.request.source.modelHash &&
    recommendation.joints.join('\0') === value.request.run.joints.join('\0') &&
    value.request.observations === recording.backend &&
    (value.refusal === undefined || value.refusal === 'backend')
  );
}

export function evidenceApplicable(
  ref: BodyEvidenceRef,
  current: { unit: string; scene: string; sourceKey: string },
): boolean {
  return ref.unit === current.unit && ref.scene === current.scene && ref.sourceKey === current.sourceKey;
}

export function withBodyEvidence(project: ProjectSettings, ref: BodyEvidenceRef): ProjectSettings {
  const previous = project.bodyEvidence ?? [];

  if (
    previous.length >= BODY_EVIDENCE_COUNT &&
    !previous.some((entry) => entry.recording === ref.recording && entry.unit === ref.unit)
  )
    return project;

  const kept = previous.filter((entry) => entry.recording !== ref.recording || entry.unit !== ref.unit);

  return { ...project, bodyEvidence: [...kept, ref].slice(-BODY_EVIDENCE_COUNT) };
}

export type BodyProjectUpdate = (change: (project: ProjectSettings) => ProjectSettings) => void;

function finitePair(value: number[]): boolean {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
}

function safeBodyResult(result: BodyAnalysisResult | undefined, source: BodyAnalysisRequest['source']): boolean {
  if (result === undefined) return true;

  return validBodyResult(result, source);
}

function validBodyResult(result: BodyAnalysisResult, source: BodyAnalysisRequest['source']): boolean {
  if (!result || result.kind !== 'analyzed' || result.method?.version !== 'body-sensitivity-1') return false;

  return (
    sameBodySource(result.source, source) &&
    Array.isArray(result.parameters) &&
    result.parameters.length <= 24 &&
    result.parameters.every(
      (parameter) =>
        parameter &&
        typeof parameter.body === 'string' &&
        typeof parameter.label === 'string' &&
        ['massScales', 'payloadKg', 'floorFrictionScale'].includes(parameter.kind) &&
        ['distinguishable', 'coupled', 'poor-excitation'].includes(parameter.distinguishability) &&
        finitePair(parameter.probe) &&
        finitePair(parameter.bounds) &&
        Number.isFinite(parameter.scale),
    ) &&
    Array.isArray(result.directions) &&
    result.directions.length <= 24 &&
    result.directions.every(
      (direction) =>
        direction &&
        Array.isArray(direction.weights) &&
        direction.weights.length === result.parameters.length &&
        direction.weights.every(Number.isFinite) &&
        Number.isFinite(direction.response),
    ) &&
    finitePair(result.interval) &&
    Number.isFinite(result.residual?.rmsNoise) &&
    Number.isFinite(result.residual.outsideSupportedDirections)
  );
}

function sameBodySource(left: BodyAnalysisRequest['source'], right: BodyAnalysisRequest['source']): boolean {
  return (
    !!left &&
    left.recording === right.recording &&
    left.unit === right.unit &&
    left.scene === right.scene &&
    left.modelHash === right.modelHash &&
    left.modelFingerprint === right.modelFingerprint &&
    left.calibrationFingerprint === right.calibrationFingerprint
  );
}
