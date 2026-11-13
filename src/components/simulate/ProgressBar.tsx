import React from 'react';

export const ProgressBar: React.FC<{ share: number }> = ({ share }) => (
  <div className="mt-1.5 h-1 rounded-full bg-white/[0.06] overflow-hidden">
    <div
      className="h-full bg-[#0d99ff] transition-[width] duration-300"
      style={{ width: `${Math.round(Math.min(1, share) * 100)}%` }}
    />
  </div>
);
