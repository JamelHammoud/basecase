import React from 'react';
import { HardwareSpec, heatInsert, stockLengths } from '../data/hardware';
import { ChoiceGrid, Section } from '../design-system';

export const InsertLengthSection: React.FC<{
  spec: HardwareSpec;
  set: (next: Partial<HardwareSpec>) => void;
}> = ({ spec, set }) => {
  const lengths = stockLengths(spec);
  const insert = heatInsert(spec);
  const detail = `${insert.label ? `${insert.label} · ` : ''}Ø${insert.od} mm`;

  return (
    <Section title="Length" actions={<span className="mr-1 text-[12.5px] text-white/45 tabular">{detail}</span>}>
      <ChoiceGrid
        label="Length"
        columns={Math.max(3, lengths.length)}
        value={String(insert.l)}
        onChange={(l) => set({ length: Number(l) })}
        options={lengths.map((l) => ({ value: String(l), label: `${l} mm` }))}
      />
    </Section>
  );
};
