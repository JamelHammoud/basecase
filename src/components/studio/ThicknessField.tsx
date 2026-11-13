import React from 'react';
import { NumberInput } from '../../design-system';

const keepNonZero = (v: number, prev: number) => (Math.abs(v) < 0.1 ? prev : v);

export const ThicknessField: React.FC<{ value: number; min: number; onChange: (v: number) => void }> = ({
  value,
  min,
  onChange,
}) => (
  <NumberInput
    label="T"
    title="Thickness"
    value={value}
    min={min}
    max={250}
    precision={1}
    onChange={(v) => onChange(keepNonZero(v, value))}
  />
);
