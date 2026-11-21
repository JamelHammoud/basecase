import { describe, expect, it } from 'vitest';
import { electricalScenes } from './electricalFixtures';
import { defineBoard } from './boardDefinition';
import { mountedBoardParts } from './boardMounts';
import { buildBom } from '../utils/bom';
import { boardHardwareFindings, newBoardHole, reconcileBoardHardware } from './boardHardware';

describe('carrier mounting hardware', () => {
  it('adds and removes owned hardware atomically with its hole, without recreating a manually removed piece', () => {
    const scene = electricalScenes()[0].scene;
    const { part, board, hardwareParts } = defineBoard(scene, 'board');
    const parts = [...scene.parts, part, ...hardwareParts];
    const after = { ...board, holes: [...board.holes, newBoardHole()] };
    const added = reconcileBoardHardware({ parts, before: board, after });

    expect(added).toHaveLength(parts.length + 2);
    expect(reconcileBoardHardware({ parts: added, before: after, after: board })).toEqual(parts);
    expect(reconcileBoardHardware({ parts: parts.slice(0, -1), before: board, after: board })).toEqual(
      parts.slice(0, -1),
    );
  });

  it('uses ordinary catalog hardware parts and counts each purchased piece once', () => {
    const scene = electricalScenes().find((entry) => entry.name === 'battery-rover')!.scene;
    const { part, board, hardwareParts } = defineBoard(scene, 'board');
    const parts = mountedBoardParts([...scene.parts, part, ...hardwareParts], board);
    const bom = buildBom({
      parts,
      project: { ...scene.project, electronicsBoard: board },
      measures: {},
      purchases: {},
    });

    expect(hardwareParts).toHaveLength(8);
    expect(bom.lines.filter((line) => line.category === 'Hardware').map((line) => line.qty)).toEqual([4, 4]);
    expect(boardHardwareFindings(parts, board)).toEqual([]);

    part.dimensions.height = 5;
    expect(boardHardwareFindings(parts, board).length).toBeGreaterThan(0);
  });

  it('retains missing and substituted hardware as unresolved mounting requirements', () => {
    const scene = electricalScenes()[0].scene;
    const { part, board, hardwareParts } = defineBoard(scene, 'board');
    const parts = [...scene.parts, part, ...hardwareParts.slice(1)];

    hardwareParts[1].hardware!.length = 20;
    expect(boardHardwareFindings(parts, board).length).toBeGreaterThan(0);
    expect(board.holes).toHaveLength(4);
  });
});
