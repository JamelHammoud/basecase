import React from 'react';

export interface FloatingIslandProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
}

/** Liquid Glass container for controls floating over the 3D canvas. */
export const FloatingIsland: React.FC<FloatingIslandProps> = ({
  children,
  className = '',
  style,
  ...props
}) => {
  return (
    <div
      className={`glass rounded-2xl p-1 flex items-center gap-0.5 select-none ${className}`}
      style={{ WebkitAppRegion: 'no-drag', ...style } as React.CSSProperties}
      {...props}
    >
      {children}
    </div>
  );
};

/** Hairline separator between groups inside a FloatingIsland */
export const IslandDivider: React.FC = () => (
  <div className="w-px h-5 bg-white/[0.1] mx-1 shrink-0" aria-hidden />
);
