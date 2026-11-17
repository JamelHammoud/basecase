import type { ScenePart } from '../types/robotics';
import type { ElectronicsBoard } from './boardTypes';
import { boardSolid } from './boardGeometry';
import { validBoardDefinition, validBoardPart } from './boardValidation';
import { boardComponents } from './boardComponents';

export interface BoardPreview {
  positions: Float32Array<ArrayBuffer>;
  indices: Uint32Array<ArrayBuffer>;
  baseSize: [number, number, number];
  components: ScenePart[];
  durationMs: number;
}

export function boardPreview({ part, board }: { part: ScenePart; board: ElectronicsBoard }): BoardPreview {
  if (!validBoardDefinition(board) || !validBoardPart(part)) throw new Error('Restore the board’s rectangular solid.');

  const start = performance.now();
  const solid = boardSolid(part, board);

  try {
    return {
      positions: solid.positions.slice(),
      indices: Uint32Array.from({ length: solid.positions.length / 3 }, (_, i) => i),
      baseSize: [part.dimensions.width, part.dimensions.height, part.dimensions.depth],
      components: boardComponents(part, board),
      durationMs: performance.now() - start,
    };
  } finally {
    solid.dispose();
  }
}
