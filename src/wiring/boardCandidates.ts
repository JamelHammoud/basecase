import type { ElectricalInput } from './electricalTypes';
import type { BoardPlacement, BoardProduct } from './boardTypes';
import { BOARD_PRODUCTS } from './boardProducts';
import { electricalProjection } from './electrical';

function moduleBindings(partId: string, product: BoardProduct) {
  return product.pads
    .filter((pad) => !pad.unused)
    .map((pad) => {
      const pin = pad.number.split('_')[0].replace(/\d$/, '');

      return { pad: pad.number, partId, port: pin === 'VOUT' ? 'power-out' : 'power-in', pin };
    });
}

export function boardPlacements(input: ElectricalInput): BoardPlacement[] {
  const electrical = electricalProjection(input);
  const modules = input.parts.flatMap((part) => {
    const product = BOARD_PRODUCTS.find(
      (candidate) => candidate.componentId && candidate.componentId === part.componentId,
    );

    return product
      ? [{ id: `module_${part.id}`, productId: product.id, bindings: moduleBindings(part.id, product) }]
      : [];
  });
  const connectors = electrical.endpoints.flatMap((end) => {
    const product = BOARD_PRODUCTS.find(
      (candidate) =>
        !candidate.componentId &&
        candidate.mates.some(
          (mate) =>
            mate.componentId === end.componentId &&
            mate.variant === end.variant &&
            mate.port === end.port &&
            end.port === 'bus-in',
        ),
    );

    if (!product || !end.partId) return [];

    return [
      {
        id: `connector_${end.partId}`,
        productId: product.id,
        bindings: product.pads.map((pad) => ({
          pad: pad.number,
          partId: end.partId!,
          port: end.port,
          pin: pad.number,
        })),
      },
    ];
  });

  return [...modules, ...connectors].map((item) => ({ ...item, position: [0, 0], rotation: 0, locked: false }));
}
