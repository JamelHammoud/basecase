import React from 'react';
import { CircleCheckIcon, CircleCloseIcon, CircleMinusIcon, Spinner, WarningIcon } from '../../design-system';
import type { CheckStatus } from '../../readiness/types';

const ICONS: Record<CheckStatus, React.ReactNode> = {
  pass: <CircleCheckIcon className="w-4 h-4 text-emerald-400" />,
  warn: <WarningIcon className="w-4 h-4 text-amber-400" />,
  fail: <CircleCloseIcon className="w-4 h-4 text-red-400" />,
  'not run': <CircleMinusIcon className="w-4 h-4 text-white/35" />,
};

export const CheckIcon: React.FC<{ status: CheckStatus | 'checking' }> = ({ status }) => (
  <span className="h-[18px] flex items-center shrink-0">
    {status === 'checking' ? <Spinner className="w-4 h-4 text-white/35" /> : ICONS[status]}
  </span>
);
