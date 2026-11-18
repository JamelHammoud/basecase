import { matchesImageGroup } from '../conditions';
import type { TrainingEvaluation } from './types';
import type { RequirementMeasurement, RequirementOutcome, TrainingRequirement } from './requirementTypes';
import { sampleKey } from './evaluationIdentity';

export function validateRequirementEvidence(report: TrainingEvaluation) {
  if (
    report.requirementEvidenceFailure !== undefined &&
    (report.requirementEvidenceFailure !== 'resources' || report.evidence || !report.task.requirements?.length)
  )
    throw new Error('The saved requirement evidence changed.');

  const measurements = report.evidence?.requirements;

  if (measurements === undefined) return;

  const requirements = report.task.requirements ?? [];

  if (
    !Array.isArray(measurements) ||
    measurements.length !== requirements.length ||
    !measurements.every((row, index) => validMeasurement(row, requirements[index], report))
  )
    throw new Error('The saved requirement evidence changed.');
}

function validMeasurement(row: RequirementMeasurement, requirement: TrainingRequirement, report: TrainingEvaluation) {
  if (!row || JSON.stringify(row.requirement) !== JSON.stringify(requirement)) return false;

  const real = new Map(report.realTest.map((sample, index) => [sampleKey(sample), index]));
  const keys = report.snapshot
    .filter((sample) => real.has(sampleKey(sample)) && matchesImageGroup(sample, requirement.group))
    .map(sampleKey)
    .sort();
  const indices = keys.map((key) => real.get(key)!).sort((a, b) => a - b);
  const selected = new Set(keys);
  const frames = report.evidence!.frames.filter((frame) => selected.has(sampleKey(frame.sample)));
  const support = frames.filter(
    (frame) =>
      requirement.classId === undefined ||
      frame.classes.some((category) => category.classId === requirement.classId && category.support > 0),
  ).length;

  return (
    JSON.stringify(row.indices) === JSON.stringify(indices) &&
    row.support === support &&
    (row.score === null || (Number.isFinite(row.score) && row.score >= 0 && row.score <= 1)) &&
    ['measured', 'missing-group', 'insufficient-support', 'resources', 'unavailable'].includes(row.reason) &&
    (row.reason !== 'measured' || row.support >= requirement.minRealTest)
  );
}

function outcomeValues(input: {
  requirement: TrainingRequirement;
  candidate?: RequirementMeasurement;
  incumbent?: RequirementMeasurement;
}) {
  return {
    requirement: input.requirement,
    candidate: input.candidate?.score ?? null,
    incumbent: input.incumbent?.score ?? null,
    support: input.candidate?.support ?? 0,
  };
}

function outcome(input: {
  requirement: TrainingRequirement;
  candidate?: RequirementMeasurement;
  incumbent?: RequirementMeasurement;
}): RequirementOutcome {
  const { requirement, candidate, incumbent } = input;
  const base = outcomeValues(input);

  if (!candidate || !incumbent) return { ...base, reason: 'unavailable' };

  if (JSON.stringify(candidate.indices) !== JSON.stringify(incumbent.indices))
    return { ...base, reason: 'unavailable' };

  if (candidate.reason !== 'measured') return { ...base, reason: candidate.reason };

  if (incumbent.reason !== 'measured') return { ...base, reason: incumbent.reason };

  if (candidate.score === null || incumbent.score === null) return { ...base, reason: 'unavailable' };

  if (candidate.score < requirement.minScore) return { ...base, reason: 'floor' };

  if (incumbent.score - candidate.score > requirement.maxRegression + 1e-12) return { ...base, reason: 'regression' };

  return { ...base, reason: 'passed' };
}

export function requirementOutcomes(candidate: TrainingEvaluation, incumbent?: TrainingEvaluation) {
  return (candidate.task.requirements ?? []).map((requirement, index) => {
    const result = outcome({
      requirement,
      candidate:
        candidate.evidence?.groupsHash && candidate.evidence.groupsHash === incumbent?.evidence?.groupsHash
          ? candidate.evidence?.requirements?.[index]
          : undefined,
      incumbent: incumbent?.evidence?.requirements?.[index],
    });
    const failure = candidate.requirementEvidenceFailure ?? incumbent?.requirementEvidenceFailure;

    return failure ? { ...result, reason: failure } : result;
  });
}
