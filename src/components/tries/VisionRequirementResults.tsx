import { TRAINING_METRIC_LABELS, trainingScore } from '../../vision/training/presentation';
import { REQUIREMENT_REASONS } from '../../vision/training/requirementPresentation';
import type { RequirementOutcome } from '../../vision/training/requirementTypes';

export function VisionRequirementResults({ outcomes }: { outcomes: RequirementOutcome[] | undefined }) {
  if (!outcomes?.length) return null;

  return (
    <div className="flex flex-col gap-2 text-[13px] tabular" data-testid="requirement-results">
      {outcomes.map((outcome, index) => (
        <section key={index} className="flex flex-col gap-1" data-requirement-outcome={outcome.reason}>
          <span>{outcome.requirement.group.name}</span>
          {outcome.requirement.className && <span>{outcome.requirement.className}</span>}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            <dt>{TRAINING_METRIC_LABELS[outcome.requirement.metric]}</dt>
            <dd>{trainingScore(outcome.candidate)}</dd>
            <dt>Incumbent</dt>
            <dd>{trainingScore(outcome.incumbent)}</dd>
            <dt>Score floor</dt>
            <dd>{trainingScore(outcome.requirement.minScore)}</dd>
            <dt>Real test</dt>
            <dd>
              {outcome.support} / {outcome.requirement.minRealTest}
            </dd>
            <dt>Permitted regression</dt>
            <dd>{trainingScore(outcome.requirement.maxRegression)}</dd>
          </dl>
          <p className={outcome.reason === 'passed' ? 'text-white/60' : 'text-amber-400'}>
            {REQUIREMENT_REASONS[outcome.reason]}
          </p>
        </section>
      ))}
    </div>
  );
}
