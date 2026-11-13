import React from 'react';
import { Badge } from '../design-system';
import type { CalibrationVerdict } from '../reality/types';

export const VERDICTS: Record<CalibrationVerdict, string> = {
  measured: 'Measured',
  consistent: 'Consistent with preset',
  'cant-tell': 'Can’t tell',
};

export const MeasuredBadge: React.FC = () => (
  <Badge variant="blue" className="shrink-0">
    {VERDICTS.measured}
  </Badge>
);
