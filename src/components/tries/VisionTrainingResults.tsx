import { useEffect, useState } from 'react';
import { VISION_INSPECTION_EVENT, type VisionInspectionRequest } from './visionInspectionCommand';
import { VisionInspection } from './VisionInspection';
import { Button } from '../../design-system';
import { fileSize } from '../../../electron/fileSize.mjs';
import { plural } from '../../../electron/plural.mjs';
import { MetaLine } from '../../design-system';
import type { VisionAttemptView, VisionTrainingView } from './visionTrainingView';
import { VisionTrainingApply } from './VisionTrainingApply';

interface VisionTrainingResultsProps {
  attempts: VisionAttemptView[];
  context?: string;
  targets: VisionTrainingView['targets'];
  onApply: VisionTrainingView['apply'];
}

export function VisionTrainingResults({ attempts, targets, onApply, context }: VisionTrainingResultsProps) {
  const [inspecting, setInspecting] = useState<string | null>(null);
  const attempt = attempts.find((entry) => entry.id === inspecting);
  const reports = attempt?.inspection;

  useEffect(() => {
    const requested = (event: Event) => {
      const request = (event as CustomEvent<VisionInspectionRequest>).detail;

      if (request.context === context) setInspecting(request.id);
    };

    window.addEventListener(VISION_INSPECTION_EVENT, requested);

    return () => window.removeEventListener(VISION_INSPECTION_EVENT, requested);
  }, [context]);

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
          {attempt.inspection && <Button onClick={() => setInspecting(attempt.id)}>Inspect Images</Button>}
          {attempt.retained && (
            <VisionTrainingApply runId={attempt.id} targets={attempt.targets ?? targets} onApply={onApply} />
          )}
        </div>
      ))}
      {reports && (
        <VisionInspection
          key={inspecting}
          reports={reports}
          navigation={attempt?.navigation}
          onClose={() => setInspecting(null)}
        />
      )}
    </section>
  );
}
