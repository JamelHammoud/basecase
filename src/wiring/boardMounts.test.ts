import { describe, expect, it } from 'vitest';
import { electricalScenes } from './electricalFixtures';
import { defineBoard } from './boardDefinition';
import { mountedBoardParts } from './boardMounts';
import { projectBoard } from './boardProjection';

function fixture() {
  const scene = electricalScenes().find((entry) => entry.name === 'battery-rover')!.scene;
  const { board, part } = defineBoard(scene, 'board');

  return {
    ...scene,
    parts: mountedBoardParts([...scene.parts, part], board),
    project: { ...scene.project, electronicsBoard: board },
  };
}

describe('physical module placement', () => {
  it('does not move an unrelated part named by an unsupported module binding', () => {
    const input = fixture();
    const board = input.project.electronicsBoard;
    const base = input.parts.find((part) => part.id === 'base')!;

    board.placements[0].bindings[0].partId = base.id;

    expect(mountedBoardParts(input.parts, board).find((part) => part.id === base.id)).toBe(base);
    expect(projectBoard(input).requirements.some((item) => item.code === 'board-mapping')).toBe(true);
  });

  it('retains changed module geometry as a mounting blocker', () => {
    const input = fixture();
    const module = input.parts.find((part) => part.id === 'buck')!;

    module.dimensions.width *= 2;
    expect(projectBoard(input).requirements.some((item) => item.code === 'board-mounting')).toBe(true);
    expect(mountedBoardParts(input.parts, input.project.electronicsBoard).find((part) => part.id === module.id)).toBe(
      module,
    );
  });

  it.each(['top', 'bottom'] as const)('follows the board frame on the %s side', (side) => {
    const input = fixture();
    const board = input.project.electronicsBoard;
    const host = input.parts.find((part) => part.id === 'board')!;

    board.side = side;
    host.position = [100, 70, -35];
    host.rotation = [23, 57, 91];

    for (const rotation of [0, 90, 180, 270] as const) {
      board.placements[0].rotation = rotation;
      input.parts = mountedBoardParts(input.parts, board);
      expect(projectBoard(input).requirements.filter((item) => item.code === 'board-stale-placement')).toEqual([]);
      expect(mountedBoardParts(input.parts, board)).toEqual(input.parts);
    }
  });

  it.each(['position', 'rotation'] as const)('blocks a module whose %s no longer matches the board', (field) => {
    const input = fixture();
    const part = input.parts.find((item) => item.id === 'buck')!;

    part[field][0] += 1;

    const findings = projectBoard(input).requirements.filter((item) => item.code === 'board-stale-placement');

    expect(findings).toHaveLength(1);
    expect(findings[0].partIds).toEqual(['board', 'buck']);
  });

  it('rejects a second placement of the same purchased module', () => {
    const input = fixture();
    const placements = input.project.electronicsBoard.placements;

    placements.push({ ...structuredClone(placements[0]), id: 'duplicate', position: [20, 20] });

    const projected = projectBoard(input);

    expect(projected.requirements.some((item) => item.code === 'board-mapping')).toBe(true);
    expect(projected.terminals).toHaveLength(8);
  });
});
