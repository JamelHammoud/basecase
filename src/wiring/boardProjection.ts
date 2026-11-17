import type { ElectricalInput, ElectricalProjection } from './electricalTypes';
import type { BoardPlacement, BoardProjection, BoardTerminal } from './boardTypes';
import { electricalProjection } from './electrical';
import { boardConstraints, boardRequirement } from './boardConstraints';
import { boardProduct } from './boardProducts';
import { nodeKey } from './electricalGraph';
import { validBoardDefinition, validBoardPart } from './boardValidation';
import { boardModuleId, boardMountingFindings } from './boardMounts';
import { boardHoleFindings } from './boardHoles';
import { boardHardwareFindings } from './boardHardware';

function terminalFor(
  placement: BoardPlacement,
  binding: BoardPlacement['bindings'][number],
  electrical: ElectricalProjection,
) {
  const product = boardProduct(placement.productId);
  const pad = product?.pads.find((candidate) => candidate.number === binding.pad);
  const end = electrical.endpoints.find(
    (candidate) => candidate.partId === binding.partId && candidate.port === binding.port,
  );
  const mate = product?.mates.find(
    (candidate) =>
      candidate.componentId === end?.componentId &&
      candidate.variant === end?.variant &&
      candidate.port === end?.port &&
      candidate.source === end?.map?.source,
  );
  const pin = end?.map?.pins.find((candidate) => candidate.number === binding.pin);

  if (!end || !pin || !pad || !mate || mate.pins[pad.number] !== pin.number || pad.function !== pin.function)
    return null;

  const endpoint = { reference: end.reference, pin: pin.number };
  const net = electrical.nets.find((candidate) => candidate.nodes.some((node) => nodeKey(node) === nodeKey(endpoint)));

  if (!net) return null;

  return {
    reference: `BC_${placement.id}`,
    placementId: placement.id,
    pad: pad.number,
    endpoint,
    net: net.name,
  } satisfies BoardTerminal;
}

function checkedTerminals(placement: BoardPlacement, electrical: ElectricalProjection) {
  const product = boardProduct(placement.productId);
  const numbers = new Set(placement.bindings.map((binding) => binding.pad));
  const endpoints = new Set(placement.bindings.map((binding) => JSON.stringify([binding.partId, binding.port])));
  const parts = new Set(placement.bindings.map((binding) => binding.partId));
  const required = product?.pads.filter((pad) => !pad.unused).length;

  if (
    !product ||
    numbers.size !== required ||
    numbers.size !== placement.bindings.length ||
    (product.componentId ? parts.size !== 1 : endpoints.size !== 1)
  )
    return null;

  const terminals = placement.bindings.map((binding) => terminalFor(placement, binding, electrical));

  return terminals.every((terminal) => terminal !== null) ? terminals : null;
}

function unmappedEndpoints(result: BoardProjection) {
  const covered = new Set(result.terminals.map((terminal) => nodeKey(terminal.endpoint)));
  const unmapped = result.electrical.endpoints.filter((end) =>
    (end.map?.pins ?? []).some((pin) => !covered.has(nodeKey({ reference: end.reference, pin: pin.number }))),
  );

  return unmapped.map((end) => ({
    ...boardRequirement(result.board, 'unmapped', `${end.name}: choose an evidenced board interface for ${end.port}.`),
    partIds: [...new Set([result.board.partId, ...[end.partId].filter((id): id is string => !!id)])],
    references: [end.reference],
  }));
}

function moduleOwner(placement: BoardPlacement) {
  return boardProduct(placement.productId)?.componentId ? placement.bindings[0]?.partId : undefined;
}

function projectPlacements(result: BoardProjection) {
  const identities = new Set<string>();
  const modules = new Set<string>();

  for (const placement of result.board.placements) {
    const terminals = checkedTerminals(placement, result.electrical);
    const product = boardProduct(placement.productId);
    const owner = moduleOwner(placement);

    if (placement.unplaced)
      result.requirements.push(
        boardRequirement(
          result.board,
          'fit',
          `${placement.id}: the component does not fit within the placement search limit.`,
        ),
      );

    if (!product)
      result.requirements.push(
        boardRequirement(result.board, 'geometry', `${placement.id}: restore the component’s catalog geometry.`),
      );

    if (!terminals || identities.has(placement.id) || (owner && modules.has(owner))) {
      result.requirements.push(
        boardRequirement(result.board, 'mapping', `${placement.id}: supply an exact product and pin-to-pad mapping.`),
      );

      continue;
    }

    identities.add(placement.id);
    result.terminals.push(...terminals);

    if (owner) modules.add(owner);

    if (product?.componentId && !boardModuleId(result.electrical.inputs.parts, placement))
      result.requirements.push(
        boardRequirement(result.board, 'mounting', `${placement.id}: restore the component’s catalog geometry.`),
      );

    if (product?.unresolved)
      result.requirements.push(boardRequirement(result.board, 'mounting', `${placement.id}: ${product.unresolved}`));
  }
}

export function projectBoard(input: ElectricalInput): BoardProjection {
  const board = input.project.electronicsBoard;

  if (!board) throw new Error('Board definition is required.');

  if (!validBoardDefinition(board)) throw new Error('Repair the board definition before placement.');

  const electrical = electricalProjection(input);
  const part = input.parts.find((candidate) => candidate.id === board.partId) ?? null;
  const result: BoardProjection = { board, part, electrical, terminals: [], requirements: [] };

  projectPlacements(result);

  if (!part || !validBoardPart(part)) {
    result.requirements.push(boardRequirement(board, 'geometry', 'Restore the board’s rectangular solid.'));

    return result;
  }

  result.requirements.push(
    ...boardConstraints(board, part),
    ...boardHoleFindings(board, part),
    ...boardMountingFindings(input.parts, board),
    ...boardHardwareFindings(input.parts, board),
    ...unmappedEndpoints(result),
  );

  if (result.terminals.length)
    result.requirements.push(boardRequirement(board, 'unrouted', 'Route the board’s copper connections in KiCad.'));

  return result;
}
