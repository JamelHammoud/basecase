import { Button, Spinner } from '../../design-system';
import type { BodyAnalysisResult as AnalysisResult } from '../../reality/bodyAnalysisTypes';
import type { BodyAnalysisView } from '../../workspace/useBodyAnalysis';
import { BodyMotionPreview } from './BodyMotionPreview';

import { BodyAnalysisMethod } from './BodyAnalysisMethod';
import { BodyAnalysisParameters } from './BodyAnalysisParameters';
import { BodyAnalysisRefusal } from './BodyAnalysisRefusal';

export function BodyAnalysisResult({
  result,
  applicable,
  checking,
  analysis,
}: {
  result: AnalysisResult;
  applicable: boolean;
  checking: boolean;
  analysis: BodyAnalysisView;
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
      {!result.residual.modelExplainsObservations && <p>Residual mismatch remains unresolved.</p>}
      <BodyAnalysisParameters result={result} analysis={analysis} />
      {result.parameters.some((parameter) => parameter.distinguishability !== 'distinguishable') && (
        <Button
          variant="secondary"
          disabled={analysis.pending || !applicable || !analysis.parameters.length}
          onClick={analysis.recommend}
        >
          Preview Motion
        </Button>
      )}
      {analysis.motion?.kind === 'recommended' && (
        <BodyMotionPreview key={analysis.motion.plan.id} motion={analysis.motion} />
      )}
      {analysis.motion?.kind === 'no-improvement' && <BodyAnalysisRefusal />}
      {analysis.motion?.kind === 'refused' && <BodyAnalysisRefusal reason={analysis.motion.reason} />}
      <BodyAnalysisMethod result={result} analysis={analysis} />
    </div>
  );
}
