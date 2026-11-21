import type { BoardHole, BoardPlacement, BoardProduct, BoardProjection } from './boardTypes';
import { boardProduct } from './boardProducts';
import { electricalUuid } from './electricalSchematic';
import { placedArea } from './boardCoordinates';
import { validBoardPart } from './boardValidation';

const q = (value: string) => JSON.stringify(value);
const layerFor = (side: 'top' | 'bottom', type: string) => q(`${side === 'top' ? 'F' : 'B'}.${type}`);
const pcbNet = (name: string) => (name.startsWith('unconnected-(') ? name : `/${name}`);
const unusedNet = (reference: string, pad: string) => `unconnected-(${reference}-Pad${pad})`;

function holePad(hole: BoardHole, bottom = false, angle = 0) {
  const position = [hole.position[0], (bottom ? -1 : 1) * hole.position[1]];

  return `(pad "" np_thru_hole circle (at ${position.join(' ')} ${angle}) (size ${hole.diameterMm} ${hole.diameterMm}) (drill ${hole.diameterMm}) (layers "*.Cu" "*.Mask"))`;
}

function courtyard(product: BoardProduct, layer: string, bottom = false) {
  const { min, max } = placedArea(
    { id: '', productId: product.id, position: [0, 0], rotation: 0, locked: false, bindings: [] },
    product.courtyard,
    bottom ? 'bottom' : 'top',
  );

  return `(fp_rect (start ${min.join(' ')}) (end ${max.join(' ')}) (stroke (width 0.05) (type default)) (fill none) (layer ${layer}))`;
}

function footprint(
  product: BoardProduct,
  placement: BoardPlacement,
  result: BoardProjection,
  nets: Map<string, number>,
) {
  const reference = `BC_${placement.id}`;
  const side = result.board.side;
  const layer = layerFor(side, 'Cu');
  const angle = -placement.rotation;
  const mirror = side === 'bottom' ? '(justify mirror)' : '';
  const pads = product.pads.map((pad) => {
    const terminal = result.terminals.find(
      (candidate) => candidate.placementId === placement.id && candidate.pad === pad.number,
    );
    const name = terminal?.net ?? unusedNet(reference, pad.number);
    const net = `(net ${nets.get(name)} ${q(pcbNet(name))})`;
    const position = [pad.position[0], (side === 'top' ? 1 : -1) * pad.position[1]];

    return `(pad ${q(pad.number)} thru_hole circle (at ${position.join(' ')} ${angle}) (size ${pad.diameterMm} ${pad.diameterMm}) (drill ${pad.drillMm}) (layers "*.Cu" "*.Mask") ${net})`;
  });

  return `(footprint ${q(`Robot:${product.footprint}`)} (layer ${layer})
    (uuid ${electricalUuid(`board:${placement.id}`)})
    (at ${placement.position.join(' ')} ${angle}) ${placement.locked ? '(locked yes)' : ''}
    (property "Reference" ${q(reference)} (at 0 -4 ${angle}) (layer ${layerFor(side, 'Fab')}) (effects (font (size 1 1) (thickness 0.15)) ${mirror}))
    (property "Value" ${q(product.mpn)} (at 0 4 ${angle}) (layer ${layerFor(side, 'Fab')}) (effects (font (size 1 1) (thickness 0.15)) ${mirror}))
    (property "Datasheet" ${q(product.source)} (at 0 0 0) (layer ${layerFor(side, 'Fab')}) (hide yes) (effects (font (size 1 1) (thickness 0.15))))
    (path ${q(`/${electricalUuid('robot')}/${electricalUuid(reference)}`)})
    (attr through_hole exclude_from_bom) ${courtyard(product, layerFor(side, 'CrtYd'), side === 'bottom')} ${pads.join('\n')}
    ${(product.mounting ?? []).map((hole) => holePad(hole, side === 'bottom', angle)).join('\n')})`;
}

function mountingHoles(result: BoardProjection) {
  return result.board.holes.map(
    (hole) => `(footprint "Robot:MountingHole_${hole.diameterMm}" (layer "F.Cu")
    (uuid ${electricalUuid(`hole:${hole.id}`)}) (at ${hole.position.join(' ')})
    (property "Reference" ${q(`H_${hole.id}`)} (at 0 0 0) (layer "F.Fab") (hide yes) (effects (font (size 1 1) (thickness 0.15))))
    (attr exclude_from_pos_files exclude_from_bom board_only)
    (pad "" np_thru_hole circle (at 0 0) (size ${hole.diameterMm} ${hole.diameterMm}) (drill ${hole.diameterMm}) (layers "*.Cu" "*.Mask")))`,
  );
}

