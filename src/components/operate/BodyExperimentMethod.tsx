import type { BodyAnalysisView } from '../../workspace/useBodyAnalysis';
import { bodyMotionBounds } from '../../reality/bodyMotionLabel';

export function BodyExperimentMethod({ analysis }: { analysis: BodyAnalysisView }) {
  const experiment = analysis.experiment;

  if (!experiment) return null;

  return (
    <details className="min-w-0 break-words text-[13px] text-white/60 [overflow-wrap:anywhere]">
      <summary role="button" className="min-h-[32px] cursor-default text-white/90">
        Method
      </summary>
      <p data-experiment-completion={experiment.recording.completion}>
        {experiment.recording.completion} {experiment.recording.backend}
      </p>
      <p>
        {experiment.recommendation.content} {experiment.recording.connection}
      </p>
      <p>Commands: {analysis.commands}</p>
      <p>Observations: {analysis.samples}</p>
      {analysis.prediction?.kind === 'recommended' && (
        <>
          <p>
            {analysis.prediction.method.version} {analysis.prediction.score.before.toPrecision(3)} /{' '}
            {analysis.prediction.score.after.toPrecision(3)}
          </p>
          <p>{bodyMotionBounds(analysis.prediction)}</p>
        </>
      )}
    </details>
  );
}
