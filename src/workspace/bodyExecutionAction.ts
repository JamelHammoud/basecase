import { readBodyEvidence, type BodyEvidenceRef, type BodyEvidenceSnapshot } from '../reality/bodyEvidence';
import { bodyMotionPlanProblem } from '../reality/bodyMotionPlans';
import { bodyRecordingUnchanged } from '../reality/bodyRecordingIdentity';
import type { BodyRecordingContext } from '../reality/bodyRecordingEvidence';
import { playBenchTrajectory, canRunBench } from '../robot/benchRun';
import { trajectoryLimits, trajectoryReady, trajectoryTelemetry } from '../robot/benchTrajectory';
import { robotSnapshot } from '../robot/robotStore';
import type { ConnectSpec } from '../robot/robotState';
import type { RobotState } from '../robot/robotState';
import { servoFamily } from '../robot/robotState';
import { canonicalJson } from '../skills/hash';
import type { JointMount } from '../reality/types';
import { connectionMounts } from '../robot/mountCapture';
import type { BodyMotionOutcome } from '../reality/bodyMotionTypes';

export interface BodyExecutionAction {
  reference: BodyEvidenceRef;
  signal: AbortSignal;
  current: () => boolean;
  prepare: () => Promise<BodyExecutionPrepared>;
}

interface BodyExecutionPrepared {
  context: BodyRecordingContext | null;
  spec: ConnectSpec;
  mounts: JointMount[];
}

function executableRecommendation(
  saved: BodyEvidenceSnapshot | null,
): saved is BodyEvidenceSnapshot & { motion: Extract<BodyMotionOutcome, { kind: 'recommended' }> } {
  return (
    saved?.motion?.kind === 'recommended' &&
    !bodyMotionPlanProblem(saved.request, saved.motion.plan, saved.motion.speedRadS)
  );
}

function requireRunnableUnit(state: RobotState, units: string[]) {
  if (!servoFamily(state.spec) || !state.emulated) throw new Error('This unit can’t run the saved motion.');

  if (units.some((unit) => unit !== 'rad')) throw new Error('Joint units don’t match.');

  if (!canRunBench(state) || !trajectoryTelemetry(state)) throw new Error('Enter Test with current joint readings.');
}

function matchingSource(saved: BodyEvidenceSnapshot, prepared: BodyExecutionPrepared, state: RobotState) {
  const source = prepared.context?.snapshot;

  return (
    !!source &&
    source.sourceKey === saved.sourceKey &&
    canonicalJson({ ...source.request.source, recording: '' }) ===
      canonicalJson({ ...saved.request.source, recording: '' }) &&
    canonicalJson(prepared.spec) === canonicalJson(state.spec) &&
    canonicalJson(prepared.mounts) === canonicalJson(connectionMounts(saved.request.source.unit))
  );
}

export async function executeBodyEvidence(action: BodyExecutionAction) {
  const saved = await readBodyEvidence(action.reference);

  if (!executableRecommendation(saved)) throw new Error('The source changed.');

  if (!(await bodyRecordingUnchanged(action.reference)) || !action.current() || action.signal.aborted) return null;

  const prepared = await action.prepare();
  const state = robotSnapshot(action.reference.unit);

  requireRunnableUnit(state, saved.request.units);

  const trajectory = {
    unit: action.reference.unit,
    joints: saved.motion.plan.run.joints,
    points: saved.motion.plan.run.intents,
    signal: action.signal,
    current: action.current,
    recording: { recommendation: action.reference.content, sourceKey: action.reference.sourceKey },
    context: {
      sceneId: action.reference.scene,
      modelHash: action.reference.modelHash,
      joints: action.reference.joints,
      robot: saved.request.model.robots.map((robot) => robot.name).join(', '),
    },
  };

  if (!action.current() || action.signal.aborted) return null;

  if (!matchingSource(saved, prepared, state)) throw new Error('The source changed.');

  if (!trajectoryLimits(trajectory)) throw new Error('This motion exceeds the unit’s Test limits.');

  if (!trajectoryReady(trajectory, state)) throw new Error('The measured start doesn’t match this motion.');

  return playBenchTrajectory(trajectory);
}
