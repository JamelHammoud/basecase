import type { RecordedFault } from '../sim/faults';
import type { Recording } from '../sim/recorder';
import { framePoses } from '../sim/recorder';
import type { SimModel } from '../sim/mjcfTypes';
import type { Rig, V3 } from '../utils/kinematics';
import { evaluateContract, type Trace } from '../skills/contract';
import { caseFactReader, caseSignalNames, sampleSignals } from './caseFacts';
import { probeReader, type ProbeWorld } from './probes';
import type { EndEffector } from './robotFit';
import { CASE_FORMAT_VERSION, type Case } from './schema';

export interface TryManifest {
  formatVersion: typeof CASE_FORMAT_VERSION;
  caseHash: string;
  modelHash: string;
  seed: number;
  frames: number;
  dt: number;
  faults?: RecordedFault[];
}

export interface TryRecord {
  id: string;
  caseId: string;
  robot: string;
  at: string;
  passed: boolean;
  margin: number;
  seconds: number;
  manifest: TryManifest;
}

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
    sampleSignals(facts.read(poses, i * recording.dt), names, signals);
  }

  return { dt: recording.dt, signals };
}

export const scoreTry = (scoring: TryScoring) => evaluateContract(scoring.kase.task.contract, trySignals(scoring));

export async function tryManifest(kase: Case, model: SimModel, recording: Recording): Promise<TryManifest> {
  return {
    formatVersion: CASE_FORMAT_VERSION,
    caseHash: await sha256(JSON.stringify(kase)),
    modelHash: await sha256(model.xml),
    seed: 0,
    frames: recording.frames,
    dt: recording.dt,
    faults: recording.faults ?? [],
  };
}

export const worstFirst = (tries: TryRecord[]) => [...tries].sort((a, b) => a.margin - b.margin);
