import { Switch } from '../../design-system';
import { bodyParameterLabel } from '../../reality/bodyParameterLabel';
import type { BodyAnalysisResult } from '../../reality/bodyAnalysisTypes';
import type { BodyAnalysisView } from '../../workspace/useBodyAnalysis';

const status = { distinguishable: 'Distinguishable', coupled: 'Coupled', 'poor-excitation': 'Poor excitation' };

export function BodyAnalysisParameters({
  result,
  analysis,
}: {
  result: BodyAnalysisResult;
  analysis: BodyAnalysisView;
}) {
  return (
    <dl className="flex flex-col gap-2">
      {result.parameters.map((parameter, index) => (
        <div
          key={`${parameter.kind}:${parameter.body}`}
          data-body-parameter={parameter.kind}
          data-distinguishability={parameter.distinguishability}
        >
          <dt className="text-white/90">
            {parameter.distinguishability === 'distinguishable' ? (
              bodyParameterLabel(parameter)
            ) : (
              <Switch
                className="!h-auto min-h-[32px]"
                label={<span className="block whitespace-normal text-white/90">{bodyParameterLabel(parameter)}</span>}
                aria-label={bodyParameterLabel(parameter)}
                checked={analysis.parameters.includes(index)}
                disabled={analysis.pending || !analysis.applicable || !!analysis.sequence}
                onChange={() => analysis.toggle(index)}
              />
            )}
          </dt>
          <dd>{status[parameter.distinguishability]}</dd>
        </div>
      ))}
    </dl>
  );
}
