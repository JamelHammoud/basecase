import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { box } from '../sim/fixtures/parts';
import { electricalScenes } from './electricalFixtures';
import { defineBoard } from './boardDefinition';
import { boardComponents, boardSelection } from './boardComponents';
import { partMatrix } from '../utils/kinematicsMotion';

describe('sourced board component geometry', () => {
  it.each(['top', 'bottom'] as const)('keeps the header pin row in the board frame on the %s side', (side) => {
    const scene = electricalScenes().find((entry) => entry.name === 'dual-bus-arm')!.scene;
    const { board } = defineBoard(scene, 'board');
    const host = box('board', [10, 40, -20], [100, 1.6, 80], 5);

    board.side = side;
    host.rotation = [17, 34, 56];

    for (const rotation of [0, 90, 180, 270] as const) {
      board.placements[0].position = [10, 15];
      board.placements[0].rotation = rotation;

      const header = boardComponents(host, board)[0];
      const pin = new Vector3(-2.5, -1.4, -0.3).applyMatrix4(partMatrix(header));
      const expected = new Vector3(10, (side === 'top' ? 1 : -1) * 0.8, 15).applyMatrix4(partMatrix(host));

      expect(pin.distanceTo(expected)).toBeLessThan(0.00001);
      expect(header.componentId).toBe('jst-b3b-eh-a');
      expect(boardSelection(header.id, board)).toBe('board');
      expect(partMatrix(header).determinant()).toBeCloseTo(new Matrix4().determinant());
    }
  });
});
