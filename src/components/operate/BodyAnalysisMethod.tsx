import type { BodyAnalysisResult as AnalysisResult } from '../../reality/bodyAnalysisTypes';
import type { BodyAnalysisView } from '../../workspace/useBodyAnalysis';
import { bodyParameterLabel } from '../../reality/bodyParameterLabel';
import { bodyMotionBounds } from '../../reality/bodyMotionLabel';
import { Button } from '../../design-system';

export function BodyAnalysisMethod({ result, analysis }: { result: AnalysisResult; analysis: BodyAnalysisView }) {
  return (
    <details>
      <summary role="button" className="min-h-[32px] cursor-default text-white/90">
        Method
      </summary>
      <p>
        {result.method.version} {result.source.modelHash} {result.source.calibrationFingerprint}
      </p>
      {analysis.observationLimit && <p>{analysis.observationLimit}</p>}
      {analysis.motion?.kind === 'recommended' && <p>{bodyMotionBounds(analysis.motion)}</p>}
      {analysis.sequence && <p>{analysis.sequence.state.method.version}</p>}
      {analysis.sequence?.recordings[0] && (
        <Button variant="secondary" onClick={() => analysis.inspectRecording(analysis.sequence!.recordings[0])}>
          Validation
        </Button>
      )}
      {result.parameters.map((parameter) => (
        <p key={`${parameter.kind}:${parameter.body}`}>
          {bodyParameterLabel(parameter)}: {parameter.probe[0]}–{parameter.probe[1]} {parameter.unit}, bounds{' '}
          {parameter.bounds[0]}–{parameter.bounds[1]}, scale {parameter.scale}
        </p>
      ))}
      {analysis.motion && (
        <p>
          {analysis.motion.method.version} {analysis.motion.physicsSteps}
        </p>
      )}
      {analysis.motion?.candidates.map((candidate) => (
        <p key={candidate.plan.id}>
          {candidate.plan.id}: {candidate.score.before.toPrecision(3)} / {candidate.score.after.toPrecision(3)}
        </p>
      ))}
      <p>
        {result.interval[0]}–{result.interval[1]} ms
      </p>
      <p>
        Assumed noise: {result.method.noiseRad} rad, {result.method.noiseM} m. Direction threshold:{' '}
        {result.method.absoluteResponse}, relative threshold: {result.method.relativeResponse}, tolerance:{' '}
        {result.method.orthogonalityTolerance}.
      </p>
      {result.directions.map((direction, index) => (
        <p key={index}>
          {direction.weights.map((weight) => weight.toPrecision(3)).join(', ')}: {direction.response.toPrecision(3)}
        </p>
      ))}
    </details>
  );
}
