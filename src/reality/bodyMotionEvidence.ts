import type { BodyEvidenceSnapshot } from './bodyEvidence';
import {
  BODY_MOTION_LIMITS as LIMITS,
  BODY_MOTION_METHOD,
  type BodyMotionScore,
  type BodyMotionOutcome,
} from './bodyMotionTypes';
import { bodyMotionPlanProblem } from './bodyMotionPlans';
import { safeMotionPreview } from './bodyMotionPreviewValidation';
import { canonicalJson } from '../skills/hash';

function safeScore(score: BodyMotionScore, parameters: number): boolean {
  return (
    !!score &&
    [score.before, score.after, score.gain].every(Number.isFinite) &&
    score.before >= 0 &&
    score.after >= 0 &&
    typeof score.resolved === 'boolean' &&
    Array.isArray(score.directions) &&
    score.directions.length === parameters &&
    score.directions.every(
      (direction) =>
        Array.isArray(direction.weights) &&
        direction.weights.length === parameters &&
        direction.weights.every(Number.isFinite) &&
        Number.isFinite(direction.response) &&
        direction.response >= 0 &&
        typeof direction.distinguishable === 'boolean',
    )
  );
}

function safeDeclaration(snapshot: BodyEvidenceSnapshot): boolean {
  const { motion, request, result } = snapshot;
  const parameters = result!.parameters.length;

  return (
    canonicalJson(motion!.method) === canonicalJson(BODY_MOTION_METHOD) &&
    Number.isInteger(motion!.physicsSteps) &&
    motion!.physicsSteps >= 0 &&
    motion!.physicsSteps <= LIMITS.physicsSteps &&
    Array.isArray(motion!.selected) &&
    motion!.selected.length <= parameters &&
    new Set(motion!.selected).size === motion!.selected.length &&
    motion!.selected.every((index) => Number.isInteger(index) && index >= 0 && index < parameters) &&
    Array.isArray(motion!.candidates) &&
    motion!.candidates.length <= LIMITS.candidates &&
    motion!.candidates.every(
      (candidate) =>
        !!candidate?.plan && !bodyMotionPlanProblem(request, candidate.plan) && safeScore(candidate.score, parameters),
    )
  );
}

function safeRecommendation(
  motion: Extract<BodyMotionOutcome, { kind: 'recommended' }>,
  snapshot: BodyEvidenceSnapshot,
): boolean {
  const { request, result } = snapshot;
  const parameters = result!.parameters.length;

  return (
    safeScore(motion.score, parameters) &&
    motion.score.resolved &&
    canonicalJson(motion.candidates.find((candidate) => candidate.plan.id === motion.plan.id)) ===
      canonicalJson({ plan: motion.plan, score: motion.score }) &&
    safeMotionPreview(motion.preview) &&
    Array.isArray(motion.preview.times) &&
    motion.preview.times.length === motion.plan.run.statuses.length &&
    motion.preview.times.every((time, index) => time === motion.plan.run.statuses[index].at / 1000) &&
    Array.isArray(motion.preview.positions) &&
    motion.preview.positions.length === motion.preview.times.length &&
    motion.preview.positions.every(
      (row) => Array.isArray(row) && row.length === request.run.joints.length && row.every(Number.isFinite),
    )
  );
}

export function safeBodyMotion(snapshot: BodyEvidenceSnapshot): boolean {
  const { motion, result } = snapshot;

  if (motion === undefined) return true;

  if (!motion || !result || !safeDeclaration(snapshot)) return false;

  if (motion.kind === 'no-improvement') return true;

  return motion.kind === 'recommended' && safeRecommendation(motion, snapshot);
}
