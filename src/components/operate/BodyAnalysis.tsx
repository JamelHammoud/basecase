import { Modal, Select, Spinner } from '../../design-system';
import type { BodyAnalysisView } from '../../workspace/useBodyAnalysis';
import { BodyAnalysisResult } from './BodyAnalysisResult';

export function BodyAnalysis({ analysis }: { analysis: BodyAnalysisView }) {
  return (
    <Modal
      isOpen={analysis.open}
      onClose={analysis.close}
      title="Analyze Try"
      action={{
        label: 'Analyze',
        disabled: analysis.pending || !analysis.ready || !analysis.choices.length,
        onClick: analysis.analyze,
      }}
      footerStart={analysis.pending ? <Spinner /> : undefined}
    >
      <div
        className="flex flex-col gap-3"
        data-testid="body-analysis"
        data-applicable={analysis.ready ? analysis.applicable : undefined}
      >
        <Select
          aria-label="Try"
          autoFocus
          value={analysis.selected}
          options={analysis.choices}
          disabled={analysis.pending}
          onChange={(event) => analysis.pick(event.target.value)}
        />
        {analysis.problem && <p className="text-[13px] text-amber-400">{analysis.problem}</p>}
        {analysis.result?.kind === 'refused' && <p className="text-[13px] text-white/60">Can’t tell from this try.</p>}
        {analysis.result?.kind === 'analyzed' && (
          <BodyAnalysisResult result={analysis.result} applicable={analysis.applicable} checking={!analysis.ready} />
        )}
      </div>
    </Modal>
  );
}
