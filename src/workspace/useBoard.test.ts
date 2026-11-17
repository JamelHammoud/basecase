import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { defineBoard } from '../wiring/boardDefinition';
import { electricalScenes } from '../wiring/electricalFixtures';
import { mountedBoardParts, boardMountingFindings } from '../wiring/boardMounts';
import { useBoard } from './useBoard';
import type { WorkspaceCore } from './useWorkspaceCore';
import type { ElectronicsBoard } from '../wiring/boardTypes';

function session() {
  const scene = electricalScenes().find((entry) => entry.name === 'battery-rover')!.scene;
  const { board, part, hardwareParts } = defineBoard(scene, 'board');

  board.routed = {
    schema: 1,
    pcb: '(kicad_pcb)',
    hash: 'a'.repeat(64),
    sourceFingerprint: 'b'.repeat(64),
    rules: null,
  };

  const parts = mountedBoardParts([...scene.parts, part, ...hardwareParts], board).map((item) =>
    item.id === 'buck' ? { ...item, position: [100, 100, 100] as [number, number, number] } : item,
  );
  const commitBoard = vi.fn();
  const core = {
    parts,
    project: { ...scene.project, electronicsBoard: board },
    docs: {
      partsRef: { current: parts },
      projectRef: { current: { ...scene.project, electronicsBoard: board } },
      commitBoard,
    },
  } as unknown as WorkspaceCore;
  const actions: { current?: ReturnType<typeof useBoard> } = {};
  const Host = () => {
    actions.current = useBoard(core);

    return null;
  };

  renderToStaticMarkup(createElement(Host));

  return { board, parts, commitBoard, actions: actions.current! };
}

it('preserves detached module poses and part identities when fabrication inputs change', () => {
  const { board, parts, commitBoard, actions } = session();
  const next: ElectronicsBoard = {
    ...board,
    routed: {
      ...board.routed!,
      rules: { source: 'https://example.com/process', clearanceMm: 0.2, trackWidthMm: 0.25, drillMm: 0.3 },
    },
  };

  actions.update(next);
  expect(commitBoard).toHaveBeenCalledWith(parts, next);
  expect(commitBoard.mock.calls[0][0]).toBe(parts);
  expect(boardMountingFindings(parts, next).some((finding) => finding.code === 'board-stale-placement')).toBe(true);
  expect(board.routed!.rules).toBeNull();
});

it('continues to mount modules and hardware when the board placement changes', () => {
  const { board, parts, commitBoard, actions } = session();
  const next = { ...board, side: 'bottom' as const };

  actions.update(next);

  const [updated, committed] = commitBoard.mock.calls[0];

  expect(committed).toBe(next);
  expect(updated).not.toBe(parts);
  expect(boardMountingFindings(updated, next)).toEqual([]);
  expect(parts.find((part) => part.id === 'buck')!.position).toEqual([100, 100, 100]);
});
