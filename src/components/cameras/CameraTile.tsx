import React from 'react';
import { lensLabel } from '../../cameras/lens';
import type { CameraView } from '../../cameras/views';
import { RenameField } from '../pose/RenameField';

export interface CameraTileProps {
  view: CameraView;
  large: boolean;
  fill?: boolean;
  renaming: boolean;
  onRename: (name: string) => void;
  canvasRef: (canvas: HTMLCanvasElement | null) => void;
  onToggleSize: () => void;
  onMenu: (x: number, y: number) => void;
}

export const chip = 'rounded-md bg-black/65 px-1.5 h-6 leading-6 text-[12px]';

const tileWidth = (fill: boolean | undefined, large: boolean) => {
  if (fill) return 'w-full';

  return large ? 'w-[384px]' : 'w-[192px]';
};

export const tileShell = (fill: boolean | undefined, large: boolean) =>
  `group/tile relative overflow-hidden rounded-[10px] bg-[#1a1a1a] ${
    fill ? '' : 'shadow-[0_8px_24px_rgba(0,0,0,0.45)]'
  } ${tileWidth(fill, large)} aspect-[4/3]`;

export const tileLabel = `pointer-events-none absolute left-1.5 top-1.5 max-w-[calc(100%-12px)] truncate font-medium text-white/90 ${chip}`;

export const CameraTile: React.FC<CameraTileProps> = ({ view, large, fill, renaming, onRename, canvasRef, ...on }) => (
  <div data-testid="camera-tile" data-camera={view.key} className={tileShell(fill, large)}>
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
      className={`pointer-events-none absolute right-1.5 bottom-1.5 text-white/70 tabular opacity-0 group-hover/tile:opacity-100 transition-opacity ${chip}`}
    >
      {lensLabel(view.lens)}
    </span>
  </div>
);
