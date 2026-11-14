import {
  addPanel,
  deletePanel,
  fits,
  handEdited,
  movePanel,
  panelChoices,
  panelName,
  renamePanel,
  resizeArea,
  roomToAdd,
} from '../cases/console/consoleEdits';
import type { CaseConsole } from '../cases/console/format';
import { signalNamesOf } from '../cases/console/signalNames';
import { readCases } from '../cases/schema';
import type { ConsoleEditor } from '../components/caseRun/edit/consoleEditor';
import type { PanelContext } from '../components/caseRun/panelContext';
import { confirmAction } from '../design-system';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useConsoleEditor(core: WorkspaceCore, ctx: Pick<PanelContext, 'bus' | 'scope' | 'joints'>) {
  const kase = core.simTraining.cases.active;
  const { docs } = core;

  const edit = (change: (current: CaseConsole | undefined) => CaseConsole | null) => {
    const latest = kase && readCases(docs.projectRef.current.cases).find((c) => c.id === kase.id);

    if (!latest) return;

    const next = handEdited(latest, change(latest.console));

    if (next) docs.commitConsole(next.id, next.console);
  };

  const editor: ConsoleEditor = {
    move: (id, to) => edit((c) => movePanel(c, id, to)),
    canMove: (id, to) => fits(movePanel(kase?.console, id, to)),
    resize: (at, size) => edit((c) => resizeArea(c, at, size)),
    add: (kind, choice, area) => edit((c) => addPanel(c, { kind, choice, area })),
    canAdd: (area) => !!kase && roomToAdd(kase.console, area),
    rename: (id, title) => edit((c) => renamePanel(c, id, title)),
    remove: (panel) =>
      confirmAction({
        title: `Delete ${panelName(panel)}?`,
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
