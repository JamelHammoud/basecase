import React, { useId } from 'react';
import { HardwareSpec, heatInsert, stockLengths } from '../data/hardware';
import { ChoiceGrid, MetaLine, Section } from '../design-system';

export const InsertLengthSection: React.FC<{
  spec: HardwareSpec;
  set: (next: Partial<HardwareSpec>) => void;
}> = ({ spec, set }) => {
  const titleId = useId();
  const lengths = stockLengths(spec);
  const insert = heatInsert(spec);

  return (
    <Section
      title="Length"
      titleId={titleId}
      actions={
        <MetaLine items={[insert.label, `Ø${insert.od} mm`]} className="mr-1 text-[12.5px] text-white/50 tabular" />
      }
    >
      <ChoiceGrid
        aria-labelledby={titleId}
        columns={Math.max(3, lengths.length)}
        value={String(insert.l)}
        onChange={(l) => set({ length: Number(l) })}
        options={lengths.map((l) => ({ value: String(l), label: `${l} mm` }))}
      />
    </Section>
  );
};
