import type { TrainingMetric } from '../../vision/training/types';
import { TRAINING_METRIC_LABELS, trainingScore } from '../../vision/training/presentation';
import type { ConditionComparison } from './useConditionComparison';
import { Spinner } from '../../design-system';

export function VisionConditionResults({
  comparison,
  metric,
  classId,
}: {
  metric: TrainingMetric;
  classId: number | null;
  comparison: { result?: ConditionComparison; problem?: string } | null;
}) {
  if (!comparison) return <Spinner />;

  if (comparison.problem) return <p role="status">{comparison.problem}</p>;

  const result = comparison.result;

  if (!result) return null;

  const score = (value: ConditionComparison['candidate']) =>
    trainingScore(
      classId === null ? value.primary : (value.perClass.find((row) => row.classId === classId)?.score ?? null),
    );

  return (
    <div data-testid="condition-results" className="flex flex-col gap-2 text-[13px] tabular">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
        <dt>Members</dt>
        <dd>{result.support.members}</dd>
        <dt>Real test</dt>
        <dd>{result.support.realTest}</dd>
        <dt>Synthetic or unverified test</dt>
        <dd>{result.support.otherTest}</dd>
        <dt>Other splits</dt>
        <dd>{result.support.otherSplits}</dd>
        <dt>Overlapping conditions</dt>
        <dd>{result.support.overlapping}</dd>
        <dt>{TRAINING_METRIC_LABELS[metric]}</dt>
        <dd>{score(result.candidate)}</dd>
        <dt>Incumbent</dt>
        <dd>{score(result.incumbent)}</dd>
      </dl>
      <p className="text-white/60">
        Conditions are supplied labels. Only requirements declared before training affect retention. Group scores can’t
        establish statistical significance, physical safety or a deployment guarantee.
      </p>
    </div>
  );
}
