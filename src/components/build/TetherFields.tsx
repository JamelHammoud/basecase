import React from 'react';
import { NumberInput } from '../../design-system';
import type { Tether } from '../../types/robotics';
import type { TetherField } from './tetherRows';

export interface TetherControl {
  tether: Tether;
  onChange: (tether: Tether) => void;
}

const FIELDS: Record<TetherField, { label: string; title: string; min: number; max: number; step: number }> = {
  volts: { label: 'V', title: 'Supply voltage', min: 1, max: 100, step: 0.1 },
  amps: { label: 'A', title: 'Supply current', min: 0.5, max: 200, step: 0.5 },
};

export const TetherFields: React.FC<{ fields: TetherField[]; control: TetherControl }> = ({ fields, control }) => (
  <div className="pl-[31px] pr-[7px] pt-1 pb-1.5 flex gap-2">
    {fields.map((field) => (
      <div key={field} className="w-[112px]">
        <NumberInput
          label={FIELDS[field].label}
          value={control.tether[field]}
          min={FIELDS[field].min}
          max={FIELDS[field].max}
          step={FIELDS[field].step}
          precision={1}
          unit=""
          title={FIELDS[field].title}
          onChange={(value, live) => !live && control.onChange({ ...control.tether, [field]: value })}
        />
      </div>
    ))}
  </div>
);
