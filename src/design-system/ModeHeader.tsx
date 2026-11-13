import React from 'react';
import { Button } from './Button';

export const ModeHeader: React.FC<{ title: string; onDone: () => void; actions?: React.ReactNode }> = ({
  title,
  onDone,
  actions,
}) => (
  <div className="h-[44px] shrink-0 pl-[12px] pr-[8px] flex items-center justify-between gap-2">
    <h2 className="min-w-0 truncate text-[15px] font-semibold text-white/90">{title}</h2>
    <div className="flex items-center gap-2">
      {actions}
      <Button variant="primary" size="sm" title="Done" shortcut="Esc" onClick={onDone}>
        Done
      </Button>
    </div>
  </div>
);
