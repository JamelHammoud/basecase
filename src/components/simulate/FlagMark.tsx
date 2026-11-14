import React from 'react';
import { Tooltip, WarningIcon } from '../../design-system';
import type { FlagKind, QualityFlag } from '../../cases/tryLabels';
import { runClock } from '../../utils/duration';

const FLAG_LABEL: Record<FlagKind, string> = {
  'joint-limit': 'At its limit',
  'frame-gap': 'Frames missing',
  effort: 'At a servo’s torque limit',
  idle: 'Still for over 2 s',
  model: 'From an earlier design',
};

interface FlagMarkProps {
  flags: QualityFlag[];
  jointName: (id: string) => string;
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

function flagLine(flag: QualityFlag, jointName: (id: string) => string) {
  const label = FLAG_LABEL[flag.kind];
  const what = flag.joint ? `${jointName(flag.joint)} ${lowerFirst(label)}` : label;

  return `${what}, ${runClock(flag.at)}`;
}

export const FlagMark: React.FC<FlagMarkProps> = ({ flags, jointName }) => {
  if (!flags.length) return null;

  return (
    <Tooltip
      label={
        <span className="flex flex-col">
          {flags.slice(0, 6).map((flag) => (
            <span key={`${flag.kind}-${flag.joint ?? ''}-${flag.at}`}>{flagLine(flag, jointName)}</span>
          ))}
        </span>
      }
    >
      <span data-testid="try-flags" data-flags={flags.map((f) => f.kind).join(' ')} className="shrink-0 flex">
        <WarningIcon className="w-4 h-4 text-amber-400" />
      </span>
    </Tooltip>
  );
};
