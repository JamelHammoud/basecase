import React from 'react';

type Tone = 'accent' | 'warning' | 'danger';

const FILL: Record<Tone, string> = {
  accent: 'bg-[#0d99ff]',
  warning: 'bg-amber-400',
  danger: 'bg-red-500',
};

const widthOf = (share: number) => `${Math.min(1, Math.max(0, share)) * 100}%`;

export const ProgressBar: React.FC<{
  share: number;
  behind?: number;
  tone?: Tone;
  label?: string;
  className?: string;
}> = ({ share, behind, tone = 'accent', label, className = '' }) => (
  <div
    className={`relative h-1.5 rounded-full bg-white/[0.07] overflow-hidden ${className}`}
    role={label ? 'progressbar' : undefined}
    aria-label={label}
    aria-valuenow={label ? Math.round(Math.min(1, Math.max(0, share)) * 100) : undefined}
    aria-hidden={label ? undefined : true}
  >
    {behind !== undefined && (
      <div
        className={`absolute inset-y-0 left-0 rounded-full opacity-35 transition-[width] duration-200 ${FILL[tone]}`}
        style={{ width: widthOf(behind) }}
      />
    )}
    <div
      className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-200 ${FILL[tone]}`}
      style={{ width: widthOf(share) }}
    />
  </div>
);
