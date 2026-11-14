import type { RecordedFault } from '../sim/faults';
import type { Recording } from '../sim/recorder';
import { framePoses } from '../sim/recorder';
import type { SimJoint, SimModel } from '../sim/mjcfTypes';
import type { Rig, V3 } from '../utils/kinematics';
import { evaluateContract, type Trace } from '../skills/contract';
import { caseFactReader, caseSignalNames, sampleSignals } from './caseFacts';
import { probeReader, type ProbeWorld } from './probes';
import type { EndEffector } from './robotFit';
import type { Case } from './schema';

export const TRY_VERSION = 1;

export type TrySource = 'case' | 'generated' | 'real';

export type TryResult = 'passed' | 'failed' | 'unjudged';

export type TryJoint = Pick<SimJoint, 'id' | 'name' | 'type' | 'actuator' | 'drive' | 'effort'>;

export interface TryRobot {
  name: string;
  modelHash: string;
  joints?: TryJoint[];
}

export interface TryCase {
  id: string;
  name: string;
  hash: string;
  contractHash: string;
}

export interface TryRecord {
  version: typeof TRY_VERSION;
  id: string;
  sceneId: string;
  robot: TryRobot;
  case: TryCase | null;
  source: TrySource;
  input: string | null;
  at: string;
  seconds: number;
  rate: number;
  outcome: { result: TryResult; margin: number };
  seed: number;
  sourceTry: string | null;
  frames: number;
  faults: RecordedFault[];
  commands?: number;
  world?: number;
}

export interface TryRef {
  id: string;
}

export const passedTry = (t: TryRecord) => t.outcome.result === 'passed';

export const isGenerated = (t: TryRecord) => t.source === 'generated';

export const isReal = (t: TryRecord) => t.source === 'real';

export const tryRefs = (tries: Array<{ id: string }>): TryRef[] => tries.map(({ id }) => ({ id }));

export const trySummary = (t: TryRecord): TryRecord => ({
  ...t,
  robot: { name: t.robot.name, modelHash: t.robot.modelHash },
});

export const newestFirst = (tries: TryRecord[]) => [...tries].sort((a, b) => b.at.localeCompare(a.at));

export async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);

  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface TryScoring {
  kase: Case;
  model: SimModel;
  recording: Recording;
  effector: EndEffector | null;
  effectors?: Record<string, EndEffector | null>;
  rig: Rig;
}

export const caseProbeWorld = ({
  kase,
  model,
  effector,
  effectors,
  rig,
}: Omit<TryScoring, 'recording'>): ProbeWorld => ({
  model,
  effector,
  effectors,
  basePart: [...(rig.robots[0]?.parts ?? [])].find((id) => !rig.ownerOf.has(id)) ?? null,
  basePoint: rig.robots[0]?.pivot ?? ([0, 0, 0] as V3),
  objectAt: new Map(kase.world.objects.map((o) => [o.id, o.position])),
});

export const caseProbeReader = (scoring: Omit<TryScoring, 'recording'>) =>
  probeReader(scoring.kase.task.probes, caseProbeWorld(scoring));

export function trySignals({ recording, ...scoring }: TryScoring): Trace {
  const signals: Record<string, number[]> = {};
  const reader = caseProbeReader(scoring);

  const facts = caseFactReader(scoring.kase, scoring.model);
  const names = caseSignalNames(scoring.kase);

  for (let i = 0; i < recording.frames; i++) {
    const poses = framePoses(recording, i);

    reader.sample(poses, signals);
    sampleSignals(facts.read(poses, i * recording.dt, recording.torque?.[i]), names, signals);
  }

  return { dt: recording.dt, signals };
}

export const scoreTry = (scoring: TryScoring) => evaluateContract(scoring.kase.task.contract, trySignals(scoring));

export type JointNames = (id: string) => string | undefined;

export const tryJoints = (model: SimModel, names: JointNames = () => undefined): TryJoint[] =>
  model.joints.map(({ id, name, type, actuator, drive, effort }) => ({
    id,
    name: names(id) ?? name,
    type,
    actuator,
    drive,
    effort,
  }));

export interface NewTry {
  id: string;
  sceneId: string;
  robot: string;
  kase: Case;
  model: SimModel;
  recording: Recording;
  verdict: { passed: boolean; margin: number };
  names?: JointNames;
  source?: TrySource;
}

export async function newTry(options: NewTry): Promise<TryRecord> {
  const { id, sceneId, robot, kase, model, recording, verdict } = options;

  return {
    version: TRY_VERSION,
    id,
    sceneId,
    robot: {
      name: robot,
      modelHash: await sha256(model.xml),
      joints: recording.nq ? tryJoints(model, options.names) : [],
    },
    case: {
      id: kase.id,
      name: kase.name,
      hash: await sha256(JSON.stringify(kase)),
      contractHash: await sha256(JSON.stringify(kase.task.contract)),
    },
    source: options.source ?? 'case',
    input: null,
    at: new Date().toISOString(),
    seconds: recording.frames * recording.dt,
    rate: Math.round(1 / recording.dt),
    outcome: { result: verdict.passed ? 'passed' : 'failed', margin: verdict.margin },
    seed: 0,
    sourceTry: null,
    frames: recording.frames,
    faults: recording.faults ?? [],
    ...(recording.commands && recording.controller ? { commands: recording.commands.length } : {}),
    ...(recording.world?.length ? { world: recording.world.length } : {}),
  };
}

export const multipliable = (t: TryRecord) => passedTry(t) && t.source === 'case' && !!t.commands;

export const simTries = (tries: TryRecord[]) => tries.filter((t) => !isReal(t));

export const generatedFrom = (tries: TryRecord[], source: TryRecord) =>
  tries.filter((t) => isGenerated(t) && t.sourceTry === source.id);

export const withGenerated = (tries: TryRecord[], ids: Iterable<string>) => {
  const gone = new Set(ids);

  return new Set([...gone, ...tries.filter((t) => isGenerated(t) && gone.has(t.sourceTry ?? '')).map((t) => t.id)]);
};

export interface Generated {
  source: TryRecord;
  seed: number;
  margin: number;
  recording: Recording;
}

export function generatedTry({ source, seed, margin, recording }: Generated): TryRecord {
  return {
    ...source,
    id: `${source.id}-${seed}`,
    source: 'generated',
    at: new Date().toISOString(),
    seconds: recording.frames * recording.dt,
    rate: Math.round(1 / recording.dt),
    outcome: { result: 'passed', margin },
    seed,
    sourceTry: source.id,
    frames: recording.frames,
    faults: recording.faults ?? [],
    commands: recording.commands?.length ?? 0,
  };
}

export const worstFirst = (tries: TryRecord[]) => [...tries].sort((a, b) => a.outcome.margin - b.outcome.margin);

export interface MultiplySource {
  record: TryRecord;
  recording: Recording;
}

type OpenSource = (id: string) => Promise<{ record: TryRecord; recording: Recording | null } | null>;

export async function multiplySource(listed: TryRecord, modelXml: string, open: OpenSource) {
  if ((await sha256(modelXml)) !== listed.robot.modelHash) return null;

  const opened = await open(listed.id);

  return opened?.recording?.commands ? { record: opened.record, recording: opened.recording } : null;
}
