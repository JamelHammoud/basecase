import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RenameField } from './RenameField';

export interface FloatingFieldProps {
  x: number;
  y: number;
  name: string;
  label: string;
  onDone: (text: string | null) => void;
}

const WIDTH = 280;
const PAD = 8;

export const FloatingField: React.FC<FloatingFieldProps> = ({ x, y, name, label, onDone }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const height = ref.current?.getBoundingClientRect().height ?? 0;

    setAt({
      left: Math.max(PAD, Math.min(x, window.innerWidth - WIDTH - PAD)),
      top: Math.max(PAD, Math.min(y, window.innerHeight - height - PAD)),
    });
  }, [x, y]);

  return createPortal(
    <div
      ref={ref}
      data-testid="floating-field"
      className="glass-menu fixed z-[96] rounded-[14px] p-2 flex animate-pop-in"
      style={{ left: at?.left ?? x, top: at?.top ?? y, width: WIDTH, visibility: at ? 'visible' : 'hidden' }}
    >
      <RenameField name={name} label={label} className="h-[32px]" allowEmpty onDone={onDone} />
    </div>,
    document.body,
  );
};
