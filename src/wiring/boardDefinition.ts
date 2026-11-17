import type { ScenePart } from '../types/robotics';
import type { ElectricalInput } from './electricalTypes';
import type { ElectronicsBoard } from './boardTypes';
import { placeBoard } from './boardPlacement';
import { boardPlacements } from './boardCandidates';
import { boardHardware } from './boardHardware';

export function defineBoard(input: ElectricalInput, id: string) {
  const part: ScenePart = {
    id,
    name: 'Electronics board',
    kind: 'box',
    category: 'structure',
    role: 'solid',
    position: [0, 60, 0],
    rotation: [0, 0, 0],
    dimensions: { width: 100, depth: 80, height: 1.6 },
    color: '#1f6b3a',
    note: '',
    visible: true,
    locked: false,
    mechanicalTag: 'Off-the-shelf COTS',
  };
  const board: ElectronicsBoard = {
    schema: 1,
    partId: id,
    outline: 'rectangle',
    side: 'top',
    heightMm: { top: 30, bottom: 10 },
    edgeClearanceMm: 1,
    holes: [
      [-44, -34],
      [44, -34],
      [44, 34],
      [-44, 34],
    ].map((position, i) => ({
      id: `mount${i + 1}`,
      position: position as [number, number],
      diameterMm: 3.2,
      keepoutMm: 2,
      mountingParts: { screw: `${id}_mount${i + 1}_screw`, spacer: `${id}_mount${i + 1}_spacer` },
    })),
    keepouts: [],
    placements: boardPlacements(input),
  };
  const placed = placeBoard({
    ...input,
    parts: [...input.parts, part],
    project: { ...input.project, electronicsBoard: board },
  });

  return { part, board: placed.board, hardwareParts: boardHardware(placed.board) };
}
