import React from 'react';
import { Button, TrainIcon } from '../../design-system';
import type { SkillRow } from '../../skills/skillRows';
import type { StressFinding } from '../../skills/stress';
import { findingLabel } from '../../skills/stressText';
import { fmtMargin } from './format';

export interface StressActions {
  onFinding: (row: SkillRow, finding: StressFinding) => void;
  onTrainOn: (row: SkillRow) => void;
  canTrainOn: (row: SkillRow) => boolean;
}

export const StressFindings: React.FC<{ row: SkillRow; actions: StressActions }> = ({ row, actions }) => {
  const stress = row.state.kind === 'ready' ? row.stress : null;

  if (!stress?.result.findings.length) return null;

  const { onTrainOn, canTrainOn } = actions;

  return (
    <div className="flex flex-col gap-1 pt-1" data-testid="stress-findings">
      {stress.result.findings.map((f) => (
        <Button
          key={f.axis}
          variant="ghost"
          size="xs"
          fullWidth
          className="justify-between! tabular"
          iconRight={<span className="text-white/50">{fmtMargin(f.margin)}</span>}
          onClick={() => actions.onFinding(row, f)}
          data-testid="stress-finding"
          data-axis={f.axis}
        >
          {findingLabel(f)}
        </Button>
      ))}
      {stress.refused && <div className="text-[12px] text-white/50 tabular">{stress.refused}</div>}
      {canTrainOn(row) && (
        <Button
          variant="secondary"
          size="xs"
          className="self-start"
          icon={<TrainIcon className="w-3.5 h-3.5" />}
          onClick={() => onTrainOn(row)}
        >
          Train on These
        </Button>
      )}
    </div>
  );
};
