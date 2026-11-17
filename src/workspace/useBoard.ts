import { useBoardRouting } from './useBoardRouting';
import { useRoutedBoard } from './useRoutedBoard';
import { useRef } from 'react';
import { electricalClient } from '../wiring/electricalClient';
import { electricalSnapshot } from '../wiring/electricalSnapshot';
import { electricalSourceJson } from '../wiring/electricalSource';
import type { ElectronicsBoard } from '../wiring/boardTypes';
import type { WorkspaceCore } from './useWorkspaceCore';
import { newId } from './helpers';
import { errorMessage } from '../utils/errorMessage';
import { mountedBoardParts } from '../wiring/boardMounts';
import { reconcileBoardHardware } from '../wiring/boardHardware';

export function useBoard(core: WorkspaceCore) {
  'use memo';

  const busy = useRef(false);
  const importBoard = useRoutedBoard(core);
  const route = useBoardRouting(core);
  const select = (id: string) => {
    core.setSelectedIds([id]);
    core.tool.openRightTab('inspector');
  };
  const prepare = async (mode: 'define' | 'place') => {
    if (busy.current) return;

    busy.current = true;

    const parts = core.docs.partsRef.current;
    const project = core.docs.projectRef.current;
    const snapshot = electricalSnapshot({ parts, project });
    const key = electricalSourceJson(snapshot.project);
    const client = electricalClient();

    try {
      const result =
        mode === 'define'
          ? await client.call('define', { ...snapshot, boardId: newId('board') })
          : await client.call('place', snapshot);
      const current = core.docs.projectRef.current;

      if (
        parts !== core.docs.partsRef.current ||
        key !== electricalSourceJson(electricalSnapshot({ parts, project: current }).project)
      )
        return;

      const added = 'hardwareParts' in result ? [result.part, ...result.hardwareParts] : [];

      core.docs.commitBoard(mountedBoardParts([...parts, ...added], result.board), result.board);
      select(result.board.partId);
    } catch (error) {
      core.showToast(errorMessage(error), { tone: 'error' });
    } finally {
      client.dispose();
      busy.current = false;
    }
  };
  const define = async () => {
    const existing = core.docs.projectRef.current.electronicsBoard;

    if (existing) return select(existing.partId);

    await prepare('define');
  };
  const update = (board: ElectronicsBoard) => {
    const project = core.docs.projectRef.current;
    const currentParts = core.docs.partsRef.current;
    const before = project.electronicsBoard;

    if (
      electricalSourceJson(boardPlacementDefinition(before)) === electricalSourceJson(boardPlacementDefinition(board))
    ) {
      core.docs.commitBoard(currentParts, board);

      return;
    }

    const parts = reconcileBoardHardware({
      parts: currentParts,
      before,
      after: board,
    });

    core.docs.commitBoard(mountedBoardParts(parts, board), board);
  };

  return { define, select, update, importBoard, route, arrange: () => prepare('place') };
}

function boardPlacementDefinition(board: ElectronicsBoard | undefined) {
  return { ...board, routed: undefined, routing: undefined, fabrication: undefined };
}
