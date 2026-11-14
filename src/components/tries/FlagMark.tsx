import React from 'react';
import { Tooltip, WarningIcon } from '../../design-system';

export const FlagMark: React.FC<{ lines: string[] }> = ({ lines }) =>
  lines.length ? (
    <Tooltip
      label={
        <span className="flex flex-col">
          {lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
      }
    >
      <span className="h-[18px] flex items-center shrink-0" data-testid="try-flags">
        <WarningIcon className="w-4 h-4 text-amber-400" />
      </span>
    </Tooltip>
  ) : null;
