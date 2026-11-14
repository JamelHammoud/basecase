import React from 'react';
import { Button } from './Button';
import type { TooltipSide } from './Tooltip';

export interface FloatingIslandProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
}

export const FloatingIsland: React.FC<FloatingIslandProps> = ({ children, className = '', style, ...props }) => {
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

export const IslandDivider: React.FC = () => <div className="w-px h-5 bg-white/[0.1] mx-1 shrink-0" aria-hidden />;

export const IslandDone: React.FC<{ onDone: () => void; tooltipSide?: TooltipSide; className?: string }> = ({
  onDone,
  tooltipSide = 'top',
  className = '',
}) => (
  <>
    <IslandDivider />
    <Button
      size="sm"
      variant="ghost"
      className={className}
      onClick={onDone}
      title="Done"
      shortcut="Esc"
      tooltipSide={tooltipSide}
    >
      Done
    </Button>
  </>
);
