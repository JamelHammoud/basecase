import React from 'react';
import { BrowseRow, SectionHeader } from '../../design-system';
import type { RobotTries } from './triesLibrary';
import { plural } from '../../../electron/plural.mjs';

export const TriesSection: React.FC<{ groups: RobotTries[]; onOpen: (robot: string) => void }> = ({
  groups,
  onOpen,
}) => (
  <section data-testid="library-tries" className="pt-3">
    <SectionHeader title="Tries" className="px-[12px]" />
    {groups.map((g) => (
      <BrowseRow
        key={g.robot}
        title={g.robot}
        meta={plural(g.tries.length, 'try', 'tries')}
        onOpen={() => onOpen(g.robot)}
      />
    ))}
  </section>
);
