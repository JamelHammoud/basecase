import React from 'react';
import { BrowseRow, SectionHeader } from '../../design-system';
import type { RobotTries } from '../tries/triesSearch';

export const TriesSection: React.FC<{
  groups: RobotTries[];
  current: string | null;
  onOpen: (robot: string) => void;
}> = ({ groups, current, onOpen }) => {
  if (groups.length === 0) return null;

  return (
    <div className="mt-4">
      <SectionHeader title="Tries" />
      {groups.map((g) => (
        <div key={g.robot} data-testid="tries-robot">
          <BrowseRow
            title={g.robot}
            meta={String(g.tries.length)}
            active={current === g.robot}
            onOpen={() => onOpen(g.robot)}
          />
        </div>
      ))}
    </div>
  );
};
