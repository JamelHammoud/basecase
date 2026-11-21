import { Button } from '../../design-system';
import type { BodyAnalysisResult as AnalysisResult } from '../../reality/bodyAnalysisTypes';
import type { BodyAnalysisView } from '../../workspace/useBodyAnalysis';
import { BodyRecommendedMotion } from './BodyRecommendedMotion';

import { BodyAnalysisMethod } from './BodyAnalysisMethod';
import { BodyAnalysisParameters } from './BodyAnalysisParameters';
import { BodyAnalysisRefusal } from './BodyAnalysisRefusal';
import { BodySimulatedSequence } from './BodySimulatedSequence';

export function BodyAnalysisResult({
  result,
  applicable,
  analysis,
}: {
  result: AnalysisResult;
  applicable: boolean;
  analysis: BodyAnalysisView;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 break-words text-[13px] text-white/60 [overflow-wrap:anywhere]">
      <p>
        {result.source.unit} {result.source.recording}
      </p>
      {!result.residual.modelExplainsObservations && <p>Residual mismatch remains unresolved.</p>}
      <BodyAnalysisParameters result={result} analysis={analysis} />
      <BodySimulatedSequence analysis={analysis} />
      {result.parameters.some((parameter) => parameter.distinguishability !== 'distinguishable') && (
        <Button
          variant="secondary"
          disabled={analysis.pending || !applicable || !analysis.parameters.length || !!analysis.sequence}
          onClick={analysis.recommend}
        >
          Preview Motion
        </Button>
      )}
      <BodyRecommendedMotion analysis={analysis} />
      {analysis.motion?.kind === 'no-improvement' && <BodyAnalysisRefusal />}
      {analysis.motion?.kind === 'refused' && <BodyAnalysisRefusal reason={analysis.motion.reason} />}
      <BodyAnalysisMethod result={result} analysis={analysis} />
    </div>
  );
}
