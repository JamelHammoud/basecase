import React from 'react';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export const Switch: React.FC<SwitchProps> = ({ checked, onChange, label, className = '', disabled = false }) => (
  <label
    className={`flex items-center justify-between gap-3 h-8 select-none ${
      disabled ? 'opacity-40 pointer-events-none' : 'cursor-default'
    } ${className}`}
  >
    {label && <span className="text-[13px] text-white/70 truncate">{label}</span>}
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-[30px] h-[18px] rounded-full shrink-0 transition-colors duration-200 ${
        checked ? 'bg-[#0d99ff]' : 'bg-white/[0.16]'
      }`}
    >
      <span
        className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.4)] transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${
          checked ? 'translate-x-[12px]' : ''
        }`}
      />
    </button>
  </label>
);
