import React from 'react';
import { lensLabel } from '../../cameras/lens';
import { RenameField } from '../../design-system';
import type { CameraView } from '../../cameras/views';
import { tileChip, tileFrame, tileLabel } from './tileStyle';

export interface CameraTileProps {
  view: CameraView;
  large: boolean;
  fill?: boolean;
  renaming: boolean;
  onRename: (name: string | null) => void;
  canvasRef: (canvas: HTMLCanvasElement | null) => void;
  onToggleSize: () => void;
  onMenu: (x: number, y: number) => void;
}

export const CameraTile: React.FC<CameraTileProps> = ({ view, large, fill, renaming, onRename, canvasRef, ...on }) => (
  <div data-testid="camera-tile" data-camera={view.key} className={tileFrame(fill, large)}>
    <button
      type="button"
      aria-label={view.label}
      onClick={on.onToggleSize}
      onContextMenu={(e) => {
        e.preventDefault();
        on.onMenu(e.clientX, e.clientY);
      }}
      className="absolute inset-0 block cursor-default"
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
    </button>
    {renaming ? (
      <div className="absolute left-1.5 right-1.5 top-1.5 flex">
        <RenameField name={view.label} onDone={onRename} />
      </div>
    ) : (
      <span className={tileLabel}>{view.label}</span>
    )}
    <span
      className={`pointer-events-none absolute right-1.5 bottom-1.5 text-white/70 tabular opacity-0 group-hover/tile:opacity-100 transition-opacity ${tileChip}`}
    >
      {lensLabel(view.lens)}
    </span>
  </div>
);
