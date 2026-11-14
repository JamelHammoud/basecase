import type React from 'react';
import type { PanelSpec } from '../../cases/console/panelKinds';
import type { ConsoleEdits } from '../../workspace/useConsoleEditor';
import type { PanelDrag } from './usePanelDrag';

export interface ConsoleEditor extends ConsoleEdits {
  drag: PanelDrag | null;
  startDrag: (e: React.PointerEvent<HTMLElement>, panel: PanelSpec) => void;
}

export const AREA_DEFAULT = 328;

export const ADD_PANEL = 'Add Panel';
