import { correctionEpisode, demoEpisode, type DemoEpisode } from '../datasets/demos';
import type { FrozenTrySample } from '../datasets/snapshotTypes';
import type { SimModel } from '../sim/mjcfTypes';
import type { PolicySpec } from '../sim/policy';
import type { Recording } from '../sim/recorder';
import type { trainingJob } from '../sim/trainingJob';
import { hashOf, isHash, sha256Hex } from './hash';
import { isTrainablePolicy } from './policyCheck';

export type TrainingSample = Pick<FrozenTrySample, 'tryId' | 'from' | 'to' | 'target' | 'split'>;

export interface TriesOptions {
  splits?: Array<'train' | 'validation' | 'test'>;
  samples?: TrainingSample[];
  revision?: string;
}

export interface TeachingProvenance {
  sourcePolicy: string;
  sourceSkill?: string;
  revision: string;
  selections: TrainingSample[];
  mixture: { kind: 'selected-rows-once'; originalRows: number; correctionRows: number };
}

const vectorActor = (policy: PolicySpec) => !policy.squash && !policy.clock && !policy.eyes?.length;

function sourcePolicy(recording: Recording, model: SimModel): PolicySpec {
  const source = recording.teaching;
  const controller = recording.controller;
  const robot = model.robots[0];

  if (!source || controller?.kind !== 'policy' || !isTrainablePolicy(controller.policy))
    throw new Error('Choose a saved Forge policy for these corrections.');

  const policy = controller.policy;
  const matches = {
    joints: policy.joints,
    defaultPose: policy.defaultPose,
    actionScale: policy.actionScale,
    controlDt: policy.controlDt,
  };
  const recorded = {
    joints: source.joints,
    defaultPose: source.defaultPose,
    actionScale: source.actionScale,
    controlDt: source.controlDt,
  };

  if (
    hashOf(policy) !== source.policy ||
    hashOf(matches) !== hashOf(recorded) ||
    source.model !== sha256Hex(model.xml) ||
    source.fingerprint !== robot?.fingerprint ||
    controller.robot !== robot?.key ||
    !vectorActor(policy)
  )
    throw new Error('Choose corrections from the same policy and robot model.');

  return policy;
}

function ordinaryEpisode(recording: Recording, model: SimModel, policy: PolicySpec): DemoEpisode {
  const steps = policy.controlDt / recording.dt;

  if (steps < 1 || Math.abs(steps - Math.round(steps)) > 1e-6)
    throw new Error('Choose a policy with a control period matching these tries.');

  const episode = demoEpisode(recording, model, policy);

  if (episode.actions.some((row) => row.some((action) => Math.abs(action) > 1 + 1e-6)))
    throw new Error('Keep corrections within the source policy’s action range.');

  return episode;
}

export function teachingJob(input: {
  model: SimModel;
  recordings: Recording[];
  options: TriesOptions;
  base: ReturnType<typeof trainingJob>;
}) {
  const { model, recordings, options, base } = input;
  const samples = options.samples;
  const first = samples?.findIndex((sample) => sample.target === 'correction') ?? -1;

  if (!samples || first < 0 || samples.length !== recordings.length || !isHash(options.revision))
    throw new Error('Freeze the selected corrections before training.');

  const policy = sourcePolicy(recordings[first], model);
  const identity = hashOf(policy);
  const episodes = recordings.map((recording, index) => {
    const sample = samples[index];

    if (sample.target !== 'correction') return { ...ordinaryEpisode(recording, model, policy), split: sample.split };

    if (hashOf(sourcePolicy(recording, model)) !== identity)
      throw new Error('Choose corrections from the same policy and robot model.');

    return { ...correctionEpisode(recording, model, sample), split: sample.split };
  });
  const originalRows = episodes.reduce(
    (count, episode, i) => count + (!samples[i].target && samples[i].split === 'train' ? episode.actions.length : 0),
    0,
  );
  const correctionRows = episodes.reduce(
    (count, episode, i) => count + (samples[i].target && samples[i].split === 'train' ? episode.actions.length : 0),
    0,
  );

  if (!originalRows || !correctionRows) throw new Error('Select original tries and correction windows.');

  const provenance: TeachingProvenance = {
    sourcePolicy: identity,
    ...(recordings[first].teaching?.skill ? { sourceSkill: recordings[first].teaching.skill } : {}),
    revision: options.revision,
    selections: samples.map(({ tryId, from, to, target, split }) => ({
      tryId,
      from,
      to,
      ...(target ? { target } : {}),
      split,
    })),
    mixture: { kind: 'selected-rows-once', originalRows, correctionRows },
  };
  const ctrlDefault = [...base.ctrlDefault];

  model.joints
    .filter((joint) => joint.actuator >= 0)
    .forEach((joint, i) => (ctrlDefault[joint.actuator] = policy.defaultPose[i]));

  return {
    ...base,
    algo: 'bc',
    defaultPose: policy.defaultPose,
    ctrlDefault,
    actionScale: policy.actionScale,
    controlDt: policy.controlDt,
    command: recordings[first].teaching!.command,
    warmPolicy: policy,
    demos: { episodes },
    teaching: provenance,
  };
}

export function teachingProvenance(job: Record<string, unknown>): TeachingProvenance | undefined {
  const value = job.teaching as TeachingProvenance | undefined;

  if (!value || !isHash(value.sourcePolicy) || !isHash(value.revision) || !Array.isArray(value.selections)) return;

  return structuredClone(value);
}
