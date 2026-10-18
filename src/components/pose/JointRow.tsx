import React, { useState } from 'react';
import type { RobotJoint } from '../../types/robotics';
import { jointUnit } from '../../utils/kinematics';

const jointRange = (joint: RobotJoint): [number, number] => {
  if (joint.range) return [Math.min(...joint.range), Math.max(...joint.range)];

  return joint.type === 'prismatic' ? [-100, 100] : [-180, 180];
};

export const JointRow: React.FC<{
  joint: RobotJoint;
  label: string;
  value: number;
  active: boolean;
  onSelect: () => void;
  onChange: (v: number) => void;
}> = ({ joint, label, value, active, onSelect, onChange }) => {
  const unit = jointUnit(joint);
  const [lo, hi] = jointRange(joint);
  const fill = ((value - lo) / Math.max(hi - lo, 1e-6)) * 100;
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;

    const n = Number(draft.replace(/[^\d.+-]/g, ''));

    if (Number.isFinite(n)) onChange(n);

    setDraft(null);
  };

  return (
    <div
      data-joint={joint.id}
      className={`-mx-[6px] px-[6px] rounded-lg grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_52px] items-center gap-2.5 h-8 scroll-my-3 ${active ? 'bg-[#0d99ff]/[0.12]' : ''}`}
    >
      <button
        type="button"
        onClick={onSelect}
        className={`text-left text-[13px] truncate cursor-default ${active ? 'text-white' : 'text-white/60 hover:text-white/85'}`}
      >
        {label}
      </button>
      <input
        type="range"
        className="slider"
        min={lo}
        max={hi}
        step={joint.type === 'prismatic' ? 0.5 : 1}
        value={value}
        aria-label={label}
        style={{ '--fill': `${fill}%` } as React.CSSProperties}
        onPointerDown={onSelect}
        onDoubleClick={() => onChange(0)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <input
        value={draft ?? `${Math.round(value * 10) / 10}${unit === '°' ? '°' : ''}`}
        onFocus={(e) => {
          setDraft(String(Math.round(value * 10) / 10));
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();

          if (e.key === 'Escape') {
            setDraft(null);
            (e.target as HTMLInputElement).blur();
          }
        }}
        aria-label={`${label} ${unit === '°' ? 'degrees' : 'mm'}`}
        className="h-7 w-full rounded-md bg-white/[0.05] hover:bg-white/[0.07] focus:bg-black/20 px-1.5 text-right text-[13px] text-white/90 tabular outline-none ring-1 ring-inset ring-transparent focus:ring-[#0d99ff]"
      />
    </div>
  );
};
