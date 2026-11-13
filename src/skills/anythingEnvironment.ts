import type { SimModel } from '../sim/mjcfTypes';
import { policyObservation, type ActionSpec, type Environment, type ObservationTerm } from './environment';
import { KIT_ACTION_SCALE, offsetPose } from './kitModel';
import type { BodyFacts } from './anythingBody';
import type { LoweredContract } from './anythingSignals';
import type { TaskSpec } from './anythingTypes';

const ARM_ACTION_SCALE = 0.25;
const CONTROL_DT = 0.02;
const TRACE_DT = 0.02;

export interface Interface {
  observation: ObservationTerm[];
  action: ActionSpec;
}

export function bodyInterface(facts: BodyFacts): Interface {
  const position = facts.joints.filter((j) => j.actuated && j.drive === 'position').map((j) => j.id);
  const velocity = facts.joints.filter((j) => j.actuated && j.drive === 'velocity').map((j) => j.id);
  const joints = position.length ? position : velocity;
  const scale = facts.floating ? KIT_ACTION_SCALE : ARM_ACTION_SCALE;

  return {
    observation: policyObservation(joints),
    action: {
      kind: position.length ? 'position-offset' : 'velocity',
      joints,
      scale: position.length ? scale : 1,
      controlDt: CONTROL_DT,
    },
  };
}

export function taskEnvironment(options: {
  model: SimModel;
  facts: BodyFacts;
  spec: TaskSpec;
  lowered: LoweredContract;
  face?: Interface;
}): Environment {
  const { model, facts, spec, lowered } = options;
  const face = options.face ?? bodyInterface(facts);
  const pose = spec.startOffsetDeg ? offsetPose(model, spec.startOffsetDeg) : undefined;

  return {
    version: 1,
    robot: facts.robot,
    horizonS: spec.seconds,
    traceDt: TRACE_DT,
    observation: face.observation,
    action: face.action,
    reset: { ...(pose ? { pose } : {}), jointNoiseDeg: 1, baseYawDeg: 0, baseOffsetMm: 0 },
    randomization: { friction: [0.8, 1.2], mass: [0.9, 1.1], strength: [0.9, 1], latencyMs: [0, 20] },
    reward: { kind: 'contract-robustness' },
    contract: lowered.contract,
    signals: lowered.signals,
  };
}
