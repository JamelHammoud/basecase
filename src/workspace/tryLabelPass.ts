import { stageCase, stagedEffectors } from '../cases/caseCast';
import type { Case } from '../cases/schema';
import { segmentInputOf, type SegmentSource } from '../cases/segmentInput';
import type { SlotRobot } from '../cases/slots';
import { sha256, trySignals, type TryScoring } from '../cases/tries';
import type { StoredTry } from '../cases/tryFile';
import { fittingCase, judged, recordedOnly } from '../cases/tryJudge';
import { LABEL_LIMITS, labelsOf, readLabels, type TryLabels, type TrySegment } from '../cases/tryLabels';
import { qualityFlags } from '../datasets/qualityFlags';
import { segmentInWorker } from '../datasets/segmentsClient';
import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import type { ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';

export interface LabelContext {
  model: SimModel | null;
  rig: Rig;
  parts: ScenePart[];
  cases: Case[];
  partners: () => SlotRobot[];
}

export type SegmentRequest = SegmentSource;

export interface LabelPassOptions {
  segment?: (request: SegmentRequest) => Promise<TrySegment[]>;
}

const segmentByRule = (request: SegmentRequest) => segmentInWorker(segmentInputOf(request));

const modelHashes = new WeakMap<SimModel, Promise<string>>();

function modelHash(model: SimModel) {
  const known = modelHashes.get(model);

  if (known) return known;

  const hash = sha256(model.xml);

  modelHashes.set(model, hash);

  return hash;
}

export async function fitsModel(stored: StoredTry, recording: Recording, model: SimModel | null) {
  if (!model || recording.nbody !== model.bodies.length) return false;

  if (recording.nq > 0 && recording.jointQpos && recording.jointQpos.length !== model.joints.length) return false;

  return stored.robot.modelHash === (await modelHash(model));
}

function tryCase(stored: StoredTry, context: LabelContext): Case | null {
  const own = context.cases.find((c) => c.id === stored.case?.id);

  if (own || stored.outcome.verdict !== 'unjudged') return own ?? null;

  return fittingCase(context.cases, context);
}

type Staged = Omit<TryScoring, 'recording' | 'model'>;

interface Pass {
  stored: StoredTry;
  recording: Recording;
  context: LabelContext;
  fits: boolean;
  staged: Staged | null;
}

const RECORDED_ON_HARDWARE = new Set<StoredTry['source']>(['real', 'import', 'operate']);

const kindOf = (stored: StoredTry): SegmentRequest['kind'] =>
  RECORDED_ON_HARDWARE.has(stored.source) ? 'real' : 'sim';

function traceOf({ recording, staged }: Pass, model: SimModel | null) {
  if (!model || !staged) return null;

  try {
    return trySignals({ ...staged, model, recording });
  } catch {
    return null;
  }
}

function requestOf(pass: Pass): SegmentRequest {
  const { stored, recording, context, fits, staged } = pass;
  const model = fits ? context.model : null;
  const { rig, parts } = context;

  return {
    recording,
    model,
    rig,
    parts,
    kase: staged?.kase ?? null,
    kind: kindOf(stored),
    joints: stored.robot.joints,
    trace: traceOf(pass, model),
  };
}

async function ruleLabels(pass: Pass, segment: NonNullable<LabelPassOptions['segment']>): Promise<TryLabels | null> {
  const { stored, recording, context, fits } = pass;
  const flags = qualityFlags({ recording, model: context.model, modelMatches: context.model ? fits : null });
  const segments = await segment(requestOf(pass)).catch(() => null);

  if (!segments) return null;

  const kept = labelsOf(stored);
  const labels = { ...kept, segments: segments.slice(0, LABEL_LIMITS.segments), by: 'rule' as const, flags };

  return readLabels(labels) ?? { ...labels, segments: [] };
}

const unchanged = (before: TryLabels | undefined, after: TryLabels) =>
  !!before && JSON.stringify(before) === JSON.stringify(after);

async function labelled(pass: Pass, options: LabelPassOptions): Promise<StoredTry> {
  if (pass.stored.labels?.segments.length) return pass.stored;

  const labels = await ruleLabels(pass, options.segment ?? segmentByRule);

  return labels && !unchanged(pass.stored.labels, labels) ? { ...pass.stored, labels } : pass.stored;
}

function stagedOf(kase: Case, context: LabelContext): Staged {
  const scene = { rig: context.rig, parts: context.parts };
  const staged = stageCase(kase, scene, context.partners());

  return { kase: staged.kase, rig: context.rig, ...stagedEffectors(staged, scene) };
}

export async function labelPass(
  stored: StoredTry,
  recording: Recording,
  context: LabelContext,
  options: LabelPassOptions = {},
): Promise<StoredTry> {
  const { model } = context;
  const fits = await fitsModel(stored, recording, model);
  const authored = tryCase(stored, context);
  const staged = authored && stagedOf(authored, context);
  const withLabels = await labelled({ stored, recording, context, fits, staged }, options);
  const judgeable =
    fits && model && authored && staged && stored.outcome.verdict === 'unjudged' && recordedOnly(authored);

  if (!judgeable) return withLabels;

  return judged(withLabels, { ...staged, model, recording }).catch(() => withLabels);
}
