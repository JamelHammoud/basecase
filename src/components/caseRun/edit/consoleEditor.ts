import type { AddableKind, PanelChoice, PanelDrop } from '../../../cases/console/consoleEdits';
import type { PanelSpec } from '../../../cases/console/panelKinds';

export interface ConsoleEditor {
  move: (id: string, to: PanelDrop) => void;
  canMove: (id: string, to: PanelDrop) => boolean;
  resize: (at: number, size: number) => void;
  add: (kind: AddableKind, choice: PanelChoice, area?: number) => void;
  canAdd: (area?: number) => boolean;
  remove: (panel: PanelSpec) => void;
  rename: (id: string, title: string) => void;
  choices: (kind: AddableKind) => PanelChoice[];
}
