import React from 'react';
import type { PartEdges } from '../../types/robotics';
import { NumberInput, SegmentedControl } from '../../design-system';
import { clampEdges, edgeLimitMm } from '../../utils/partEdges';
import type { PartSectionProps } from './partSections';

const KINDS: Array<{ value: PartEdges['kind']; label: string }> = [
  { value: 'fillet', label: 'Fillet' },
  { value: 'chamfer', label: 'Chamfer' },
];

export const EdgesField: React.FC<PartSectionProps> = ({ part, onUpdate }) => {
  const edges = part.edges ?? { kind: 'fillet', mm: 0 };
  const limit = edgeLimitMm(part.kind, part.dimensions);
  const set = (next: PartEdges, live?: boolean) => onUpdate({ edges: clampEdges(part, next) }, live);

  return (
    <div className="grid grid-cols-2 gap-1.5">
      <SegmentedControl<PartEdges['kind']>
        size="sm"
        options={KINDS}
        value={edges.kind}
        onChange={(kind) => set({ ...edges, kind })}
      />
      <NumberInput
        aria-label={KINDS.find((k) => k.value === edges.kind)!.label}
        min={0}
        max={limit}
        step={0.5}
        precision={2}
        value={Math.min(edges.mm, limit)}
        onChange={(mm, live) => set({ ...edges, mm }, live)}
      />
    </div>
  );
};
