import type { TrainingEvaluation } from './types';
import type { ImageDiagnostics, PredictionEvidence } from './evidenceTypes';
import { validateEvidence } from './evidence';

export type InspectionFinding = 'all' | 'misses' | 'false-positives' | 'improvements' | 'regressions';
export interface InspectionFilter {
  classId: number | null;
  finding: InspectionFinding;
}
export interface ComparisonImage {
  candidate: PredictionEvidence['frames'][number];
  incumbent: PredictionEvidence['frames'][number];
}

const key = (frame: PredictionEvidence['frames'][number]) => `${frame.sample.frameSetId}:${frame.sample.frameId}`;

export function comparisonImages(candidate: TrainingEvaluation, incumbent: TrainingEvaluation): ComparisonImage[] {
  validateEvidence(candidate);
  validateEvidence(incumbent);

  if (
    !candidate.evidence ||
    !incumbent.evidence ||
    candidate.testHash !== incumbent.testHash ||
    JSON.stringify(candidate.task) !== JSON.stringify(incumbent.task)
  )
    return [];

  const previous = new Map(incumbent.evidence.frames.map((frame) => [key(frame), frame]));

  return candidate.evidence.frames.flatMap((frame) => {
    const other = previous.get(key(frame));

    if (!other || other.sample.hash !== frame.sample.hash || other.sample.content !== frame.sample.content) return [];

    return [{ candidate: frame, incumbent: other }];
  });
}

function failures(rows: ImageDiagnostics[], classId: number | null) {
  return rows
    .filter((row) => classId === null || row.classId === classId)
    .reduce(
      (sum, row) => ({
        misses: sum.misses + row.falseNegative,
        extras: sum.extras + row.falsePositive,
        overlap:
          sum.overlap +
          (row.overlapMatches
            ? row.overlapMatches.reduce(
                (total, value) => total + row.support + row.truePositive + row.falsePositive - 2 * value,
                0,
              )
            : row.falseNegative + row.falsePositive),
        points: sum.points + (row.keypoints ? row.keypoints.visible - row.keypoints.correct : 0),
      }),
      { misses: 0, extras: 0, points: 0, overlap: 0 },
    );
}

export function filterComparisonImages(images: ComparisonImage[], filter: InspectionFilter): ComparisonImage[] {
  return images.filter(({ candidate, incumbent }) => {
    const next = failures(candidate.classes, filter.classId);
    const previous = failures(incumbent.classes, filter.classId);
    const delta = next.overlap + next.points - previous.overlap - previous.points;
    const matches = {
      all: true,
      misses: next.misses > 0 || previous.misses > 0 || next.points > 0 || previous.points > 0,
      'false-positives': next.extras > 0 || previous.extras > 0,
      improvements: delta < 0,
      regressions: delta > 0,
    };
    const relevant =
      filter.classId === null ||
      [...candidate.classes, ...incumbent.classes].some(
        (row) => row.classId === filter.classId && (row.support > 0 || row.falsePositive > 0),
      );

    return relevant && matches[filter.finding];
  });
}
