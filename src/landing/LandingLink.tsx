import React from 'react';

interface LandingLinkProps {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  external?: boolean;
}

const VARIANTS = {
  primary: 'bg-white text-black active:bg-white/85',
  secondary: 'bg-white/[0.07] text-white/90 active:bg-white/[0.11]',
};

export const LandingLink: React.FC<LandingLinkProps> = ({ href, icon, children, variant = 'secondary', external }) => (
  <a
    href={href}
    target={external ? '_blank' : undefined}
    rel={external ? 'noopener noreferrer' : undefined}
    className={`h-[50px] rounded-[14px] flex items-center justify-center gap-[8px] text-[16px] font-medium no-underline select-none transition-[background-color,transform] duration-150 active:scale-[0.97] ${VARIANTS[variant]}`}
  >
    {icon}
    {children}
  </a>
);
