import { useEffect, useRef, useState } from 'react';
import { ColorSwatch, ColorSwatches, FloatingIsland, Tooltip } from '../../../design-system';
import { MARK_COLORS } from '../../../utils/markColors';

export const SKETCH_COLORS = [{ name: 'White', hex: '#ffffff' }, ...MARK_COLORS];

const isPickerPress = (target: Element) => target.closest('[role="dialog"]') !== null;

export function SketchPalette({
  color,
  onChange,
  onClosed,
}: {
  color: string;
  onChange: (hex: string) => void;
  onClosed: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const closeAfterPick = () => {
    setIsOpen(false);
    onClosed();
  };

  useEffect(() => {
    if (!isOpen) return undefined;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element;

      if (!rootRef.current?.contains(target) && !isPickerPress(target)) setIsOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;

      e.stopPropagation();
      setIsOpen(false);
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef}>
      <Tooltip label="Color" side="top">
        <ColorSwatch name="Color" fill={color} expanded={isOpen} onClick={() => setIsOpen((v) => !v)} />
      </Tooltip>
      {isOpen && (
        <FloatingIsland className="absolute left-2 bottom-full mb-1 h-10 rounded-full animate-pop-up">
          <ColorSwatches
            colors={SKETCH_COLORS}
            value={color}
            onChange={(hex) => onChange(hex)}
            onPicked={closeAfterPick}
          />
        </FloatingIsland>
      )}
    </div>
  );
}
