import { DoubleSide, Ray, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { electricalScenes } from './electricalFixtures';
import { defineBoard } from './boardDefinition';
import { boardDrills, boardHoles, boardHoleFindings } from './boardHoles';
import { boardSolid } from './boardGeometry';
import { projectBoard } from './boardProjection';
import { boardPcb } from './boardPcb';

function fixture() {
  const scene = electricalScenes().find((entry) => entry.name === 'battery-rover')!.scene;

  return { scene, ...defineBoard(scene, 'board') };
}

describe('carrier mounting holes', () => {
  it('retains source module bores in the carrier mesh and footprint', () => {
    const { scene, part, board } = fixture();
    const holes = boardHoles(board);
    const solid = boardSolid(part, board);

    try {
      expect(holes).toHaveLength(7);

      expect(boardDrills(board)).toHaveLength(19);

      for (const hole of boardDrills(board)) {
        const ray = new Ray(new Vector3(hole.position[0], 10, hole.position[1]), new Vector3(0, -1, 0));

        expect(solid.bvh.raycast(ray, DoubleSide)).toEqual([]);
      }

      const pcb = boardPcb(
        projectBoard({
          ...scene,
          parts: [...scene.parts, part],
          project: { ...scene.project, electronicsBoard: board },
        }),
      );

      expect(pcb['Robot.pretty/Pololu_D36V50F6.kicad_mod'].match(/np_thru_hole/g)).toHaveLength(3);
      expect(pcb['robot.kicad_pcb'].match(/np_thru_hole/g)).toHaveLength(7);
    } finally {
      solid.dispose();
    }
  });

  it.each(['outside', 'overlap'] as const)('blocks %s holes before measuring the board solid', (fault) => {
    const { part, board } = fixture();

    if (fault === 'outside') board.holes[0].position[0] = 50;

    if (fault === 'overlap') board.holes[0].position = [...board.holes[1].position];

    expect(boardHoleFindings(board, part).some((item) => item.code === 'board-hole')).toBe(true);
  });

  it('follows side and rotation when projecting asymmetric module mounting holes', () => {
    const { board } = fixture();

    board.side = 'bottom';
    board.placements[0].position = [10, 20];
    board.placements[0].rotation = 90;

    expect(
      boardHoles(board)
        .slice(4)
        .map((hole) => hole.position),
    ).toEqual([
      [20.5, 9.5],
      [20.5, 30.5],
      [-0.5, 30.5],
    ]);
  });
});
