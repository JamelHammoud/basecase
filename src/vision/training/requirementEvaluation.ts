import { matchesImageGroup } from '../conditions';
import type { FrozenImageSample } from '../../datasets/snapshotImages';
import { sampleKey } from './evaluationIdentity';
import { scoreTrainingRows } from './metrics';
import type { EvaluatedFrame } from './metricsObjects';
import type { TrainingTask } from './types';
import type { RequirementMeasurement, TrainingRequirement } from './requirementTypes';

function exists(snapshot: FrozenImageSample[], requirement: TrainingRequirement) {
  return snapshot.some((sample) =>
    requirement.group.kind === 'camera'
      ? sample.groups?.camera === requirement.group.name
      : sample.groups?.declared.includes(requirement.group.name),
  );
}

function boundedGroupScore(
  task: TrainingTask,
  rows: EvaluatedFrame[],
  work: { pixels: number; pairs: number; objects: number },
) {
  for (const { frame, result } of rows) {
    work.objects += frame.annotations.length;

    const comparisons =
      task.kind === 'segment' ? frame.annotations.length * result.detections.length : frame.annotations.length;

    work.pixels += frame.width * frame.height * (1 + comparisons);
    work.pixels += result.detections.reduce((sum, detection) => sum + (detection.mask?.values.length ?? 0), 0);
    work.pairs += frame.annotations.length * result.detections.length;
  }

  if (work.pixels > 32_000_000 || work.pairs > 2_000_000 || work.objects > 40_000) return null;

  return scoreTrainingRows(rows, task);
}

export function requirementMeasurements(input: {
  task: TrainingTask;
  snapshot: FrozenImageSample[];
  realTest: FrozenImageSample[];
  rows: EvaluatedFrame[];
}): RequirementMeasurement[] {
  const samples = new Map(input.snapshot.map((sample) => [sampleKey(sample), sample]));
  const work = { pixels: 0, pairs: 0, objects: 0 };
  const groups = new Map<string, ReturnType<typeof scoreTrainingRows> | null>();

  return (input.task.requirements ?? []).map((requirement) => {
    const indices = input.realTest.flatMap((sample, index) =>
      matchesImageGroup(samples.get(sampleKey(sample))!, requirement.group) ? [index] : [],
    );
    const rows = indices.map((index) => input.rows[index]);
    const support = rows.filter(
      ({ frame }) =>
        requirement.classId === undefined ||
        frame.annotations.some((annotation) => annotation.classId === requirement.classId),
    ).length;
    const base = { requirement, indices, support, score: null };

    if (!exists(input.snapshot, requirement)) return { ...base, reason: 'missing-group' };

    const group = JSON.stringify(requirement.group);

    if (!groups.has(group)) groups.set(group, boundedGroupScore(input.task, rows, work));

    const scores = groups.get(group);

    if (!scores) return { ...base, reason: 'resources' };

    const score =
      requirement.classId === undefined
        ? scores.primary
        : (scores.perClass.find((category) => category.classId === requirement.classId)?.score ?? null);
    const reason = support < requirement.minRealTest ? 'insufficient-support' : 'measured';

    return { ...base, score, reason };
  });
}
