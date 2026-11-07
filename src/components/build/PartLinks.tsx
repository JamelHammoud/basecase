import React from 'react';
import { HoverCard } from '../../design-system';
import type { ScenePart } from '../../types/robotics';
import { PART_PREVIEW_WIDTH, PartPreviewCard } from '../agent/PartPreviewCard';

const MAX_SHOWN = 5;

interface PartGroup {
  name: string;
  parts: ScenePart[];
}

function groupsOf(ids: string[], parts: ScenePart[]): PartGroup[] {
  const groups = new Map<string, ScenePart[]>();

  for (const id of new Set(ids)) {
    const part = parts.find((p) => p.id === id);

    if (part) groups.set(part.name, [...(groups.get(part.name) ?? []), part]);
  }

  return [...groups].map(([name, grouped]) => ({ name, parts: grouped }));
}

const LINK = 'text-[12px] leading-[18px] text-[#5cb8ff] hover:underline underline-offset-2 cursor-default';

export const PartLinks: React.FC<{
  ids: string[];
  parts: ScenePart[];
  panScroll: boolean;
  onSelect: (ids: string[]) => void;
}> = ({ ids, parts, panScroll, onSelect }) => {
  const groups = groupsOf(ids, parts);

  if (!groups.length) return null;

  const hidden = groups.slice(MAX_SHOWN).flatMap((g) => g.parts.map((p) => p.id));

  return (
    <span className="flex flex-wrap gap-x-2.5 mt-0.5">
      {groups.slice(0, MAX_SHOWN).map((group) => (
        <HoverCard
          key={group.name}
          content={() => <PartPreviewCard parts={group.parts} panScroll={panScroll} />}
          width={PART_PREVIEW_WIDTH}
          placement="below"
          inline
        >
          <button type="button" className={LINK} onClick={() => onSelect(group.parts.map((p) => p.id))}>
            {group.parts.length > 1 ? `${group.parts.length} × ${group.name}` : group.name}
          </button>
        </HoverCard>
      ))}
      {hidden.length > 0 && (
        <button type="button" className={LINK} onClick={() => onSelect(hidden)}>
          {groups.length - MAX_SHOWN} more
        </button>
      )}
    </span>
  );
};
