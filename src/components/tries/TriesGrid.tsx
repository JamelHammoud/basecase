import React, { useState } from 'react';
import { LoadMore, SectionHeader } from '../../design-system';
import { pagedGroups, type RobotTries } from './triesSearch';
import { TryTile } from './TryTile';

const PAGE = 60;

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-[8px] gap-y-[12px] px-[4px]';

export const TriesGrid: React.FC<{
  groups: RobotTries[];
  selected: readonly string[];
  onClickTry: (id: string, e: React.MouseEvent) => void;
  onMenuTry: (id: string, e: React.MouseEvent) => void;
}> = ({ groups, selected, onClickTry, onMenuTry }) => {
  const [shown, setShown] = useState(PAGE);
  const total = groups.reduce((n, g) => n + g.tries.length, 0);
  const picked = new Set(selected);

  return (
    <>
      {pagedGroups(groups, shown).map((g) => (
        <section key={g.robot} role="group" aria-label={g.robot} className="mb-4">
          <SectionHeader title={g.robot} />
          <div className={GRID}>
            {g.tries.map((t) => (
              <TryTile
                key={t.id}
                stored={t}
                selected={picked.has(t.id)}
                onClick={(e) => onClickTry(t.id, e)}
                onMenu={(e) => onMenuTry(t.id, e)}
              />
            ))}
          </div>
        </section>
      ))}
      {shown < total && <LoadMore key={shown} onReach={() => setShown((n) => n + PAGE)} />}
    </>
  );
};
