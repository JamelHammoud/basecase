import type React from 'react';

export function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[88px_1fr] items-center gap-2">
      <span className="text-[13px] text-white/50 truncate">{label}</span>
      {children}
    </label>
  );
}
