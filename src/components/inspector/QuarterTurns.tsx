import React from 'react';
import { RotateRightIcon } from '../../design-system';
import type { Axis } from '../../utils/selection';
import { StripButton, StripGroup } from '../AlignBar';

export const QuarterTurns: React.FC<{ onTurn: (axis: Axis) => void }> = ({ onTurn }) => (
  <StripGroup>
    {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
      <StripButton key={axis} title={`Rotate 90° around ${axis}`} onClick={() => onTurn(idx as Axis)}>
        <RotateRightIcon className="w-3.5 h-3.5" />
        <span className="tabular">
          {axis} <span className="text-white/50">90°</span>
        </span>
      </StripButton>
    ))}
  </StripGroup>
);
