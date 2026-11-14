import { useRef, useState } from 'react';
import type { PlacedArea } from '../../cases/console/layout';

export function useAreaResize(area: PlacedArea, resize: ((at: number, size: number) => void) | undefined) {
  const [live, setLive] = useState<number | null>(null);
  const pending = useRef<number | null>(null);
  const dragging = useRef(false);

  const onResize = (size: number) => {
    if (!dragging.current) {
      resize?.(area.at, size);

      return;
    }

    pending.current = size;
    setLive(size);
  };

  const onResizingChange = (on: boolean) => {
    dragging.current = on;

    if (on) return;

    const size = pending.current;

    pending.current = null;
    setLive(null);

    if (size !== null) resize?.(area.at, size);
  };

  return { size: live ?? area.size, onResize, onResizingChange };
}
