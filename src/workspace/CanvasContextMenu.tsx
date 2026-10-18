import { ContextMenu } from '../design-system';
import { contextMenuItems, type ContextInputs } from './contextMenuItems';
import type { CanvasMenuState } from './useCanvasMenu';

interface CanvasContextMenuProps {
  menu: CanvasMenuState | null;
  inputs: ContextInputs;
  onClose: () => void;
}

export function CanvasContextMenu({ menu, inputs, onClose }: CanvasContextMenuProps) {
  if (!menu) return null;

  return <ContextMenu x={menu.x} y={menu.y} items={contextMenuItems(menu, inputs)} onClose={onClose} />;
}
