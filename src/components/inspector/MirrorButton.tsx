import React, { useRef, useState } from 'react';
import { IconButton, MirrorIcon, PopoverMenu } from '../../design-system';
import { lastPlaneView, type PlaneView } from '../../mirror/plane';
import { MirrorPlaneItems } from '../MirrorPlaneItems';

export const MirrorButton: React.FC<{ onMirror: (view: PlaneView) => void }> = ({ onMirror }) => {
  const [current, setCurrent] = useState<PlaneView | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const pick = (view: PlaneView) => {
    setCurrent(null);
    onMirror(view);
  };

  return (
    <div ref={ref} className="relative">
      <IconButton
        icon={<MirrorIcon className="w-3.5 h-3.5" />}
        title="Mirror"
        size="xs"
        aria-expanded={!!current}
        onClick={() => setCurrent(current ? null : lastPlaneView())}
      />
      <PopoverMenu
        isOpen={!!current}
        onClose={() => setCurrent(null)}
        ignoreRef={ref}
        position="bottom"
        align="end"
        className="w-44"
      >
        {current && <MirrorPlaneItems current={current} onPick={pick} />}
      </PopoverMenu>
    </div>
  );
};
