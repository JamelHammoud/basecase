import { useState } from 'react';
import { Button } from '../../design-system';
import { BodySequenceRounds } from './BodySequenceRounds';
import type { BodyAnalysisView } from '../../workspace/useBodyAnalysis';
import { BODY_SEQUENCE_LIMITS } from '../../reality/bodySequenceTypes';
import { bodyEvidenceText } from '../../workspace/bodyActions';

const reasons: Partial<Record<string, string>> = {
  resolved: 'Distinguishable',
  'no-improvement': 'Can’t tell',
  cancelled: 'Stopped',
  rounds: 'Round limit',
  duration: 'Duration limit',
  storage: 'Storage limit',
  budget: 'Physics limit',
  provenance: 'Out of date',
};

function sequenceView(analysis: BodyAnalysisView) {
  const evidence = analysis.sequence;
  const state = evidence?.state;

  return {
    evidence,
    state,
    limits: state?.limits ?? BODY_SEQUENCE_LIMITS,
    stopped: !!state && !analysis.sequencing,
    reason: state?.reason ?? 'cancelled',
    canFit: !!state?.rounds.length && !analysis.pending && !state.validationResult && !state.validationRefusal,
    result: state?.validationResult,
  };
}

export function BodySimulatedSequence({ analysis }: { analysis: BodyAnalysisView }) {
  const [expanded, setExpanded] = useState(false);
  const { evidence, state, limits, stopped, reason, canFit, result } = sequenceView(analysis);

  if (!expanded && !state)
    return (
      <Button variant="secondary" onClick={() => setExpanded(true)}>
        Simulated Sequence
      </Button>
    );

  return (
    <div
      data-body-sequence
      className="flex min-w-0 flex-col gap-3 break-words text-[13px] text-white/60 [overflow-wrap:anywhere]"
    >
      <p className="text-white/90">Simulated Sequence</p>
      <dl>
        <dt>Maximum rounds</dt>
        <dd>{limits.rounds}</dd>
        <dt>Duration</dt>
        <dd>{limits.seconds} s</dd>
        <dt>Physics steps</dt>
        <dd>{limits.physicsSteps}</dd>
        <dt>Storage</dt>
        <dd>{limits.retainedBytes / 1_048_576} MiB</dd>
      </dl>
      {!state && (
        <Button
          variant="secondary"
          disabled={analysis.pending || !analysis.applicable || !analysis.parameters.length}
          onClick={analysis.runSequence}
        >
          Run
        </Button>
      )}
      {analysis.sequencing && (
        <Button variant="secondary" onClick={analysis.cancel}>
          Stop
        </Button>
      )}
      {stopped && <p data-body-sequence-reason={reason}>{reasons[reason] ?? 'Can’t tell'}</p>}
      {evidence && (
        <BodySequenceRounds evidence={evidence} inspect={analysis.inspectRecording} units={analysis.observationUnits} />
      )}
      {canFit && (
        <Button variant="secondary" disabled={!analysis.applicable} onClick={analysis.fit}>
          Fit Body
        </Button>
      )}
      {result && <p>{bodyEvidenceText(result)}</p>}
      {state?.validationRefusal && <p>Can’t tell.</p>}
    </div>
  );
}
