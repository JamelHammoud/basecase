import React from 'react';
import { Button, TrainIcon } from '../../design-system';
import type { SkillRow } from '../../skills/skillRows';
import type { StressFinding } from '../../skills/stress';
import { findingLine, stressMarginText } from '../../skills/stressWords';

export interface FindingActions {
  onFinding?: (row: SkillRow, finding: StressFinding) => void;
  onTrainFindings?: (row: SkillRow) => void;
  canTrainFindings?: (row: SkillRow) => boolean;
}

export const SkillFindings: React.FC<{ row: SkillRow; actions: FindingActions }> = ({ row, actions }) => {
  const { onFinding, onTrainFindings, canTrainFindings } = actions;
  const findings = row.stress?.findings ?? [];

  if (!findings.length || !onFinding) return null;

  return (
    <div className="flex flex-col gap-1 pt-1" data-testid="stress-findings">
      {findings.map((finding) => (
        <div key={findingLine(finding)} className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="xs"
            className="min-w-0 tabular"
            onClick={() => onFinding(row, finding)}
            data-testid="stress-finding"
            data-point={JSON.stringify(finding.point)}
          >
            {findingLine(finding)}
          </Button>
          <span className="shrink-0 text-[12px] text-white/50 tabular">{stressMarginText(finding.margin)}</span>
        </div>
      ))}
      {onTrainFindings && canTrainFindings?.(row) && (
        <Button
          variant="secondary"
          size="xs"
          className="self-start"
          icon={<TrainIcon className="w-3.5 h-3.5" />}
          onClick={() => onTrainFindings(row)}
        >
          Train on These
        </Button>
      )}
    </div>
  );
};
