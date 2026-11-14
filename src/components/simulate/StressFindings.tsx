import React from 'react';
import { Button, TrainIcon } from '../../design-system';
import type { SkillRow } from '../../skills/skillRows';
import { findingWords } from '../../skills/stressWords';
import { fmtMargin } from './format';
import type { SkillActions } from './skillActions';

export const StressFindings: React.FC<{ row: SkillRow; actions: SkillActions }> = ({ row, actions }) => {
  const { stress } = actions;

  if (!stress || !row.findings.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 pt-1" data-testid="stress-findings">
      {row.findings.map((finding, i) => (
        <Button
          key={`${finding.axis}-${i}`}
          variant="ghost"
          size="xs"
          className="tabular"
          title="Replay in the sim"
          onClick={() => stress.onFinding(row, finding)}
          data-testid="stress-finding"
        >
          {findingWords(finding)} <span className="text-white/40">{fmtMargin(finding.margin)}</span>
        </Button>
      ))}
      {stress.canTrainOnFindings(row) && (
        <Button
          variant="secondary"
          size="xs"
          icon={<TrainIcon className="w-3.5 h-3.5" />}
          title="Keeps the new skill only if it passes Arena with these in range"
          onClick={() => stress.onTrainOnFindings(row)}
        >
          Train on These
        </Button>
      )}
    </div>
  );
};
