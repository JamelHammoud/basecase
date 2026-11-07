import React, { useEffect, useRef, useState } from 'react';
import { Button, ChevronLeftIcon, IconButton } from '../../../design-system';
import { hasPrimaryModifier } from '../../../utils/os';
import { SketchPalette, SKETCH_COLORS } from './SketchPalette';
import { InkedStroke } from './sketchStrokes';
import { useSketchCanvas } from './useSketchCanvas';

type PadAction = 'back' | 'done' | 'undo' | 'ignore';

const isUndoChord = (e: React.KeyboardEvent) => hasPrimaryModifier(e) && e.key.toLowerCase() === 'z';

const startedInside = (e: React.SyntheticEvent) => e.currentTarget.contains(e.target as Node);

function padAction(e: React.KeyboardEvent): PadAction | null {
  if (!startedInside(e)) return null;

  if (isUndoChord(e)) return e.shiftKey ? 'ignore' : 'undo';

  if (e.key === 'Escape') return 'back';

  return e.key === 'Enter' && !(e.target instanceof HTMLButtonElement) ? 'done' : null;
}

export const SketchPad: React.FC<{
  strokes: InkedStroke[];
  onStroke: (stroke: InkedStroke) => void;
  onUndo: () => void;
  onBack: () => void;
  onDone: () => void;
}> = ({ strokes, onStroke, onUndo, onBack, onDone }) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [color, setColor] = useState(SKETCH_COLORS[0].hex);
  const { canvasRef, canvasProps } = useSketchCanvas(strokes, color, onStroke);
  const isEmpty = strokes.length === 0;

  const focusPad = () => rootRef.current?.focus({ preventScroll: true });

  useEffect(focusPad, []);

  const actions: Record<PadAction, () => void> = {
    back: onBack,
    done: () => {
      if (!isEmpty) onDone();
    },
    undo: onUndo,
    ignore: () => undefined,
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const action = padAction(e);

    if (hasPrimaryModifier(e) && !action) return;

    e.stopPropagation();

    if (!action) return;

    e.preventDefault();
    actions[action]();
  };

  const keepPadFocus = (e: React.MouseEvent) => {
    if (startedInside(e)) e.preventDefault();
  };

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      data-own-edits
      role="group"
      aria-label="Sketch"
      onKeyDown={onKeyDown}
      className="outline-none animate-fade-in"
    >
      <div className="h-[200px] rounded-t-[20px] overflow-hidden">
        <canvas
          ref={canvasRef}
          aria-label="Sketch canvas"
          className="block w-full h-full touch-none cursor-crosshair"
          {...canvasProps}
        />
      </div>

      <div className="relative flex items-center gap-1 px-2 pb-2" onMouseDown={keepPadFocus}>
        <IconButton
          icon={<ChevronLeftIcon className="w-[18px] h-[18px]" />}
          title="Back"
          shortcut="Esc"
          tooltipSide="top"
          size="sm"
          className="rounded-full"
          onClick={onBack}
        />
        <SketchPalette color={color} onChange={setColor} onClosed={focusPad} />
        <div className="flex-1" />
        <Button
          variant="contrast"
          title="Done"
          shortcut="↩︎"
          tooltipSide="top"
          className="rounded-full"
          disabled={isEmpty}
          onClick={onDone}
        >
          Done
        </Button>
      </div>
    </div>
  );
};
