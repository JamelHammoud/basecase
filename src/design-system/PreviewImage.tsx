import React from 'react';

export const PreviewImage: React.FC<{ src: string | undefined; className?: string }> = ({ src, className = '' }) => {
  if (src) return <img src={src} alt="" draggable={false} className={`w-full h-full object-contain ${className}`} />;

  if (src === undefined) return <span className="block w-full h-full shimmer" />;

  return null;
};
