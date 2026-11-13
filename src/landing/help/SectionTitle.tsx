import React from 'react';

export const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-[20px] leading-[1.3] font-semibold text-white/90">{children}</h2>
);
