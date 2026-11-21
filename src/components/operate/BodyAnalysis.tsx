import { Button, Modal, Select, Spinner } from '../../design-system';
import type { BodyAnalysisView } from '../../workspace/useBodyAnalysis';
import { BodyAnalysisResult } from './BodyAnalysisResult';
import { BodyAnalysisRefusal } from './BodyAnalysisRefusal';
import { BodyExperimentMethod } from './BodyExperimentMethod';
import { BodyAnalysisSourceStatus } from './BodyAnalysisSourceStatus';

function canFitExperiment(analysis: BodyAnalysisView): boolean {
  return (
    !analysis.pending &&
    analysis.applicable &&
    analysis.result?.kind === 'analyzed' &&
    analysis.experiment?.recording.completion === 'completed'
  );
}

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
        <BodyAnalysisSourceStatus analysis={analysis} />
        {analysis.problem && <p className="text-[13px] text-amber-400">{analysis.problem}</p>}
        {analysis.result?.kind === 'refused' && <BodyAnalysisRefusal reason={analysis.result.reason} />}
        {analysis.experiment && <BodyExperimentMethod analysis={analysis} />}
        {analysis.experiment && (
          <Button variant="secondary" disabled={!canFitExperiment(analysis)} onClick={analysis.fit}>
            Fit Body
          </Button>
        )}
        {analysis.result?.kind === 'analyzed' && (
          <BodyAnalysisResult result={analysis.result} applicable={analysis.applicable} analysis={analysis} />
        )}
      </div>
    </Modal>
  );
}
