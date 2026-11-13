import React from 'react';
import { Button, MetaLine, Section } from '../../design-system';
import { groupNames, leftOutText, savingsItems } from '../../print/merge/mergeText';
import type { MergeGroup } from '../../print/merge/mergeTypes';
import type { ScenePart } from '../../types/robotics';
import type { Merges } from '../../workspace/useMerges';

interface MergeSectionProps {
  merges: Merges;
  parts: ScenePart[];
}

const MergeRow: React.FC<{ group: MergeGroup; merges: Merges; nameOf: (id: string) => string }> = ({
  group,
  merges,
  nameOf,
}) => (
  <li className="flex items-start gap-3 py-1.5">
    <div className="flex-1 min-w-0">
      <div className="text-[13px] text-white/90 truncate">{groupNames(group, nameOf)}</div>
      <MetaLine className="text-[12px] text-white/50 tabular-nums" items={savingsItems(group)} />
      {group.left.map((l) => (
        <div key={l.id} className="text-[12px] mt-0.5 text-white/50">
          {leftOutText(l, nameOf)}
        </div>
      ))}
    </div>
    <Button size="sm" variant="secondary" disabled={merges.merging !== null} onClick={() => void merges.merge(group)}>
      Merge
    </Button>
  </li>
);

export const MergeSection: React.FC<MergeSectionProps> = ({ merges, parts }) => {
  if (!merges.groups.length) return null;

  const names = new Map(parts.map((p) => [p.id, p.name]));
  const nameOf = (id: string) => names.get(id) ?? id;

  return (
    <Section title="Merge">
      <ul>
        {merges.groups.map((g) => (
          <MergeRow key={g.ids.join('|')} group={g} merges={merges} nameOf={nameOf} />
        ))}
      </ul>
    </Section>
  );
};
