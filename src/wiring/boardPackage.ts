import { BOARD_PRODUCTS } from './boardProducts';
import { projectBoard } from './boardProjection';
import { boardSchematic } from './boardSchematic';
import { boardPcb } from './boardPcb';
import { electricalSourceJson } from './electricalSource';
import type { ElectricalInput } from './electricalTypes';
import { mergeElectricalRequirements } from './electricalRequirements';

export async function boardPackage(input: ElectricalInput) {
  if (!input.project.electronicsBoard) return null;

  const { prepareBoardGeometry } = await import('./boardPreparation');
  const board = projectBoard(input);
  const geometry = await prepareBoardGeometry(input);

  board.requirements = mergeElectricalRequirements(board.requirements, geometry.requirements);

  const report = { board: board.board, terminals: board.terminals, requirements: board.requirements };

  return {
    electrical: board.electrical,
    schematic: boardSchematic(board),
    source: {
      boardProducts: BOARD_PRODUCTS,
      boardGeometry: geometry.evidence,
      ...(board.board.fabrication ? { fabrication: board.board.fabrication } : {}),
      ...(board.board.routing ? { routing: board.board.routing } : {}),
    },
    report,
    files: {
      ...boardPcb(board),
      'placement.json': electricalSourceJson({ ...report, geometry: geometry.evidence }, 2),
    },
    readme:
      'Incomplete editable board placement. Read requirements.json and placement.json before connecting hardware.\nCopper is unrouted. KiCad DRC has not run on this export. Checks in Basecase remains the build verdict.\nOff-board devices stay in the schematic and source report. Only checked board terminals have PCB footprints.\nNo fabrication files or measured electrical performance are included.\nUse KiCad 9.0.6: kicad-cli pcb drc robot.kicad_pcb --schematic-parity --format json --output drc.json\n',
  };
}
