import React, { useRef, useState } from 'react';
import { dimensionRows } from '../../agent/cadTune';
import { NumberInput, Section } from '../../design-system';
import type { ScenePart } from '../../types/robotics';
import type { InspectorProps } from './types';

interface DimensionsSectionProps {
  part: ScenePart;
  code: string;
  onTune: InspectorProps['onTuneDimensions'];
}

interface Pending {
  code: string;
  values: Record<string, number>;
}

export const DimensionsSection: React.FC<DimensionsSectionProps> = ({ part, code, onTune }) => {
  const [pending, setPending] = useState<Pending | null>(null);
  const sent = useRef<Pending | null>(null);
  const rows = dimensionRows(code);
  const shown = pending?.code === code ? pending.values : {};

  if (!rows.length) return null;

  const commit = async (name: string, value: number, was: number) => {
    const last = sent.current?.code === code ? sent.current.values : {};

    if (value === (last[name] ?? was)) return;

    const next = { code, values: { ...last, [name]: value } };

    sent.current = next;
    setPending(next);
    await onTune(part.id, { [name]: value });

    if (sent.current === next) sent.current = null;

    setPending((p) => (p === next ? null : p));
  };

  return (
    <Section title="Dimensions" collapsible>
      {rows.map((row) => {
        const value = shown[row.name] ?? row.value;

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
