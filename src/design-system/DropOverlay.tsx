import React from 'react';

export const DropOverlay: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <div className="absolute inset-2 z-40 rounded-2xl border-2 border-dashed border-[#0d99ff]/70 bg-[#0d99ff]/[0.06] flex items-center justify-center pointer-events-none animate-fade-in">
    <div className="glass rounded-2xl px-5 py-3 flex items-center gap-2.5 text-[14px] text-white/90">
      <span className="w-5 h-5 shrink-0 flex items-center justify-center text-[#5cb8ff]">{icon}</span>
      {label}
    </div>
  </div>
);
