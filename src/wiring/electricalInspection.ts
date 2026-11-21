import { POWER_REPLAY_LIMITS } from './powerReplayTypes';
import { replayCables } from './powerReplayPreparation';
import { isElectricalPart } from './electricalSnapshot';
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

export function inspectReplayInput(input: ElectricalInput) {
  const projection = electricalProjection(input);
  const trace = input.walk?.motorTrace;

  if (!trace || !validReplayTrace(trace))
    throw new Error('Capture modeled current with Verify Design and a trained walk policy.');

  const motorIds = new Set(trace.channels.flatMap((channel) => channel.actuatorIds));
  const sourceId = projection.wiring.power.source?.id;

  return {
    cables: replayCables(projection),
    trace,
    sourceVolts: projection.powerBudget?.sourceNominalV ?? null,
    loads: input.parts
      .filter((part) => isElectricalPart(part) && !motorIds.has(part.id) && part.id !== sourceId)
      .map((part) => ({ id: part.id, name: part.name })),
  };
}

function validReplayTrace(trace: NonNullable<NonNullable<ElectricalInput['walk']>['motorTrace']>) {
  if (
    trace.schema !== 1 ||
    trace.method !== 'servo-amps-1' ||
    !Number.isFinite(trace.windowS) ||
    trace.windowS <= 0 ||
    !Array.isArray(trace.channels) ||
    !trace.channels.length ||
    trace.channels.length > POWER_REPLAY_LIMITS.loads
  )
    return false;

  return trace.channels.every(
    (channel) =>
      Array.isArray(channel.amps) &&
      channel.amps.length > 0 &&
      channel.amps.length <= POWER_REPLAY_LIMITS.samples &&
      channel.amps.every((value) => Number.isFinite(value) && value >= 0),
  );
}
