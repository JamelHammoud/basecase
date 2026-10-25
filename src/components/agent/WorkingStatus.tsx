import React from 'react';
import { SHIMMER_TEXT } from './shimmer';

export const WorkingStatus: React.FC<{ status: string; started: boolean }> = ({ status, started }) => (
  <div className="flex items-center gap-2 h-6 text-[13.5px]">
    <span className={SHIMMER_TEXT}>{status || (started ? 'Working…' : 'Thinking…')}</span>
  </div>
);
