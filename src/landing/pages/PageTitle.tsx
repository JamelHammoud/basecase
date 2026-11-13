import React from 'react';

export const PageTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <header className="mt-[56px] sm:mt-[72px]">
    <h1 className="text-[34px] sm:text-[44px] leading-[1.08] font-semibold tracking-[-0.025em] text-white/90">
      {children}
    </h1>
  </header>
);
