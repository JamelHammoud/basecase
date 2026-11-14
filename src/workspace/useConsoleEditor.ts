import {
  addPanel,
  checkedConsole,
  deletePanel,
  movePanel,
  panelChoices,
  renamePanel,
  resizeArea,
} from '../cases/console/consoleEdits';
import type { ConsoleEdit } from '../cases/console/codeEdits';
import type { CaseConsole } from '../cases/console/format';
import { signalNamesOf } from '../cases/console/signalNames';
import type { ConsoleEditor } from '../components/caseRun/edit/consoleEditor';
import type { PanelContext } from '../components/caseRun/panelContext';
import { confirmAction } from '../design-system';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useConsoleEditor(core: WorkspaceCore, ctx: Pick<PanelContext, 'bus' | 'scope' | 'joints'>) {
  const kase = core.simTraining.cases.active;

  const edit = (change: (current: CaseConsole | undefined) => ConsoleEdit) => {
    if (!kase) return;

    const next = checkedConsole(kase, change(kase.console));

    if (typeof next === 'string') {
      core.showToast(next);

      return;
    }

    core.docs.commitConsole(next.id, next.console);
  };

  const editor: ConsoleEditor = {
    move: (id, to) => edit((c) => movePanel(c, id, to)),
    resize: (at, size) => edit((c) => resizeArea(c, at, size)),
    add: (kind, choice, area) => edit((c) => addPanel(c, { kind, choice, area })),
    rename: (id, title) => edit((c) => renamePanel(c, id, title)),
    remove: (panel) =>
      confirmAction({
        title: `Delete ${panel.title ?? panel.id}?`,
        onConfirm: () => edit((c) => deletePanel(c, panel.id)),
      }),
    choices: (kind) => {
      const names = signalNamesOf(
        ctx.scope,
        ctx.joints.map((j) => j.id),
        ctx.bus.names(),
      );

      return panelChoices(kind, names, ctx.scope);
    },
  };

  return editor;
}
