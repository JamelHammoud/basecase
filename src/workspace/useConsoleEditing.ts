import { useState } from 'react';
import {
  addPanel,
  checkedConsole,
  editableConsole,
  movePanel,
  removePanel,
  renamePanel,
  resizeArea,
  type PanelDraft,
  type PanelPlace,
} from '../cases/console/consoleEdits';
import type { CaseConsole } from '../cases/console/format';
import { panelLabel } from '../components/caseRun/panelChoices';
import { confirmAction } from '../design-system/confirmStore';
import type { ShowToast } from './types';
import type { CaseRun } from './useCaseRun';

interface EditingInput {
  caseRun: Pick<CaseRun, 'live' | 'kase'>;
  docs: { commitConsole: (caseId: string, console: CaseConsole | undefined) => void };
  showToast: ShowToast;
}

export interface ConsoleEditing {
  canvasAt: number;
  adding: { area?: number } | null;
  renaming: string | null;
  move: (id: string, to: PanelPlace) => void;
  resize: (area: number, size: number) => void;
  startAdd: (area?: number) => void;
  add: (draft: PanelDraft) => void;
  cancelAdd: () => void;
  remove: (id: string) => void;
  startRename: (id: string) => void;
  finishRename: (id: string, title: string | null) => void;
}

export function useConsoleEditing({ caseRun, docs, showToast }: EditingInput): ConsoleEditing | null {
  const [adding, setAdding] = useState<{ area?: number } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const kase = caseRun.live ? caseRun.kase : null;

  if (!kase) return null;

  const current = editableConsole(kase.console);

  const apply = (edit: (c: CaseConsole) => CaseConsole) => {
    const next = edit(editableConsole(kase.console));

    if (JSON.stringify(next) === JSON.stringify(current)) return;

    const checked = checkedConsole(kase, next);

    if (!checked.ok) {
      showToast(checked.problem, { tone: 'error' });

      return;
    }

    docs.commitConsole(kase.id, checked.kase.console);
  };

  const remove = (id: string) => {
    const panel = current.panels.find((p) => p.id === id);

    if (!panel) return;

    confirmAction({ title: `Delete ${panelLabel(panel)}?`, onConfirm: () => apply((c) => removePanel(c, id)) });
  };

  return {
    canvasAt: current.layout.areas.findIndex((a) => 'canvas' in a),
    adding,
    renaming,
    move: (id, to) => apply((c) => movePanel(c, id, to)),
    resize: (area, size) => apply((c) => resizeArea(c, area, size)),
    startAdd: (area) => setAdding({ area }),
    add: (draft) => {
      setAdding(null);
      apply((c) => addPanel(c, draft, adding?.area).console);
    },
    cancelAdd: () => setAdding(null),
    remove,
    startRename: setRenaming,
    finishRename: (id, title) => {
      setRenaming(null);

      if (title !== null) apply((c) => renamePanel(c, id, title));
    },
  };
}
