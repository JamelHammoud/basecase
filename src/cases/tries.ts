import type { Recording } from '../sim/recorder';
import { framePoses } from '../sim/recorder';
import type { SimModel } from '../sim/mjcfTypes';
import type { Rig, V3 } from '../utils/kinematics';
import { evaluateContract } from '../skills/contract';
import { probeReader } from './probes';
import type { EndEffector } from './robotFit';
import { CASE_FORMAT_VERSION, type Case } from './schema';

export interface TryManifest {
  formatVersion: typeof CASE_FORMAT_VERSION;
  caseHash: string;
  modelHash: string;
  seed: number;
  frames: number;
  dt: number;
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
  rig: Rig;
}

export const caseProbeReader = ({ kase, model, effector, rig }: Omit<TryScoring, 'recording'>) =>
  probeReader(kase.task.probes, {
    model,
    effector,
    basePart: [...(rig.robots[0]?.parts ?? [])].find((id) => !rig.ownerOf.has(id)) ?? null,
    basePoint: rig.robots[0]?.pivot ?? ([0, 0, 0] as V3),
    objectAt: new Map(kase.world.objects.map((o) => [o.id, o.position])),
  });

export async function scoreTry({ recording, ...scoring }: TryScoring) {
  const signals: Record<string, number[]> = {};
  const reader = caseProbeReader(scoring);

  for (let i = 0; i < recording.frames; i++) reader.sample(framePoses(recording, i), signals);

  return evaluateContract(scoring.kase.task.contract, { dt: recording.dt, signals });
}

export async function tryManifest(kase: Case, model: SimModel, recording: Recording): Promise<TryManifest> {
  return {
    formatVersion: CASE_FORMAT_VERSION,
    caseHash: await sha256(JSON.stringify(kase)),
    modelHash: await sha256(model.xml),
    seed: 0,
    frames: recording.frames,
    dt: recording.dt,
  };
}

export const worstFirst = (tries: TryRecord[]) => [...tries].sort((a, b) => a.margin - b.margin);
