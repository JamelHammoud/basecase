import { inspectRoutedBoard } from './boardRoutingInspection';
import { electricalProjection } from './electrical';
import type { ElectricalInput } from './electricalTypes';
import { mergeElectricalRequirements } from './electricalRequirements';

export async function inspectElectricalInput(input: ElectricalInput) {
  if (input.project.electronicsBoard?.routed) return inspectRoutedBoard(input);

  if (!input.project.electronicsBoard) {
    const { requirements, powerBudget } = electricalProjection(input);

    return { requirements, powerBudget };
  }

  const { projectBoard } = await import('./boardProjection');
  const { prepareBoardGeometry } = await import('./boardPreparation');
  const board = projectBoard(input);
  const geometry = await prepareBoardGeometry(input);

  return {
    board: true,
    requirements: mergeElectricalRequirements(board.electrical.requirements, board.requirements, geometry.requirements),
    powerBudget: board.electrical.powerBudget,
    metrics: { geometryMs: geometry.durationMs, geometryBytes: geometry.bytes },
  };
}
