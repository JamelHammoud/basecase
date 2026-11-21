import { Spinner } from '../../design-system';
import type { BodyAnalysisView } from '../../workspace/useBodyAnalysis';

export function BodyAnalysisSourceStatus({ analysis }: { analysis: BodyAnalysisView }) {
  if (analysis.result?.kind !== 'analyzed' && !analysis.experiment) return null;

  if (analysis.ready && analysis.applicable) return null;

  return <p className="text-[13px] text-white/90">{analysis.ready ? 'Out of date' : <Spinner />}</p>;
}
