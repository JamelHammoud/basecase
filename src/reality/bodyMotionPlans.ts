import type { BodyAnalysisRequest } from './bodyAnalysisTypes';
import { BODY_MOTION_LIMITS as LIMITS, type BodyMotionPlan } from './bodyMotionTypes';
import type { SimJoint } from '../sim/mjcfTypes';

const shapes = ['hold', 'ramp', 'oscillation'] as const;
const unitScale = (joint: SimJoint) => (joint.type === 'revolute' ? Math.PI / 180 : 0.001);
const speedLimit = (joint: SimJoint) => (joint.type === 'revolute' ? LIMITS.speedRadS : LIMITS.speedMS);

function validJoint(joint: SimJoint | undefined, start: number | null): joint is SimJoint {
  return (
    !!joint &&
    joint.drive === 'position' &&
    Number.isInteger(joint.actuator) &&
    joint.actuator >= 0 &&
    Number.isFinite(joint.effort) &&
    joint.effort > 0 &&
    joint.effort <= LIMITS.effort &&
    start !== null &&
    Number.isFinite(start) &&
    !!joint.range &&
    joint.range.every(Number.isFinite) &&
    joint.range[0] < joint.range[1] &&
    start >= joint.range[0] * unitScale(joint) &&
    start <= joint.range[1] * unitScale(joint)
  );
}

function offset(shape: BodyMotionPlan['shape'], phase: number): number {
  if (shape === 'hold') return Math.min(phase * 4, 1);

  if (shape === 'ramp') return phase <= 0.5 ? phase * 2 : 2 - phase * 2;

  return Math.sin(2 * Math.PI * phase);
}

function makePlan(request: BodyAnalysisRequest, index: number, shape: BodyMotionPlan['shape']): BodyMotionPlan {
  const joint = request.model.joints.find((entry) => entry.id === request.run.joints[index])!;
  const start = request.run.statuses[0].positions as number[];
  const range = joint.range!.map((value) => value * unitScale(joint));
  const positive = range[1] - start[index];
  const negative = start[index] - range[0];
  const headroom = shape === 'oscillation' ? Math.min(positive, negative) : Math.max(positive, negative);
  const slope = shape === 'oscillation' ? 2 * Math.PI : 4;
  const magnitude = Math.min(headroom, (speedLimit(joint) * LIMITS.seconds) / slope);
  const amplitude = magnitude * (positive >= negative || shape === 'oscillation' ? 1 : -1);
  const intents = Array.from({ length: LIMITS.frames }, (_, frame) => ({
    at: (frame * LIMITS.seconds * 1000) / (LIMITS.frames - 1),
    joints: start.map(
      (value, mapped) => value + (mapped === index ? amplitude * offset(shape, frame / (LIMITS.frames - 1)) : 0),
    ),
  }));
  const travel = intents
    .slice(1)
    .reduce((sum, intent, frame) => sum + Math.abs(intent.joints[index] - intents[frame].joints[index]), 0);

  return {
    id: `${joint.id}:${shape}`,
    joint: joint.id,
    shape,
    seconds: LIMITS.seconds,
    workBoundJ: travel * joint.effort,
    run: {
      ...request.run,
      intents,
      statuses: intents.map((intent) => ({ at: intent.at, positions: [...start] })),
      faultJoint: null,
      faultAt: 0,
      message: '',
    },
  };
}

export function bodyMotionPlans(request: BodyAnalysisRequest): BodyMotionPlan[] {
  const starts = request.run.statuses[0]?.positions;
  const joints = request.run.joints.map((id) => request.model.joints.find((entry) => entry.id === id));
  const valid =
    !!starts &&
    starts.length === joints.length &&
    joints.length > 0 &&
    joints.length <= 16 &&
    new Set(request.run.joints).size === joints.length &&
    new Set(joints.map((joint) => joint?.actuator)).size === joints.length &&
    joints.every((joint) => joint && joint.actuator < request.model.joints.length) &&
    joints.every((joint, index) => validJoint(joint, starts[index]));

  if (!valid) return [];

  return shapes
    .flatMap((_, pass) => joints.map((_, index) => makePlan(request, index, shapes[(pass + index) % shapes.length])))
    .filter((plan) => !bodyMotionPlanProblem(request, plan))
    .slice(0, LIMITS.candidates);
}

function jointWork(input: { joint: SimJoint; start: number; plan: BodyMotionPlan; index: number }): number {
  const { joint, start, plan, index } = input;
  let previous = start;
  let work = 0;

  for (let frame = 0; frame < plan.run.intents.length; frame++) {
    const intent = plan.run.intents[frame];
    const value = intent.joints[index];
    const dt = frame > 0 ? (intent.at - plan.run.intents[frame - 1].at) / 1000 : 1;
    const distance = Math.abs(value - previous);
    const inside = value >= joint.range![0] * unitScale(joint) && value <= joint.range![1] * unitScale(joint);

    if (!Number.isFinite(value) || !inside || dt <= 0 || distance / dt > speedLimit(joint) + 1e-10) return NaN;

    if (frame === 0 && value !== start) return NaN;

    work += distance * joint.effort;
    previous = value;
  }

  return work;
}

function commandProblem(request: BodyAnalysisRequest, plan: BodyMotionPlan): boolean {
  let work = 0;

  for (let index = 0; index < plan.run.joints.length; index++) {
    const joint = request.model.joints.find((entry) => entry.id === plan.run.joints[index]);
    const start = request.run.statuses[0]?.positions[index];

    if (!validJoint(joint, start ?? null)) return true;

    work += jointWork({ joint, start: start!, plan, index });
  }

  return !Number.isFinite(work) || work > LIMITS.workJ || Math.abs(work - plan.workBoundJ) > 1e-8;
}

function validPlanIdentity(plan: BodyMotionPlan): boolean {
  return (
    typeof plan.joint === 'string' &&
    plan.run.joints.includes(plan.joint) &&
    plan.id === `${plan.joint}:${plan.shape}` &&
    shapes.includes(plan.shape)
  );
}

export function bodyMotionPlanProblem(request: BodyAnalysisRequest, plan: BodyMotionPlan): 'unsupported' | null {
  const { run } = plan;
  const valid =
    validPlanIdentity(plan) &&
    plan.seconds > 0 &&
    plan.seconds <= LIMITS.seconds &&
    run.joints.join('\0') === request.run.joints.join('\0') &&
    run.intents.length >= 2 &&
    run.intents.length <= LIMITS.frames &&
    run.statuses.length === run.intents.length &&
    run.intents[0].at === 0 &&
    run.intents.at(-1)!.at === plan.seconds * 1000 &&
    run.intents.every((intent) => Number.isFinite(intent.at) && intent.joints.length === run.joints.length) &&
    run.statuses.every(
      (status, index) =>
        status.at === run.intents[index].at &&
        status.positions.length === run.joints.length &&
        status.positions.every((value, joint) => value === request.run.statuses[0].positions[joint]),
    );

  return valid && !commandProblem(request, plan) ? null : 'unsupported';
}
