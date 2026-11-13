import React from 'react';

interface PageTitleProps {
  children: React.ReactNode;
  back?: { href: string; label: string };
  breadcrumb?: React.ReactNode;
}

export const PageTitle: React.FC<PageTitleProps> = ({ children, back, breadcrumb }) => (
  <header className="mt-[56px] sm:mt-[72px]">
    {back && (
      <a href={back.href} className="mb-[14px] inline-block text-[14px] text-white/50 hover:text-white/90">
        {back.label}
      </a>
    )}
    {breadcrumb}
    <h1 className="text-[34px] sm:text-[44px] leading-[1.08] font-semibold tracking-[-0.025em] text-white/90">
      {children}
    </h1>
  </header>
);
