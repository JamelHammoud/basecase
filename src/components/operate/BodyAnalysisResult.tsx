import { Spinner } from '../../design-system';
import type { BodyAnalysisResult as AnalysisResult } from '../../reality/bodyAnalysisTypes';

const status = { distinguishable: 'Distinguishable', coupled: 'Coupled', 'poor-excitation': 'Poor excitation' };
const kind = { massScales: 'Mass scale', payloadKg: 'Payload', floorFrictionScale: 'Floor friction scale' };

export function BodyAnalysisResult({
  result,
  applicable,
  checking,
}: {
  result: AnalysisResult;
  applicable: boolean;
  checking: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 break-words text-[13px] text-white/60 [overflow-wrap:anywhere]">
      <p className="text-white/90">
        {checking && <Spinner />}
        {!checking && (applicable ? 'Current source' : 'Out of date')}
      </p>
      <p>
        {result.source.unit} {result.source.recording}
      </p>
      <p>
        {result.residual.modelExplainsObservations
          ? 'The model explains the observations under the assumed noise.'
          : 'Residual mismatch remains unresolved.'}
      </p>
      <p>Local distinguishability under this model. Coupled parameters can explain similar motion.</p>
      <dl className="flex flex-col gap-2">
        {result.parameters.map((parameter) => (
          <div
            key={`${parameter.kind}:${parameter.body}`}
            data-body-parameter={parameter.kind}
            data-distinguishability={parameter.distinguishability}
          >
            <dt className="text-white/90">
              {parameter.label} {kind[parameter.kind]}
            </dt>
            <dd>{status[parameter.distinguishability]}</dd>
            <dd>
              {parameter.probe[0]}–{parameter.probe[1]} {parameter.unit}, bounds {parameter.bounds[0]}–
              {parameter.bounds[1]}, scale {parameter.scale}
            </dd>
          </div>
        ))}
      </dl>
      <details>
        <summary role="button" className="min-h-[32px] cursor-default text-white/90">
          Method
        </summary>
        <p>
          {result.method.version} {result.source.modelHash} {result.source.calibrationFingerprint}
        </p>
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
    </div>
  );
}
