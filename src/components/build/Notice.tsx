import React from 'react';
import { AlertTriangle } from 'lucide-react';

const TONE_CLASS = {
  amber: 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/15',
  default: 'bg-white/[0.04] text-white/60 hover:bg-white/[0.07]',
};

export const Notice: React.FC<{ tone: 'amber' | 'default'; text: string; onClick: () => void }> = ({
  tone,
  text,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-start gap-2 text-left text-[12.5px] rounded-lg px-2.5 py-2 cursor-default transition-colors ${TONE_CLASS[tone]}`}
  >
    <AlertTriangle className="w-3.5 h-3.5 mt-[1px] shrink-0" />
    {text}
  </button>
);
