import React from 'react';
import { Tooltip } from './Tooltip';

export type StatusTone = 'live' | 'problem';

export interface Status {
  tone: StatusTone;
  label: string;
}

const TONE_FILL: Record<StatusTone, string> = {
  live: 'bg-figma-blue',
  problem: 'bg-red-400',
};

export const StatusDot: React.FC<Status> = ({ tone, label }) => (
  <Tooltip label={label}>
    <span role="img" aria-label={label} className={`inline-block w-1.5 h-1.5 rounded-full ${TONE_FILL[tone]}`} />
  </Tooltip>
);
