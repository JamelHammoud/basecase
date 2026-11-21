import type { BoardProjection } from './boardTypes';
import type { ElectricalEndpoint } from './electricalTypes';
import { boardProduct } from './boardProducts';

export function boardSchematic(board: BoardProjection) {
  const electrical = structuredClone(board.electrical);

  electrical.endpoints.forEach((end) => {
    end.offBoard = true;
  });

  for (const placement of board.board.placements) {
    const terminals = board.terminals.filter((terminal) => terminal.placementId === placement.id);
    const product = boardProduct(placement.productId);

    if (!product || !terminals.length) continue;

    const endpoint: ElectricalEndpoint = {
      reference: `BC_${placement.id}`,
      partId: board.board.partId,
      componentId: null,
      variant: null,
      name: product.mpn,
      port: placement.id,
      footprint: product.footprint,
      map: {
        port: placement.id,
        connector: product.mpn,
        source: product.source,
        sourceLocator: product.sourceLocator,
        unused: Object.fromEntries(product.pads.filter((pad) => pad.unused).map((pad) => [pad.number, pad.unused!])),
        pins: product.pads.map((pad) => ({
          number: pad.number,
          name: pad.number,
          function: pad.function,
          direction: 'passive',
        })),
      },
    };

    electrical.endpoints.push(endpoint);

    for (const terminal of terminals) {
      electrical.nets
        .find((net) => net.name === terminal.net)!
        .nodes.push({ reference: endpoint.reference, pin: terminal.pad });
    }
  }

  return electrical;
}
