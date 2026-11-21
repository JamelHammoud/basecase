import { Button } from '../../design-system';
import { BodyRunObservations } from './BodyRunObservations';
import type { BodySequenceEvidence } from '../../reality/bodyExperimentTypes';
import type { BodyEvidenceRef } from '../../reality/bodyEvidence';
import { useState } from 'react';

export function BodySequenceRounds({
  evidence,
  inspect,
  units,
}: {
  evidence: BodySequenceEvidence;
  inspect: (reference: BodyEvidenceRef) => void;
  units?: Array<'rad' | 'm'>;
}) {
  const [expanded, setExpanded] = useState<number[]>([]);

  return evidence.state.rounds.map((round, index) => (
    <details
      key={index}
      data-body-sequence-round={index + 1}
      open={expanded.includes(index)}
      onToggle={(event) => {
        const open = event.currentTarget.open;

        setExpanded((current) => [...current.filter((entry) => entry !== index), ...(open ? [index] : [])]);
      }}
    >
      <summary role="button" className="min-h-[32px] text-white/90">
        {index + 1} {round.plan.id}
      </summary>
      {expanded.includes(index) && <p>Information gain: {round.contribution.toPrecision(3)}</p>}
      {expanded.includes(index) && <BodyRunObservations run={round.run} units={units} />}
      {expanded.includes(index) && evidence.recordings[index + 1] && (
        <Button
          variant="secondary"
          data-recording={evidence.recordings[index + 1].recording}
          onClick={() => inspect(evidence.recordings[index + 1])}
        >
          {evidence.recordings[index + 1].recording}
        </Button>
      )}
    </details>
  ));
}
