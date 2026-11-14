import React from 'react';
import { AlertIcon, Button, RunIcon } from '../../design-system';
import type { SkillRow } from '../../skills/skillRows';
import type { SkillActions } from './skillActions';

export const ReadyActions: React.FC<{ row: SkillRow; actions: SkillActions }> = ({ row, actions }) => {
  const { stress } = actions;

  return (
    <>
      {stress && (
        <Button
          variant="secondary"
          size="xs"
          icon={<AlertIcon className="w-3.5 h-3.5" />}
          title="Find the friction, weight, servo strength and latency where it fails"
          onClick={() => stress.onStress(row)}
        >
          Stress
        </Button>
      )}
      <Button
        variant="secondary"
        size="xs"
        icon={<RunIcon className="w-3.5 h-3.5" />}
        onClick={() => (row.drives ? actions.onDrive() : actions.onTry(row))}
      >
        {row.drives ? 'Drive' : 'Try'}
      </Button>
    </>
  );
};
