import React from 'react';
import { BrowseRow, SectionHeader } from '../../design-system';
import type { TryGroup } from '../../workspace/useTriesView';
import { plural } from '../../../electron/plural.mjs';

export const TriesSection: React.FC<{ groups: TryGroup[]; onOpen: (robot: string) => void }> = ({ groups, onOpen }) =>
  groups.length > 0 && (
    <section className="mt-4" data-testid="library-tries">
      <SectionHeader title="Tries" className="px-[8px]" />
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
