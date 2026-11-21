import { Button } from '../../design-system';
import type { BodyAnalysisView } from '../../workspace/useBodyAnalysis';
import { BodyMotionPreview } from './BodyMotionPreview';

export function BodyRecommendedMotion({ analysis }: { analysis: BodyAnalysisView }) {
  if (analysis.motion?.kind !== 'recommended') return null;

  return (
    <>
      <BodyMotionPreview key={analysis.motion.plan.id} motion={analysis.motion} />
      <Button
        variant="secondary"
        disabled={!analysis.executing && (analysis.pending || !analysis.applicable)}
        onClick={analysis.executing ? analysis.cancel : analysis.execute}
      >
        {analysis.executing ? 'Stop' : 'Run'}
      </Button>
    </>
  );
}
