import React from 'react';

export const EntryImage: React.FC<{ src: string; alt: string; className?: string }> = ({ src, alt, className }) => (
  <img src={src} alt={alt} loading="lazy" className={`w-full rounded-[12px] bg-white/[0.04] ${className ?? ''}`} />
);