function localFootprint(product: BoardProduct) {
  const pads = product.pads.map(
    (pad) =>
      `(pad ${q(pad.number)} thru_hole circle (at ${pad.position.join(' ')}) (size ${pad.diameterMm} ${pad.diameterMm}) (drill ${pad.drillMm}) (layers "*.Cu" "*.Mask"))`,
  );

  return `(footprint ${q(product.footprint)} (version 20241229) (generator "pcbnew") (layer "F.Cu")
    (descr ${q(product.sourceLocator)}) (attr through_hole) ${courtyard(product, '"F.CrtYd"')} ${pads.join('\n')}
    ${(product.mounting ?? []).map((hole) => holePad(hole)).join('\n')})\n`;
}

export function boardPcb(result: BoardProjection): Record<string, string> {
  if (!result.part || !validBoardPart(result.part)) return {};

  const { width, depth, height } = result.part.dimensions;
  const netNumbers = new Map(result.electrical.nets.map((net, index) => [net.name, index + 1]));

  for (const placement of result.board.placements) {
    const product = boardProduct(placement.productId);

    for (const pad of product?.pads.filter((candidate) => candidate.unused) ?? [])
      netNumbers.set(unusedNet(`BC_${placement.id}`, pad.number), netNumbers.size + 1);
  }

  const nets = [...netNumbers].map(([name, number]) => `(net ${number} ${q(pcbNet(name))})`);
  const outline = [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [width / 2, depth / 2],
    [-width / 2, depth / 2],
  ];
  const edges = outline.map(
    (start, index) =>
      `(gr_line (start ${start.join(' ')}) (end ${outline[(index + 1) % outline.length].join(' ')}) (stroke (width 0.05) (type default)) (layer "Edge.Cuts") (uuid ${electricalUuid(`edge:${index}`)}))`,
  );
  const products = new Map<string, BoardProduct>();
  const footprints = result.board.placements.flatMap((placement) => {
    const product = boardProduct(placement.productId);

    if (!product || !result.terminals.some((terminal) => terminal.placementId === placement.id)) return [];

    products.set(product.id, product);

    return [footprint(product, placement, result, netNumbers)];
  });

  return {
    'robot.kicad_pcb': `(kicad_pcb (version 20241229) (generator "pcbnew") (general (thickness ${height})) (paper "A4")
      (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (36 "B.SilkS" user "b.silkscreen") (37 "F.SilkS" user "f.silkscreen") (38 "B.Mask" user) (39 "F.Mask" user) (44 "Edge.Cuts" user) (46 "B.CrtYd" user "b.courtyard") (47 "F.CrtYd" user "f.courtyard") (48 "B.Fab" user) (49 "F.Fab" user))
      (setup (pad_to_mask_clearance 0)) (net 0 "") ${nets.join('\n')}
      ${edges.join('\n')} ${mountingHoles(result).join('\n')} ${footprints.join('\n')})\n`,
    'fp-lib-table':
      '(fp_lib_table (version 7) (lib (name "Robot") (type "KiCad") (uri "${KIPRJMOD}/Robot.pretty") (options "") (descr "Robot board footprints")))\n',
    ...Object.fromEntries(
      [...products.values()].map((product) => [`Robot.pretty/${product.footprint}.kicad_mod`, localFootprint(product)]),
    ),
    ...Object.fromEntries(
      result.board.holes.map((hole) => [
        `Robot.pretty/MountingHole_${hole.diameterMm}.kicad_mod`,
        `(footprint "MountingHole_${hole.diameterMm}" (version 20241229) (generator "pcbnew") (layer "F.Cu") (attr board_only exclude_from_pos_files exclude_from_bom) (pad "" np_thru_hole circle (at 0 0) (size ${hole.diameterMm} ${hole.diameterMm}) (drill ${hole.diameterMm}) (layers "*.Cu" "*.Mask")))\n`,
      ]),
    ),
  };
}
