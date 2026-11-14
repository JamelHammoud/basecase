import React, { useState } from 'react';
import { dimensionRows } from '../../agent/cadTune';
import { NumberInput, Section } from '../../design-system';
import type { ScenePart } from '../../types/robotics';
import { noEdits, seenAt, settled, shownValue, withEdit } from './dimensionEdits';
import type { InspectorProps } from './types';

interface DimensionsSectionProps {
  part: ScenePart;
  code: string;
  onTune: InspectorProps['onTuneDimensions'];
}

export const DimensionsSection: React.FC<DimensionsSectionProps> = ({ part, code, onTune }) => {
  const [edits, setEdits] = useState(() => noEdits(code));
  const seen = seenAt(edits, code);
  const rows = dimensionRows(code);

  if (seen !== edits) setEdits(seen);

  if (!rows.length) return null;

  const commit = async (name: string, value: number, was: number) => {
    const next = withEdit(seen, { code, name, value, was });

    if (!next) return;

    setEdits(next);
    await onTune(part.id, { [name]: value });
    setEdits((current) => settled(current, next));
  };

  return (
    <Section title="Dimensions" collapsible>
      {rows.map((row) => {
        const value = shownValue(seen, row.name, row.value);

        return (
          <div key={row.name} className="grid grid-cols-3 gap-1.5 items-center">
            <span className="col-span-2 min-w-0 truncate text-[13px] text-white/50">{row.name}</span>
            <NumberInput
              aria-label={row.name}
              value={value}
              min={row.min}
              max={row.max}
              step={row.step}
              precision={row.precision}
              unit=""
              onChange={(v) => void commit(row.name, v, value)}
            />
          </div>
        );
      })}
    </Section>
  );
};
