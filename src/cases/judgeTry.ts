import { toMj } from '../sim/mjcfFrames';
import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import type { ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { stageCase, stagedEffectors } from './caseCast';
import type { Case, ProbeEnd } from './schema';
import type { SlotRobot } from './slots';
import { scoreTry } from './tries';
import type { Judged } from './tryLabels';

const TIME_SIGNALS = new Set(['elapsed', 'timer']);

function readsRecording(kase: Case, end: ProbeEnd) {
  if (typeof end === 'string' || !('object' in end)) return true;

  return kase.world.objects.some((o) => o.id === end.object && o.behavior !== 'dynamic');
}

function signalsIn(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) signalsIn(v, out);

    return out;
  }

  if (typeof value !== 'object' || value === null) return out;

  for (const [key, v] of Object.entries(value)) {
    if (key === 'signal' && typeof v === 'string') out.add(v);
    else signalsIn(v, out);
  }

  return out;
}

export function fitsRecorded(kase: Case): boolean {
  const { probes, contract } = kase.task;
  const probed = new Set(probes.map((p) => p.signal));

  if (!probes.length || !probes.every((p) => readsRecording(kase, p.from) && readsRecording(kase, p.to))) return false;

  return [...signalsIn(contract)].every((s) => probed.has(s) || TIME_SIGNALS.has(s));
}

const robotBodies = (model: SimModel) => model.bodies.reduce((n, b, i) => (b.parts.length ? i + 1 : n), 0);

export interface JudgeScene {
  model: SimModel;
  rig: Rig;
  parts: ScenePart[];
  partners: SlotRobot[];
}

export const fittingCases = (cases: Case[], recording: Recording, model: SimModel) =>
  recording.nbody >= robotBodies(model) ? cases.filter(fitsRecorded) : [];

export function paddedRecording(recording: Recording, model: SimModel): Recording {
  const nbody = model.bodies.length;

  if (recording.nbody >= nbody) return recording;

  const poses = new Float32Array(recording.frames * nbody * 7);
  const rest = model.bodies.flatMap((b) => [...toMj(b.origin), 1, 0, 0, 0]);

  for (let f = 0; f < recording.frames; f++) {
    poses.set(rest, f * nbody * 7);
    poses.set(recording.poses.subarray(f * recording.nbody * 7, (f + 1) * recording.nbody * 7), f * nbody * 7);
  }

  return { ...recording, nbody, poses };
}

export async function judgeRecorded(kase: Case, recording: Recording, scene: JudgeScene): Promise<Judged> {
  const staged = stageCase(kase, { rig: scene.rig, parts: scene.parts }, scene.partners);
  const verdict = await scoreTry({
    kase: staged.kase,
    model: scene.model,
    recording: paddedRecording(recording, scene.model),
    rig: scene.rig,
    ...stagedEffectors(staged, { rig: scene.rig, parts: scene.parts }),
  });

  return {
    caseId: kase.id,
    caseName: kase.name,
    verdict: verdict.passed ? 'passed' : 'failed',
    margin: verdict.margin,
  };
}

export async function judgeUnjudged(cases: Case[], recording: Recording, scene: JudgeScene): Promise<Judged | null> {
  const kase = fittingCases(cases, recording, scene.model)[0];

  return kase ? judgeRecorded(kase, recording, scene) : null;
}
