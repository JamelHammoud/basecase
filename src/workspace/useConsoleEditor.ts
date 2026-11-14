import { copyOf } from '../cases/console/codeEdits';
import type { CaseConsole } from '../cases/console/format';
import { DEFAULT_CONSOLE } from '../cases/console/layout';
import {
  addedPanel,
  checkedConsole,
  movedPanel,
  panelName,
  removedPanel,
  renamedPanel,
  resizedArea,
  type NewPanel,
  type PanelDrop,
} from '../cases/console/layoutEdits';
import type { PanelSpec } from '../cases/console/panelKinds';
import { confirmAction } from '../design-system';
import type { WorkspaceCore } from './useWorkspaceCore';

export interface ConsoleEdits {
  move: (id: string, drop: PanelDrop) => void;
  resize: (area: number, size: number) => void;
  rename: (id: string, title: string) => void;
  remove: (panel: PanelSpec) => void;
  add: (panel: NewPanel, area?: number) => boolean;
  addPanel: (area?: number) => void;
}

export function useConsoleEditor(core: WorkspaceCore): ConsoleEdits {
  const { cases } = core.simTraining;
  const { commitConsole } = core.docs;

  const apply = (change: (c: CaseConsole) => CaseConsole) => {
    const kase = cases.active;

    if (!kase) return false;

    const next = change(copyOf(kase.console));

    if (JSON.stringify(next) === JSON.stringify(kase.console ?? DEFAULT_CONSOLE)) return true;

    const checked = checkedConsole(kase, next);

    if (typeof checked === 'string') {
      core.showToast(checked);

      return false;
    }

    commitConsole(kase.id, checked.console);

    return true;
  };

  return {
    move: (id, drop) => apply((c) => movedPanel(c, id, drop)),
    resize: (area, size) => apply((c) => resizedArea(c, area, size)),
    rename: (id, title) => apply((c) => renamedPanel(c, id, title)),
    remove: (panel) =>
      confirmAction({
        title: `Delete ${panelName(panel)}?`,
        onConfirm: () => apply((c) => removedPanel(c, panel.id)),
      }),
    add: (panel, area) => apply((c) => addedPanel(c, panel, area).console),
    addPanel: core.caseRun.addPanel,
  };
}
