import type { BodyEvidenceSnapshot, BodyEvidenceRef } from './bodyEvidence';
import type { BodyAnalysisDirection } from './bodyAnalysisTypes';
import type { BodySequenceEvidence } from './bodyExperimentTypes';
import { BODY_SEQUENCE_LIMITS, BODY_SEQUENCE_METHOD, type BodySequence } from './bodySequenceTypes';
import { bodyMotionPlanProblem } from './bodyMotionPlans';
import { canonicalJson } from '../skills/hash';

function directionsFit(directions: BodyAnalysisDirection[], size: number) {
  return (
    Array.isArray(directions) &&
    directions.length === size &&
    directions.every(
      (direction) =>
        Array.isArray(direction.weights) &&
        direction.weights.length === size &&
        direction.weights.every(Number.isFinite) &&
        Number.isFinite(direction.response) &&
        direction.response >= 0 &&
        typeof direction.distinguishable === 'boolean',
    )
  );
}

function originMatches(snapshot: BodyEvidenceSnapshot, evidence: BodySequenceEvidence) {
  const { source, state } = evidence;

  return (
    !!source &&
    canonicalJson(state.method) === canonicalJson(BODY_SEQUENCE_METHOD) &&
    canonicalJson(state.original) === canonicalJson(snapshot.result) &&
    /^[a-f0-9]{64}$/.test(state.source) &&
    source.recording === snapshot.request.source.recording &&
    source.unit === snapshot.request.source.unit &&
    source.scene === snapshot.request.source.scene &&
    source.sourceKey === snapshot.sourceKey &&
    source.modelHash === snapshot.request.source.modelHash &&
    /^[a-f0-9]{64}$/.test(source.content)
  );
}

function budgetFits(evidence: BodySequenceEvidence) {
  const { state, retainedBytes } = evidence;
  const { limits } = state;

  return (
    Object.entries(BODY_SEQUENCE_LIMITS).every(([key, maximum]) => {
      const value = limits[key as keyof typeof limits];

      return Number.isInteger(value) && value > 0 && value <= maximum;
    }) &&
    Number.isInteger(state.spent?.physicsSteps) &&
    state.spent.physicsSteps >= 0 &&
    state.spent.physicsSteps <= limits.physicsSteps &&
    Number.isFinite(state.spent.seconds) &&
    state.spent.seconds >= 0 &&
    state.spent.seconds <= limits.seconds &&
    Number.isInteger(retainedBytes) &&
    retainedBytes >= 0 &&
    retainedBytes <= limits.retainedBytes
  );
}

function recordingsFit(source: BodyEvidenceRef, recordings: BodyEvidenceRef[], maximum: number) {
  return (
    Array.isArray(recordings) &&
    recordings.length <= maximum &&
    new Set(recordings.map((ref) => ref.recording)).size === recordings.length &&
    recordings.every(
      (ref) =>
        ref.generated === true &&
        ref.unit === source.unit &&
        ref.scene === source.scene &&
        ref.sourceKey === source.sourceKey &&
        ref.modelHash === source.modelHash &&
        /^[a-f0-9]{64}$/.test(ref.content) &&
        /^[a-f0-9]{64}$/.test(ref.sessionHash ?? '') &&
        ref.joints.join('\0') === source.joints.join('\0'),
    )
  );
}

function roundsFit(snapshot: BodyEvidenceSnapshot, state: BodySequence, size: number) {
  return (
    Array.isArray(state.rounds) &&
    state.rounds.length <= state.limits.rounds &&
    state.rounds.every(
      (round) =>
        !bodyMotionPlanProblem(snapshot.request, round.plan) &&
        directionsFit(round.directions, size) &&
        Array.isArray(round.initialState) &&
        round.initialState.length <= 4096 &&
        round.initialState.every(Number.isFinite) &&
        canonicalJson(round.analysis.source) === canonicalJson(snapshot.request.source) &&
        round.run.joints.join('\0') === snapshot.request.run.joints.join('\0') &&
        canonicalJson(round.run.intents) === canonicalJson(round.plan.run.intents) &&
        round.run.statuses.length === round.plan.run.statuses.length &&
        round.run.statuses.every(
          (status, index) =>
            status.at === round.plan.run.statuses[index].at &&
            status.positions.length === snapshot.request.units.length &&
            status.positions.every(Number.isFinite),
        ),
    )
  );
}

export function safeBodySequence(snapshot: BodyEvidenceSnapshot): boolean {
  const evidence = snapshot.sequence;

  if (evidence === undefined) return true;

  const { state, source, recordings } = evidence;
  const size = snapshot.result?.parameters.length ?? 0;

  if (!state?.limits || size < 1) return false;

  return (
    originMatches(snapshot, evidence) &&
    budgetFits(evidence) &&
    Array.isArray(state.selected) &&
    new Set(state.selected).size === state.selected.length &&
    state.selected.every((index) => Number.isInteger(index) && index >= 0 && index < size) &&
    directionsFit(state.directions, size) &&
    roundsFit(snapshot, state, size) &&
    recordingsFit(source, recordings, state.limits.rounds + 1)
  );
}
