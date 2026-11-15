import { fileSize } from '../../../electron/fileSize.mjs';
import { plural } from '../../../electron/plural.mjs';
import { MetaLine } from '../../design-system';
import type { VisionAttemptView, VisionTrainingView } from './visionTrainingView';
import { VisionTrainingApply } from './VisionTrainingApply';

interface VisionTrainingResultsProps {
  attempts: VisionAttemptView[];
  targets: VisionTrainingView['targets'];
  onApply: VisionTrainingView['apply'];
}

export function VisionTrainingResults({ attempts, targets, onApply }: VisionTrainingResultsProps) {
  if (!attempts.length) return null;

  return (
    <section
      className="flex flex-col gap-2.5"
      aria-label="Vision training results"
      data-testid="vision-training-results"
    >
      {attempts.map((attempt, index) => (
        <div
          key={attempt.id}
          className="flex flex-col gap-1.5 py-1.5"
          data-attempt={attempt.id}
          data-retained={attempt.retained}
        >
          <MetaLine
            items={[`Attempt ${index + 1}`, attempt.retained ? 'Retained' : 'Checkpoint']}
            className="text-[13px] text-white/90"
          />
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[13px] tabular">
            {attempt.metrics.map((metric) => (
              <div key={metric.name} className="contents">
                <dt className="text-white/60">{metric.name}</dt>
                <dd className="text-white/90">{metric.value}</dd>
              </div>
            ))}
            <dt className="text-white/60">Inference</dt>
            <dd className="text-white/90">
              {attempt.inferenceMs === null ? 'Unmeasured' : `${attempt.inferenceMs.toFixed(1)} ms`}
            </dd>
            <dt className="text-white/60">Model size</dt>
            <dd className="text-white/90">{fileSize(attempt.bytes)}</dd>
          </dl>
          {attempt.failures.map((failure) => (
            <MetaLine
              key={failure.className}
              className="text-[12px] text-white/60"
              items={[
                failure.className,
                plural(failure.missed, 'miss', 'misses'),
                plural(failure.falsePositives, 'false positive'),
              ]}
            />
          ))}
          <p className="text-[12px] text-white/60">{attempt.reason}</p>
          {attempt.retained && (
            <VisionTrainingApply runId={attempt.id} targets={attempt.targets ?? targets} onApply={onApply} />
          )}
        </div>
      ))}
    </section>
  );
}
